# CLAUDE.md

## Project overview

This is an MCP server (`claude-code-project-memory`) that provides Claude with persistent long-term memory via a SQLite database. It exposes five tools for writing and querying session summaries and structured insights.

## Repository structure

```
config/schema.sql        — SQLite schema (sessions, summaries, insights, tags, transcripts)
src/index.ts             — server entry point; wires services + tools
src/services/            — DatabaseService, EmbeddingService
src/tools/               — one class per MCP tool (BaseTool interface)
dist/                    — compiled JS output (gitignored, run `npm run build`)
hooks/install.sh         — plugin installer: builds server, registers MCP + hook in settings.json
hooks/install.ps1        — same for Windows
hooks/uninstall.sh       — removes MCP registration and hook from settings.json
hooks/session-start.js   — SessionStart hook: injects memory usage instructions into Claude context
hooks/user-prompt.js     — UserPromptSubmit hook: reminds Claude to query memory before each response
hooks/stop.js            — Stop hook: instructs Claude to call write_session before finishing
hooks/post-compact.js    — PostCompact hook: instructs Claude to snapshot memory before compaction
```

## Plugin hook system

`hooks/session-start.js` runs on every Claude Code `SessionStart` event and writes plain text to stdout. Claude Code injects that text as a system-context reminder, telling Claude to:
1. Call `query_insights` at session start to recall past decisions.
2. Call `add_insight` during work for significant decisions.
3. Call `write_session` at session end with a summary and insights.

`hooks/install.sh` merges the MCP server config and the SessionStart hook into `~/.claude/settings.json` using Node — no manual JSON editing required. It backs up settings to `settings.json.bak` before writing.

### Adding a new hook event

Add a new entry under `settings.hooks.<EventName>` in `install.sh` following the same pattern as the existing `SessionStart` block. Add the corresponding JS script in `hooks/`.

## Key design decisions

- **One class per tool**: each tool lives in `src/tools/`. Do not inline tool handlers in `src/index.ts`.
- **Prepared statements**: all writes use prepared statements defined at module load time to avoid re-parsing on every call.
- **WAL mode**: the DB runs with `journal_mode = WAL` for concurrent read safety.
- **Schema via SQL file**: `config/schema.sql` uses `CREATE TABLE IF NOT EXISTS` so it's safe to run on every startup.
- **No ORM**: raw `better-sqlite3` only. Do not introduce an ORM.

## Build & run

```bash
npm run build     # install deps and tsc → dist/
npm run dev       # tsx src/index.ts (no build needed)
npm start         # node dist/index.js
```

## Adding a new tool

1. Create `src/tools/MyTool.ts` implementing `BaseTool`.
2. Use `z.object(...)` for `inputSchema` — the SDK accepts Zod shapes directly.
3. Add prepared statements to `DatabaseService` if DB access is needed.
4. Register the tool in `src/index.ts` by adding it to the `tools` array.
5. Return `{ content: [{ type: "text", text: "..." }] }` from the handler.

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PROJECT_PATH` | `process.cwd()` | Root used to resolve the DB path |

## Database path

`<PROJECT_PATH>/.claude/project-memory/insights.db`

This directory is gitignored. It is created automatically at startup.
