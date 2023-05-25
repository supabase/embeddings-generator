# Generating Embeddings with this GitHub Action

This GitHub Action works with Supabase Vector to process your knowledge base and store them as embeddings in your Supabase Database allowing you to perform vector similarity search via RPC from supabase-js.

## Prerequesites

To run this GitHub action, you will need apply the following migration on your Supabase Database. This is something you can do via the Supabase CLI.

This migration will create a new schema called `docs` with two tables `page` and `page_section`, as well as two Database functions called `match_page_sections` and `get_page_parents`.

```sql
-- Create separate docs schema and grants
create schema if not exists docs;
grant usage on schema docs to postgres, service_role;

-- Enable pgvector extension
create extension if not exists vector;

-- Create tables
create table "docs"."page" (
  id bigserial primary key,
  parent_page_id bigint references docs.page,
  path text not null unique,
  checksum text,
  meta jsonb,
  type text,
  source text,
  "version" uuid,
  "last_refresh" timestamptz
);
alter table "docs"."page" enable row level security;

create table "docs"."page_section" (
  id bigserial primary key,
  page_id bigint not null references docs.page on delete cascade,
  content text,
  token_count int,
  embedding vector(1536),
  slug text,
  heading text
);
alter table "docs"."page_section" enable row level security;

-- Create embedding similarity search functions
create or replace function "docs"."match_page_sections"(embedding vector(1536), match_threshold float, match_count int, min_content_length int)
returns table (id bigint, page_id bigint, slug text, heading text, content text, similarity float)
language plpgsql
as $$
#variable_conflict use_variable
begin
  return query
  select
    page_section.id,
    page_section.page_id,
    page_section.slug,
    page_section.heading,
    page_section.content,
    (page_section.embedding <#> embedding) * -1 as similarity
  from page_section

  -- We only care about sections that have a useful amount of content
  where length(page_section.content) >= min_content_length

  -- The dot product is negative because of a Postgres limitation, so we negate it
  and (page_section.embedding <#> embedding) * -1 > match_threshold

  -- OpenAI embeddings are normalized to length 1, so
  -- cosine similarity and dot product will produce the same results.
  -- Using dot product which can be computed slightly faster.
  --
  -- For the different syntaxes, see https://github.com/pgvector/pgvector
  order by page_section.embedding <#> embedding

  limit match_count;
end;
$$;

create or replace function "docs"."get_page_parents"(page_id bigint)
returns table (id bigint, parent_page_id bigint, path text, meta jsonb)
language sql
as $$
  with recursive chain as (
    select *
    from docs.page
    where id = page_id

    union all

    select child.*
      from docs.page as child
      join chain on chain.parent_page_id = child.id
  )
  select id, parent_page_id, path, meta
  from chain;
$$;

-- Update table grants
ALTER DEFAULT PRIVILEGES IN SCHEMA docs
GRANT ALL ON TABLES TO postgres, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
ON ALL TABLES IN SCHEMA docs
TO postgres, service_role;

GRANT USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA docs
TO postgres, service_role;
```

## How to use the GitHub Action

In your knowledge base resporitory, create a new action called `.github/workflows/generate_embeddings.yml` with the following content:

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

## Making queries

You can now query your knowledge base and generate ChatGPT like response streams by using the `match_page_sections` RPC in combination with the OpenAI text completion API. You can find an example of this here: https://github.com/supabase-community/headless-supabase-vector-search
