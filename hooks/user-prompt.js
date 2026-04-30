#!/usr/bin/env node
// project-memory — Claude Code UserPromptSubmit hook
// Reminds Claude to query project memory for the current prompt if not already recalled.

const INSTRUCTIONS = `If project memory has not been queried yet this session, call \`query_insights\` now with a search term relevant to the current request before responding. This surfaces past decisions, patterns, and mistakes that apply to the task at hand.`;

process.stdout.write(INSTRUCTIONS);
