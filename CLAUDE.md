# CLAUDE.md

## Project overview

This is an MCP server (`claude-code-project-memory`) that provides Claude with persistent long-term memory via a SQLite database. It exposes five tools for writing and querying session summaries and structured insights.

## Repository structure

```
config/schema.sql   — SQLite schema (sessions, summaries, insights, tags, transcripts)
src/index.ts        — entire server implementation (single file)
dist/               — compiled JS output (gitignored, run `npm run build`)
```

## Key design decisions

- **Single-file server**: all tool registrations live in `src/index.ts`. Do not split into multiple files unless the file grows substantially.
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

1. Call `server.registerTool(name, { description, inputSchema }, handler)` in `src/index.ts`.
2. Use `z.object(...)` for `inputSchema` — the SDK accepts Zod shapes directly.
3. Add any required prepared statements near the top of the file with the other statements.
4. Return `{ content: [{ type: "text", text: "..." }] }` from the handler.

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PROJECT_PATH` | `process.cwd()` | Root used to resolve the DB path |

## Database path

`<PROJECT_PATH>/.claude/project-memory/insights.db`

This directory is gitignored. It is created automatically at startup.
