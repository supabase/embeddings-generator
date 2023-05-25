# Supabase Embeddings Generator

A GitHub Action to automatically convert your markdown files into embeddings, and store them in your Postgres databases.

## Usage

This GitHub Action works with Supabase Vector to process your knowledge base and store them as embeddings in your Supabase Database allowing you to perform vector similarity search.

This action is a companion to the [`headless-vector-search`](https://github.com/supabase/headless-vector-search) repo, which is used to store and retrieve the embeddings using [OpenAI](https://openai.com) and [Supabase](https://supabase.com)


In your knowledge base repository, create a new action called `.github/workflows/generate_embeddings.yml` with the following content:

```yml
name: 'generate_embeddings'
on: # run on main branch changes
  push:
    branches:
      - main

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: supabase/supabase-vector-embeddings-github-action@v0.0.1
        with:
          supabase-url: 'https://your-project-ref.supabase.co'
          supabase-service-role-key: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          openai-key: ${{ secrets.OPENAI_KEY }}
          docs-root-path: 'docs' # the path to the root of your md(x) files
```

Make sure to set `SUPABASE_SERVICE_ROLE_KEY`, and `OPENAI_KEY` as repository secrets in your repo settings (settings > secrets > actions).

See the instructions in the [`headless-vector-search`](https://github.com/supabase/headless-vector-search) for more information on how to query your database.

## Develop

```bash
npm install
npm run package
```

## Publish

- Update the version in [package.json](package.json)
- Make sure `/dist` is up to date: `npm run package`
- Commit the version update: `git commit -a -m "Update to version x.x.x"`
- Push a new tag

```bash
git tag -a -m "Update to version x.x.x" vx.x.x
git push --follow-tags
```
