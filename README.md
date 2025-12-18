# Midnight Software Development Kit ("SDK")

Components for building tools and frameworks that support the Midnight blockchain.

## Structure

This repository is organized as a _multiroot workspace_, with each child folder containing the source code
and build assets to build each particular SDK component. The repository root also contains a file named
'`midnight-sdk-code-workspace`' that can be used with Microsoft VSCode to open and manage the repository
as a multiroot workspace.

The following components are present:

| Workspace | Folder | |
|-----------|--------|-|
| Platform.js | `'./platform-js'` | [README.md](./platform-js/README.md) |
| Compact.js  | `'./compact-js'`  | [README.md](./compact-js/README.md)  |


## Contributing

All new features must branch off the default branch `main`.

It's recommended to enable automatic `eslint` formatting in your text editor upon save, in order to avoid CI errors due to incorrect format.

### Commit Message Format

This project uses [Conventional Commits](https://www.conventionalcommits.org/). Please format your commit messages as:

```
<type>[optional scope]: <description>
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, `revert`
**Scopes:** `compact-js`, `platform-js`

### Making Commits

```bash
# Interactive commit (recommended)
yarn commit

# Manual commit
git commit -m "feat(compact-js): add new feature"
```