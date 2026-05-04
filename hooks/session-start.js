#!/usr/bin/env node
// project-memory — Claude Code SessionStart hook
// Materializes top mistakes/blockers directly into context, then gives instructions.

const path = require('path');
const { execSync } = require('child_process');
const { existsSync } = require('fs');

function getRecalledInsights() {
  const dbPath = path.join(process.cwd(), '.claude', 'project-memory', 'insights.db');
  if (!existsSync(dbPath)) return '';

  try {
    const sql = "SELECT type, title, body, file_ref FROM insights WHERE type IN ('mistake','blocker') ORDER BY created_at DESC LIMIT 8;";
    const raw = execSync(`sqlite3 -separator '|||' "${dbPath}" "${sql}"`, {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    if (!raw) return '';

    const rows = raw.split('\n').map(line => {
      const [type, title, body, file_ref] = line.split('|||');
      return {
        type: (type || '').trim(),
        title: (title || '').trim(),
        body: (body || '').trim(),
        file_ref: (file_ref || '').trim(),
      };
    }).filter(r => r.type && r.title);

    if (rows.length === 0) return '';

    const formatted = rows.map(r => {
      const ref = r.file_ref ? `\n  → FILE: ${r.file_ref}` : '';
      return `[${r.type.toUpperCase()}] ${r.title}${ref}\n  ${r.body}`;
    }).join('\n\n');

    return `## ⚠ Recalled Mistakes & Blockers (from project memory)\n\n${formatted}\n\n---\n\n`;
  } catch {
    return '';
  }
}

const recalled = getRecalledInsights();

const INSTRUCTIONS = `PROJECT MEMORY ACTIVE (project-memory MCP)

This is your persistent long-term memory. Insights, decisions, patterns, mistakes, and blockers are stored in a per-project SQLite DB and recalled across sessions.

You MUST run these queries NOW in order before responding to anything:

1. Call \`query_insights\` with type="mistake" — surface all known failure modes first
2. Call \`query_insights\` with type="blocker" — surface all known blockers
3. Call \`query_insights\` with search="<project name or task area>" — broad context

If results from steps 1 or 2 include anything relevant to the current task, surface them as ⚠ WARNINGS before proceeding. Do not skip this — past mistakes must be loaded before work begins.

During work: call \`add_insight\` for significant decisions, blockers hit, or non-obvious facts discovered. Prioritize type=mistake and type=blocker — these are highest value for future sessions.
At session end: call \`write_session\` with a 2-5 sentence summary, outcome (completed|partial|abandoned), and any remaining insights.

CONSTRAINTS:
- ALWAYS use project-memory MCP tools to read/write insights — do NOT query the SQLite DB directly via Bash or use ToolSearch as a workaround
- If project-memory MCP tools are unavailable, STOP and report the server health issue — do not attempt workarounds

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

process.stdout.write(recalled + INSTRUCTIONS);
