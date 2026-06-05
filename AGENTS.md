# AGENTS.md

This file documents conventions for AI agents working in this repository.

---

## Repository Overview

This is `@whyjs/taze` — a personal fork of [antfu-collective/taze](https://github.com/antfu-collective/taze).

- **Upstream remote**: `antfu` → `https://github.com/antfu-collective/taze`
- **Fork remote**: `origin` → `https://github.com/yeli19950109/taze.git`
- **Working branch**: `whyjs`

---

## Dependency Management (Agents)

**Adding or installing dependencies requires user confirmation.** Do not run install commands automatically.

### Rules

| Action | Agent behavior |
|---|---|
| Add / remove a dependency in `package.json` or `pnpm-workspace.yaml` | Edit the manifest only, then **ask the user** to run install |
| Run `pnpm install` / `pnpm add` / `pnpm remove` | **Do not** unless the user explicitly asks |
| Request `all` / disable sandbox to speed up install | **Do not** — sandbox installs without the global pnpm store are too slow and bypassing sandbox is not acceptable without user approval |

### Workflow

1. Make dependency changes in manifest files (`package.json`, `pnpm-workspace.yaml`, etc.).
2. Tell the user what changed and ask them to run `pnpm install` locally (uses their global pnpm store).
3. Wait for confirmation before assuming `node_modules` / lockfile are up to date.

### Rationale

Sandboxed `pnpm install` does not use the machine's global pnpm store and is significantly slower. The user prefers to run installs themselves in their normal environment.

---

## Versioning Convention

The version format is:

```
{upstream_version}-fix.{N}
```

### Rules

| Scenario | Version change |
|---|---|
| Merge a new upstream tag | `{new_upstream_version}-fix.{N}` — upstream part updates, **N stays the same** |
| Develop / commit fork changes (unpublished) | **No version bump** — keep current version until publish |
| Publish to npm (`pnpm -r publish`) | Increment `N` by 1, keep current upstream version |

### Examples

```
19.11.0-fix.1   ← first publish on upstream v19.11.0
19.14.0-fix.1   ← merged upstream v19.14.0 → N unchanged (not published yet)
                  (registry, upz, yaml config… multiple commits, still fix.1)
19.14.0-fix.2   ← published to npm → N +1
19.15.0-fix.2   ← merged upstream v19.15.0 → N unchanged
19.15.0-fix.3   ← published to npm → N +1
```

### Key Points

- `fix.N` is a **publish counter** — it never resets, only increments at release time.
- **Do not** bump `N` on every code change or commit; multiple features can ship in one publish.
- Merging upstream alone keeps `N` unchanged (even if not publishing immediately).
- `N` starts at **1** on the very first publish of the fork.
- Agents must **not** change version in `package.json` unless the user is publishing.

---

## Published Packages

This fork publishes **two npm packages** from the same codebase:

| Package | CLI command | Role |
|---|---|---|
| `@whyjs/taze` | `taze` | Main package — library + CLI, built from `src/` |
| `upz` | `upz` | Thin CLI wrapper in `packages/upz/`, depends on `@whyjs/taze` |

Both packages share the same version (`{upstream_version}-fix.{N}`). When releasing, publish both via `pnpm -r publish`.

---

## Merging Upstream Tags

To merge a new upstream release tag (e.g. `v19.15.0`):

```bash
git fetch antfu v19.15.0
git merge v19.15.0 --no-edit
# resolve conflicts if any, then:
git add .
git commit --no-gpg-sign
# update upstream part in package.json to {new_version}-fix.{N} (N unchanged)
# bump N only when publishing: {version}-fix.{N+1}
```
