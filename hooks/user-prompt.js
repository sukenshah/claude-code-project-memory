#!/usr/bin/env node
// project-memory — Claude Code UserPromptSubmit hook
// Instructs Claude to query and surface relevant insights before responding.

const INSTRUCTIONS = `If project memory has not been queried yet this session:
1. Call \`query_insights\` with a search term from the current request.
2. If results include type=mistake or type=blocker, surface them as warnings before answering.
3. If results include type=decision or type=pattern, treat them as established context — don't re-debate settled choices.

If project memory was already queried: check if the current request involves a different area than what was searched. If so, run a targeted \`query_insights\` call for this specific topic before responding.`;

process.stdout.write(INSTRUCTIONS);
