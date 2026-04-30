#!/usr/bin/env node
// project-memory — Claude Code UserPromptSubmit hook
// Instructs Claude to query and surface relevant insights before responding.

const INSTRUCTIONS = `Project memory check (run only what applies):
• First message this session → call query_insights(type="mistake"), then query_insights(search="<topic from user request>")
• User asks about a NEW area not covered by prior queries → call query_insights(search="<new area>")
• Results include type=mistake or type=blocker → surface as ⚠ WARNING before answering
• Results include type=decision or type=pattern → treat as established context, do not re-debate
• Already queried this topic this session → skip, do not re-query on every message`;

process.stdout.write(INSTRUCTIONS);
