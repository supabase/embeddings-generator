# Supabase Vector Embeddings Generator GitHub Action

## Use

For docs on using the GitHub action, read [/docs/generate_embeddings.md](/docs/generate_embeddings.md)

## Develop

```bash
npm install
npm run package
```

## Publish

- Make sure `/dist` is up to date: `npm run package`
- Update the version in [package.json](package.json)
- Commit the version update: `git commit -m -a "Update to version x.x.x"`
- Push a new tag

```bash
git tag -a -m "Update to version x.x.x" vx.x.x
git push --follow-tags
```
