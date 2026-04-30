#!/usr/bin/env node
// project-memory — Claude Code SessionStart hook
// Injects memory usage instructions so Claude queries and writes memory each session.

const INSTRUCTIONS = `PROJECT MEMORY ACTIVE (project-memory MCP)

At session start: call \`query_insights\` to recall past decisions, patterns, and mistakes for this project.
During work: call \`add_insight\` when making significant decisions (type: decision | pattern | mistake | blocker | learning).
At session end: call \`write_session\` with a 2-5 sentence summary, outcome, and all key insights before finishing.

Available tools: write_session, add_insight, remove_insight, query_insights, get_recent_sessions, get_session_detail, reindex_insights`;

process.stdout.write(INSTRUCTIONS);
