# Maintainers

Instructions for developing and releasing this action.

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