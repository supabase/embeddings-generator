# Supabase Embeddings Generator

A GitHub Action that converts your markdown files into embeddings and stores them in your Postgres/Supabase database, allowing you to perform vector similarity search inside your documentation and website.

This action is a companion to the [`headless-vector-search`](https://github.com/supabase/headless-vector-search) repo, which is used to store and retrieve the embeddings using [OpenAI](https://openai.com) and [Supabase](https://supabase.com).

## Usage

You can find this action on the [GitHub Marketplace](https://github.com/marketplace/actions/supabase-embeddings-generator).

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
      - uses: supabase/embeddings-generator@v0.x.x # Find the latest version in the Marketplace
        with:
          supabase-url: 'https://your-project-ref.supabase.co'
          supabase-service-role-key: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          openai-key: ${{ secrets.OPENAI_KEY }}
          docs-root-path: 'docs' # the path to the root of your md(x) files
```

Make sure to set `SUPABASE_SERVICE_ROLE_KEY`, and `OPENAI_KEY` as repository secrets in your repo settings (settings > secrets > actions).

See the instructions in the [`headless-vector-search`](https://github.com/supabase/headless-vector-search) for more information on how to query your database from your website.

## Developers

See details in [MAINTAINERS.md](https://github.com/supabase/embeddings-generator/blob/main/MAINTAINERS.md)

## License

[MIT](https://github.com/supabase/embeddings-generator/blob/main/LICENSE)