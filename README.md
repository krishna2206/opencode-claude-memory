# opencode-claude-memory

OpenCode plugin: persistent local Markdown memory shared with Claude Code, injected once per session (cache-friendly).

## Why

Claude Code keeps its auto-memory as Markdown files in `~/.claude/projects/<project>/memory/` (`MEMORY.md` index + topic files). This plugin lets OpenCode read and write the **same** directory, so both CLIs share one memory — what you teach one, the other knows.

Unlike other memory plugins, it has no shell wrapper, no `.zshrc` hook, and no background extraction. Memory is written and organized by the agent in-session, on demand.

## How it works

- On the first turn of a session, the memory guide + a snapshot of `MEMORY.md` are injected into the system prompt. The same text is reused on every following turn, so the system prompt prefix stays byte-identical — preserving harness and provider prefix caching.
- Five tools give the agent full read/write access to memory: `memory_save`, `memory_delete`, `memory_list`, `memory_search`, `memory_read`.
- `memory_save` / `memory_delete` keep the `MEMORY.md` index in sync automatically.
- The static guide teaches the agent when to save, what not to save, and to proactively propose memory updates during long sessions.

## Install

```bash
# build
cd opencode-claude-memory
npm install && npm run build

# link into opencode's local plugin directory
mkdir -p ~/.config/opencode/plugins
ln -sf "$PWD/dist/index.js" ~/.config/opencode/plugins/opencode-claude-memory.js
```

Restart opencode. The plugin is picked up automatically from `~/.config/opencode/plugins/`.

## Usage

Ask the agent to remember something, or let it propose memory updates:

```
souviens-toi que ...
liste tes mémoires
cherche X dans ta mémoire
organise ta mémoire
```

Memory files land in `~/.claude/projects/<project>/memory/` — the same files Claude Code reads.

## Development

```bash
npm run typecheck   # tsc --noEmit
npm run build       # compile to dist/
```

## Credits

Memory format and path resolution are ports of Claude Code's auto-memory internals, via the MIT-licensed [opencode-claude-memory](https://github.com/kuitos/opencode-claude-memory) project. The plugin API surface here is original and intentionally minimal.

## License

MIT
