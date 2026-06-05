# uploom

Short npm package name wrapper for [`@whyjs/taze`](https://www.npmjs.com/package/@whyjs/taze).

`uploom` does not contain its own CLI logic — it re-exports the full `@whyjs/taze` CLI so you can run:

```bash
npx uploom
```

instead of:

```bash
npx @whyjs/taze
```

## Install

```bash
npm i -g uploom
```

## Usage

Everything `taze` supports also works via `uploom`:

```bash
# Check dependency updates
uploom minor -w
uploom -r

# Registry management (fork feature)
# `reg` is shorthand for `registry`
uploom reg ls
uploom reg use taobao
```

## Relationship to @whyjs/taze

| Package | CLI | Role |
|---|---|---|
| `@whyjs/taze` | `taze` | Main package — library + CLI |
| `uploom` | `uploom` | Thin wrapper for a shorter `npx` / global command name |

Both packages are versioned together and published from the same monorepo.

For full documentation and fork-specific features, see the [repository README](https://github.com/yeli19950109/taze#fork-说明whyjstaze).

## License

MIT
