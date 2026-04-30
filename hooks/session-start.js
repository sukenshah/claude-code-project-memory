#!/usr/bin/env node
// project-memory — Claude Code SessionStart hook
// Gives Claude a full mental model of project-memory and forces a query at session start.

const INSTRUCTIONS = `PROJECT MEMORY ACTIVE (project-memory MCP)

This is your persistent long-term memory. Insights, decisions, patterns, mistakes, and blockers are stored in a per-project SQLite DB and recalled across sessions.

You MUST call \`query_insights\` NOW with a broad search term (e.g. the project name or "architecture") before responding to anything. Do not skip this — past decisions and known mistakes must be loaded into context first.

During work: call \`add_insight\` whenever you make a significant decision, spot a pattern, hit a blocker, or make a mistake worth remembering.
At session end: call \`write_session\` with a 2-5 sentence summary, outcome (completed|partial|abandoned), and any remaining insights.

Insight types:
- decision   — architectural or design choice made and why
- pattern    — recurring approach or convention in this codebase
- mistake    — error made (yours or the code's) worth avoiding in future
- blocker    — dependency, config, or constraint that slowed work
- learning   — non-obvious fact about the codebase, API, or domain

Tools (MCP server: project-memory):
- query_insights       — semantic search across all stored insights
- add_insight          — store a new insight (type, title, body, tags)
- remove_insight       — delete an insight by ID
- write_session        — save a session summary with linked insights
- get_recent_sessions  — list recent sessions
- get_session_detail   — full detail for one session
- reindex_insights     — rebuild embedding index`;

process.stdout.write(INSTRUCTIONS);
