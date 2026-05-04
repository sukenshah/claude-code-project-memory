#!/usr/bin/env node
// project-memory — Claude Code UserPromptSubmit hook
// Minimal per-turn reminder. Session-start covers full instructions.

process.stdout.write(
  "Project memory check (run only what applies):\n" +
  "• New topic area not yet queried this session → call query_insights(search=\"<topic>\")\n" +
  "• Results include type=mistake or type=blocker → surface as ⚠ WARNING before answering\n" +
  "• Already queried this topic this session → skip\n"
);
