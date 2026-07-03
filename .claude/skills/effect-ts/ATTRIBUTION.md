# Attribution

This skill (`SKILL.md` and everything under `references/`) is vendored from the
**Claude-Matrix** project's `effect-ts` skill:

- Source: https://github.com/ojowwalker77/Claude-Matrix/tree/main/skills/effect-ts
- Upstream license: MIT (see below)

## Local modifications

- Renamed the skill `name` from `Effect-TS Expert` to `effect-ts` so it matches the
  containing directory (required for Claude Code to load and invoke it).
- Removed the Matrix-plugin-specific frontmatter (`user-invocable`, `context`) and the
  `mcp__plugin_matrix_*` / Context7 entries from `allowed-tools`, since those tools are not
  available in this repository. The skill now uses the standard tool set.
- Adjusted the `description` to mention this repo's Effect-heavy packages
  (`compact-js`, `platform-js`).

The reference documents under `references/` are unchanged from upstream.

## Upstream license (MIT)

```
MIT License

Copyright (c) 2025 Matrix Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
