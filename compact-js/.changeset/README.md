# Conventional Commits & Release Process

This directory is reserved for the release process. The compact-js monorepo uses **Conventional Commits** to automatically generate CHANGELOGs during release.

## Commit Message Format

All commits must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types:**
- `feat:` — new feature
- `fix:` — bug fix
- `chore:` — tooling, dependencies, etc.
- `docs:` — documentation changes
- `style:` — formatting changes (no code change)
- `refactor:` — code refactoring (no feature or fix)
- `perf:` — performance improvements
- `test:` — test updates
- `ci:` — CI/CD configuration

**Examples:**
```bash
git commit -m "feat: add parallel contract execution"
git commit -m "fix: handle null witness implementations"
git commit -m "chore: upgrade effect to 3.21.0"
```

**Breaking Changes:**
```bash
git commit -m "feat!: change contract runtime interface

BREAKING CHANGE: The execute() method signature has changed."
```

## Release Process

When releasing (via `workflow_dispatch` on `main` or `release/compact-js/*` branches):

1. All commits since the last version bump are scanned for type (`feat:`, `fix:`, etc.)
2. This determines the version bump (patch/minor/major)
3. The version in `version.json` is updated with the commit height
4. Each package's `CHANGELOG.md` is generated from commit messages
5. Packages are published to GitHub Packages
6. A git tag and GitHub Release are created with the extracted changelog notes

Your commit messages become the release notes — write them clearly!
