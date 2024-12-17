import * as core from '@actions/core'
import {createClient} from '@supabase/supabase-js'
import 'openai'
import {Configuration, OpenAIApi} from 'openai'
import {inspect} from 'util'
import {v4 as uuidv4} from 'uuid'
import {MarkdownSource} from './sources/markdown'
import {walk} from './sources/util'

async function generateEmbeddings({
  shouldRefresh = false,
  supabaseUrl,
  supabaseServiceKey,
  openaiKey,
  docsRootPath
}: {
  shouldRefresh?: boolean
  supabaseUrl: string
  supabaseServiceKey: string
  openaiKey: string
  docsRootPath: string
}) {
  const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
    db: {schema: 'docs'},
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  })

  // Use this version to track which pages to purge
  // after the refresh
  const refreshVersion = uuidv4()

  const refreshDate = new Date()

  const ignoredFiles = ['pages/404.mdx']
  const embeddingSources = (await walk(docsRootPath))
    .filter(({path}) => /\.mdx?$/.test(path))
    .filter(({path}) => !ignoredFiles.includes(path))
    .map(entry => new MarkdownSource('markdown', entry.path))

  console.log(`Discovered ${embeddingSources.length} pages`)

  if (!shouldRefresh) {
    console.log('Checking which pages are new or have changed')
  } else {
    console.log('Refresh flag set, re-generating all pages')
  }

  for (const embeddingSource of embeddingSources) {
    const {type, source, path, parentPath} = embeddingSource

    try {
      const {checksum, meta, sections} = await embeddingSource.load()

      // Check for existing page in DB and compare checksums
      const {error: fetchPageError, data: existingPage} = await supabaseClient
        .from('page')
        .select('id, path, checksum, parentPage:parent_page_id(id, path)')
        .filter('path', 'eq', path)
        .limit(1)
        .maybeSingle()

      if (fetchPageError) {
        throw fetchPageError
      }

      type Singular<T> = T extends any[] ? undefined : T

      // We use checksum to determine if this page & its sections need to be regenerated
      if (!shouldRefresh && existingPage?.checksum === checksum) {
        const existingParentPage = existingPage.parentPage as Singular<
          typeof existingPage.parentPage
        >

        // If parent page changed, update it
        //@ts-expect-error TS2531: Object is possibly 'null'.
        if (existingParentPage && existingParentPage?.path !== parentPath) {
          console.log(
            `[${path}] Parent page has changed. Updating to '${parentPath}'...`
          )
          const {error: fetchParentPageError, data: parentPage} =
            await supabaseClient
              .from('page')
              .select()
              .filter('path', 'eq', parentPath)
              .limit(1)
              .maybeSingle()

          if (fetchParentPageError) {
            throw fetchParentPageError
          }

          const {error: updatePageError} = await supabaseClient
            .from('page')
            .update({parent_page_id: parentPage?.id})
            .filter('id', 'eq', existingPage.id)

          if (updatePageError) {
            throw updatePageError
          }
        }

        // No content/embedding update required on this page
        // Update other meta info
        const {error: updatePageError} = await supabaseClient
          .from('page')
          .update({
            type,
            source,
            meta,
            version: refreshVersion,
            last_refresh: refreshDate
          })
          .filter('id', 'eq', existingPage.id)

        if (updatePageError) {
          throw updatePageError
        }

        continue
      }

      if (existingPage) {
        if (!shouldRefresh) {
          console.log(
            `[${path}] Docs have changed, removing old page sections and their embeddings`
          )
        } else {
          console.log(
            `[${path}] Refresh flag set, removing old page sections and their embeddings`
          )
        }

        const {error: deletePageSectionError} = await supabaseClient
          .from('page_section')
          .delete()
          .filter('page_id', 'eq', existingPage.id)

        if (deletePageSectionError) {
          throw deletePageSectionError
        }
      }

      const {error: fetchParentPageError, data: parentPage} =
        await supabaseClient
          .from('page')
          .select()
          .filter('path', 'eq', parentPath)
          .limit(1)
          .maybeSingle()

      if (fetchParentPageError) {
        throw fetchParentPageError
      }

      // Create/update page record. Intentionally clear checksum until we
      // have successfully generated all page sections.
      const {error: upsertPageError, data: page} = await supabaseClient
        .from('page')
        .upsert(
          {
            checksum: null,
            path,
            type,
            source,
            meta,
            parent_page_id: parentPage?.id,
            version: refreshVersion,
            last_refresh: refreshDate
          },
          {onConflict: 'path'}
        )
        .select()
        .limit(1)
        .single()

      if (upsertPageError) {
        throw upsertPageError
      }

      console.log(
        `[${path}] Adding ${sections.length} page sections (with embeddings)`
      )
      for (const {slug, heading, content} of sections) {
        // OpenAI recommends replacing newlines with spaces for best results (specific to embeddings)
        const input = content.replace(/\n/g, ' ')

        try {
          const configuration = new Configuration({
            apiKey: openaiKey
          })
          const openai = new OpenAIApi(configuration)

          const embeddingResponse = await openai.createEmbedding({
            model: 'text-embedding-ada-002',
            input
          })

          if (embeddingResponse.status !== 200) {
            throw new Error(inspect(embeddingResponse.data, false, 2))
          }

          const [responseData] = embeddingResponse.data.data

          const {error: insertPageSectionError, data: pageSection} =
            await supabaseClient
              .from('page_section')
              .insert({
                page_id: page.id,
                slug,
                heading,
                content,
                token_count: embeddingResponse.data.usage.total_tokens,
                embedding: responseData.embedding
              })
              .select()
              .limit(1)
              .single()

          if (insertPageSectionError) {
            throw insertPageSectionError
          }
        } catch (err) {
          // TODO: decide how to better handle failed embeddings
          console.error(
            `Failed to generate embeddings for '${path}' page section starting with '${input.slice(
              0,
              40
            )}...'`
          )

          throw err
        }
      }

      // Set page checksum so that we know this page was stored successfully
      const {error: updatePageError} = await supabaseClient
        .from('page')
        .update({checksum})
        .filter('id', 'eq', page.id)

      if (updatePageError) {
        throw updatePageError
      }
    } catch (err) {
      console.error(
        `Page '${path}' or one/multiple of its page sections failed to store properly. Page has been marked with null checksum to indicate that it needs to be re-generated.`
      )
      console.error(err)
    }
  }

  console.log(`Removing old pages and their sections`)

  // Delete pages that have been removed (and their sections via cascade)
  const {error: deletePageError} = await supabaseClient
    .from('page')
    .delete()
    .filter('version', 'neq', refreshVersion)

  if (deletePageError) {
    throw deletePageError
  }

  console.log('Embedding generation complete')
}

async function run(): Promise<void> {
  try {
    const supabaseUrl: string = core.getInput('supabase-url')
    const supabaseServiceKey: string = core.getInput(
      'supabase-service-role-key'
    )
    const openaiKey: string = core.getInput('openai-key')
    const docsRootPath: string = core.getInput('docs-root-path')
    await generateEmbeddings({
      supabaseUrl,
      supabaseServiceKey,
      openaiKey,
      docsRootPath
    })
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
