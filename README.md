# claude-code-project-memory

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that gives Claude persistent long-term memory across sessions within the scope of a project. It stores session summaries and structured insights in a local SQLite database, so Claude can recall past decisions, patterns, and mistakes at the start of each new conversation.

## Overview

### Motivation

Claude Code has no memory between sessions. Every conversation starts cold — no recollection of the architectural decisions you made last week, the gotcha you spent two hours debugging, or the pattern that worked well on the last feature. You end up re-explaining context, re-litigating settled decisions, and watching Claude repeat mistakes it already made.

The common workaround is `CLAUDE.md`: a file where developers document architecture, conventions, and guidelines that get loaded into every session. This works for stable, high-level context — but it's a poor fit for the kind of knowledge that accumulates as you build. Learnings are hard to write up as clean markdown in the moment, the file grows unbounded, and everything in it is loaded into every session whether it's relevant or not. A 500-line `CLAUDE.md` covering auth, database patterns, frontend conventions, and deployment quirks all lands in context even when you're just fixing a CSS bug.

This project takes a different approach: insights are captured inline as they happen and stored in a structured, searchable database. At the start of each session Claude calls `query_insights` with filters relevant to the task at hand — pulling only the decisions, patterns, and mistakes that actually apply. The rest stays out of context.

### Benefits

- **Continuity across sessions** — Claude recalls past decisions, patterns, and mistakes without you re-explaining them
- **Inline capture** — insights are saved the moment they happen, not reconstructed from a fading transcript at session end
- **Structured recall** — insights are typed and tagged, so `query_insights` surfaces only what's relevant rather than dumping everything
- **Zero cloud dependency** — memory lives in a local SQLite file inside your project; nothing leaves your machine
- **Low friction** — hooks automate capture and recall; no manual steps required once configured

### Project boundary

This server is deliberately scoped to **one project at a time**. The `PROJECT_PATH` environment variable pins the database to a specific directory, so insights from different codebases never mix.

It does **not**:
- Sync memory across machines or teammates
- Store conversation transcripts by default (opt-in via `write_session`)
- Replace a project wiki or ADR process — it captures what Claude learned, not what humans decided
- Provide cross-project search or a global memory layer (use separate MCP server instances per project)

## Architecture

![Architecture diagram](architecture.svg)

> Source: [architecture.excalidraw](architecture.excalidraw) — open in [Excalidraw](https://excalidraw.com) to edit.

## How it works

At the end of each Claude Code session, a stop hook calls `write_session` to persist:
- Session metadata (model, duration, token count)
- A narrative summary and outcome
- Structured **insights** — typed knowledge entries extracted from the session

At the start of the next session, Claude calls `query_insights` to surface relevant past context before beginning work.

## Tools

| Tool | Description |
|------|-------------|
| `write_session` | Persist a completed session with summary and insights. Call from a stop hook. |
| `add_insight` | Add a single insight to an existing session (for incremental writes during a session). |
| `query_insights` | Search insights by type, tag, project, or free-text. Call at session start to recall past context. |
| `get_recent_sessions` | List recent sessions with summaries and insight counts. |
| `get_session_detail` | Get full detail for a session, including all insights and optionally the transcript. |

### Insight types

- `decision` — architectural or design choices made
- `pattern` — recurring approaches that worked well
- `mistake` — errors made and how to avoid them
- `blocker` — obstacles encountered and how they were resolved
- `learning` — new knowledge acquired during the session

## Installation

### Prerequisites

- Node.js 20+
- Claude Code CLI

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/sukenshah/claude-code-project-memory.git
   cd claude-code-project-memory
   ```

2. Install dependencies and build:
   ```bash
   npm run build
   ```

3. Register the MCP server in your project-specific config `.mcp.json`:
   ```json
   {
     "mcpServers": {
       "project-memory": {
         "command": "node",
         "args": ["</absolute/path/to/>claude-code-project-memory/dist/index.js"],
         "env": {
           "PROJECT_PATH": "/path/to/your/project"
         }
       }
     }
   }
   ```

4. Add the following hooks to your project-specific Claude Code settings (`.claude/settings.json`). Copy the entire block — it covers session start, session end, and pre-compaction.

   ```json
   {
     "hooks": {
       "SessionStart": [
         {
           "matcher": "startup",
           "hooks": [
             {
               "type": "command",
               "command": "jq -n --arg ctx 'MEMORY INSTRUCTIONS\\n\\nYou have access to a project memory MCP server (project-memory-mcp).\\n\\nSESSION START: Call query_insights (no filters, or filtered by current project_path) to recall relevant past decisions, patterns, and mistakes before beginning work.\\n\\nDURING THE SESSION — call add_insight immediately and inline (do not defer to session end) when you:\\n- Make an architectural or design decision that is not obvious from the code\\n- Discover a non-obvious constraint, invariant, or gotcha\\n- Make a mistake and correct it\\n- Confirm that a particular approach works well\\nDo NOT call add_insight for things derivable from reading the code, routine steps, or anything already captured. Quality over quantity — one precise insight beats three vague ones.\\nUse the tightest applicable type: decision > pattern > learning > blocker > mistake. Always add tags so insights are findable across sessions.\\nInsight quality rules:\\n- title: one line, specific enough to be useful out of context\\n- body: lead with the rule or fact, then Why: and How to apply:\\n- file_ref: include when the insight ties to a specific location (e.g. src/handlers/auth.ts:42)\\n- tags: consistent lowercase slugs (e.g. auth, dynamo, cdk, frontend, lambda, mcp)\\n\\nSESSION END: Call write_session to persist a summary and outcome. Do not repeat insights already saved inline via add_insight.' '{hookSpecificOutput:{hookEventName:\"SessionStart\",additionalContext:$ctx}}'"
             }
           ]
         }
       ],
       "Stop": [
         {
           "matcher": "",
           "hooks": [
             {
               "type": "command",
               "command": "printf 'SESSION END: Call write_session on project-memory-mcp now.\\n- Use the current session_id and project_path.\\n- Write a 2-5 sentence summary of what was accomplished and why.\\n- Set outcome to completed, partial, or abandoned as appropriate.\\n- Include any insights not yet saved inline via add_insight during the session.\\n- Do NOT repeat insights already saved via add_insight.'"
             }
           ]
         }
       ],
       "PreCompact": [
         {
           "matcher": "",
           "hooks": [
             {
               "type": "command",
               "command": "printf 'PRE-COMPACT: Context is about to be compacted. Call write_session on project-memory-mcp before this happens.\\n- Use the current session_id and project_path.\\n- Write a summary of work done so far and set outcome to partial.\\n- Save any insights not yet recorded via add_insight — decisions, patterns, mistakes, blockers, or learnings from this session.\\n- Do NOT repeat insights already saved via add_insight.\\nAfter compaction, call query_insights at the start of the new context to restore relevant memory.'"
             }
           ]
         }
       ]
     }
   }
   ```

   > `SessionStart` (`matcher: "startup"`) injects memory instructions before the first user message. Add a second entry with `"matcher": "resume"` to also inject on session resume. `Stop` and `PreCompact` use plain `printf` stdout, which Claude receives as a follow-up prompt.

## Database

The SQLite database is stored at:
```
<PROJECT_PATH>/.claude/project-memory/insights.db
```

`PROJECT_PATH` defaults to `process.cwd()` but can be overridden via the `PROJECT_PATH` environment variable. The database directory is created automatically on first run.

## Development

```bash
npm run dev    # run with tsx (no build step)
npm run build  # compile TypeScript to dist/
npm start      # run compiled output
```

## License

MIT — see [LICENSE](LICENSE).
