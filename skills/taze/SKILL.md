---
name: taze
description: Check and update outdated dependencies with the taze CLI. Use when the user asks to update, upgrade, or check dependencies, packages, or GitHub Actions versions.
---

# taze

Use `taze` to find and apply dependency updates. Always pass `--json` when checking, so the output is machine-readable (no tables, progress bars, or prompts).

## Workflow

1. Check for updates (read-only):

   ```bash
   npx taze -r --json          # -r: include all workspace packages (monorepo)
   ```

   Only dependencies with an available update are listed. Add `--all` to include up-to-date ones.

2. Summarize the result for the user, calling out `major` bumps as potentially breaking. Default mode only bumps within the declared ranges' safe level; pick a mode to widen:

   ```bash
   npx taze major -r --json    # also show major updates
   npx taze minor -r --json    # up to minor
   npx taze patch -r --json    # patch only
   ```

3. Apply the updates (unless the user only wanted a report):

   ```bash
   npx taze -r -w --json       # -w: write to package.json / catalogs / workflows
   ```

4. Run the package manager's install (`pnpm i`, `npm i`, `yarn`, `bun i`), then the project's build/test scripts to verify.

## Useful options

- `--include a,b` / `--exclude a,b`: filter by name (comma-separated, regex like `/react/` supported). `--exclude typescript@7` blocks only that range.
- `-l`: include locked (unprefixed) versions.
- `--fail-on-outdated`: exit code 1 when updates exist (CI).
- `-g`: check globally installed packages.

Also covers GitHub Actions in `.github/workflows` and the Node.js version in `.nvmrc` / `.node-version`.

Never use interactive mode (`-I`); it is ignored with `--json` and needs a TTY.
