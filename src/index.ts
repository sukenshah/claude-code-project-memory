import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

// ── DB setup ──────────────────────────────────────────────────────────────────

const PROJECT_PATH = process.env.PROJECT_PATH ?? process.cwd();
const DB_PATH = join(PROJECT_PATH, ".claude", "project-memory", "insights.db");

mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const SCHEMA_PATH = join(fileURLToPath(import.meta.url), "..", "..", "config", "schema.sql");
db.exec(readFileSync(SCHEMA_PATH, "utf-8"));

// ── Prepared statements ───────────────────────────────────────────────────────

const insertSession = db.prepare(`
  INSERT OR REPLACE INTO sessions (id, project_path, started_at, ended_at, model, turn_count, total_tokens)
  VALUES (@id, @project_path, @started_at, @ended_at, @model, @turn_count, @total_tokens)
`);

const insertSummary = db.prepare(`
  INSERT OR REPLACE INTO session_summaries (session_id, summary, outcome, created_at)
  VALUES (@session_id, @summary, @outcome, @created_at)
`);

const insertInsight = db.prepare(`
  INSERT INTO insights (session_id, type, title, body, file_ref, created_at)
  VALUES (@session_id, @type, @title, @body, @file_ref, @created_at)
`);

const insertTag = db.prepare(
  `INSERT OR IGNORE INTO insight_tags (insight_id, tag) VALUES (?, ?)`
);

const insertTranscript = db.prepare(
  `INSERT OR REPLACE INTO transcripts (session_id, content) VALUES (?, ?)`
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function insertInsightWithTags(
  sessionId: string,
  type: string,
  title: string,
  body: string,
  fileRef: string | undefined,
  tags: string[]
): number {
  const result = insertInsight.run({
    session_id: sessionId,
    type,
    title,
    body,
    file_ref: fileRef ?? null,
    created_at: Date.now(),
  });
  const insightId = result.lastInsertRowid as number;
  for (const tag of tags) {
    insertTag.run(insightId, tag.toLowerCase().trim());
  }
  return insightId;
}

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "project-memory-mcp",
  version: "1.0.0",
});

// ── write_session ─────────────────────────────────────────────────────────────

server.registerTool(
  "write_session",
  {
    description:
      "Persist a completed Claude session with its summary and structured insights. " +
      "Call this at session end (stop hook). Insights are typed entries " +
      "(decision, pattern, mistake, blocker, learning) extracted from the session.",
    inputSchema: {
      session_id: z.string().describe("Unique session identifier from Claude"),
      project_path: z.string().optional().describe("Project working directory (defaults to server PROJECT_PATH)"),
      started_at: z.number().describe("Session start time as Unix epoch ms"),
      ended_at: z.number().describe("Session end time as Unix epoch ms"),
      model: z.string().optional().describe("Model used, e.g. claude-sonnet-4-6"),
      turn_count: z.number().optional(),
      total_tokens: z.number().optional(),
      summary: z.string().describe("2-5 sentence narrative summary of the session"),
      outcome: z.enum(["completed", "abandoned", "partial"]),
      insights: z
        .array(
          z.object({
            type: z.enum(["decision", "pattern", "mistake", "blocker", "learning"]),
            title: z.string(),
            body: z.string().describe("Full detail including why and how to apply"),
            file_ref: z.string().optional().describe("e.g. src/foo.ts:42"),
            tags: z.array(z.string()).optional(),
          })
        )
        .optional(),
      transcript: z.string().optional().describe("Full session transcript (JSON or markdown)"),
    },
  },
  (input) => {
    const projectPath = input.project_path ?? PROJECT_PATH;
    const now = Date.now();

    const writeAll = db.transaction(() => {
      insertSession.run({
        id: input.session_id,
        project_path: projectPath,
        started_at: input.started_at,
        ended_at: input.ended_at,
        model: input.model ?? null,
        turn_count: input.turn_count ?? 0,
        total_tokens: input.total_tokens ?? 0,
      });

      insertSummary.run({
        session_id: input.session_id,
        summary: input.summary,
        outcome: input.outcome,
        created_at: now,
      });

      let count = 0;
      for (const insight of input.insights ?? []) {
        insertInsightWithTags(
          input.session_id,
          insight.type,
          insight.title,
          insight.body,
          insight.file_ref,
          insight.tags ?? []
        );
        count++;
      }

      if (input.transcript) {
        insertTranscript.run(input.session_id, input.transcript);
      }

      return count;
    });

    const insightCount = writeAll();
    return {
      content: [
        { type: "text", text: `Session ${input.session_id} saved. ${insightCount} insight(s) stored.` },
      ],
    };
  }
);

// ── add_insight ───────────────────────────────────────────────────────────────

server.registerTool(
  "add_insight",
  {
    description: "Add a single insight to an existing session. Useful for incremental writes during a session.",
    inputSchema: {
      session_id: z.string(),
      type: z.enum(["decision", "pattern", "mistake", "blocker", "learning"]),
      title: z.string(),
      body: z.string(),
      file_ref: z.string().optional(),
      tags: z.array(z.string()).optional(),
    },
  },
  (input) => {
    const exists = db.prepare("SELECT id FROM sessions WHERE id = ?").get(input.session_id);
    if (!exists) {
      return {
        content: [{ type: "text", text: `Error: session ${input.session_id} not found. Call write_session first.` }],
        isError: true,
      };
    }

    const id = insertInsightWithTags(
      input.session_id,
      input.type,
      input.title,
      input.body,
      input.file_ref,
      input.tags ?? []
    );

    return { content: [{ type: "text", text: `Insight #${id} added to session ${input.session_id}.` }] };
  }
);

// ── query_insights ────────────────────────────────────────────────────────────

server.registerTool(
  "query_insights",
  {
    description:
      "Search stored insights across sessions. Filter by type, tag, project, or free-text on title/body. " +
      "Use before starting work to recall relevant past decisions, patterns, and mistakes.",
    inputSchema: {
      type: z.enum(["decision", "pattern", "mistake", "blocker", "learning"]).optional(),
      tag: z.string().optional().describe("Filter by tag (case-insensitive)"),
      project_path: z.string().optional(),
      search: z.string().optional().describe("Substring search on title and body"),
      limit: z.number().optional().default(20),
    },
  },
  (input) => {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (input.type) {
      conditions.push("i.type = ?");
      params.push(input.type);
    }
    if (input.project_path) {
      conditions.push("s.project_path = ?");
      params.push(input.project_path);
    }
    if (input.search) {
      conditions.push("(i.title LIKE ? OR i.body LIKE ?)");
      const like = `%${input.search}%`;
      params.push(like, like);
    }
    if (input.tag) {
      conditions.push(
        "EXISTS (SELECT 1 FROM insight_tags it WHERE it.insight_id = i.id AND it.tag = ?)"
      );
      params.push(input.tag.toLowerCase().trim());
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = db
      .prepare(
        `SELECT i.id, i.session_id, i.type, i.title, i.body, i.file_ref, i.created_at,
                s.project_path,
                GROUP_CONCAT(it.tag, ', ') AS tags
         FROM insights i
         JOIN sessions s ON s.id = i.session_id
         LEFT JOIN insight_tags it ON it.insight_id = i.id
         ${where}
         GROUP BY i.id
         ORDER BY i.created_at DESC
         LIMIT ?`
      )
      .all(...params, input.limit ?? 20) as Array<{
        id: number; session_id: string; type: string; title: string;
        body: string; file_ref: string | null; created_at: number;
        project_path: string; tags: string | null;
      }>;

    if (!rows.length) {
      return { content: [{ type: "text", text: "No insights found." }] };
    }

    const text = rows
      .map((r) => {
        const date = new Date(r.created_at).toISOString().slice(0, 10);
        const ref = r.file_ref ? `  ref: ${r.file_ref}\n` : "";
        const tags = r.tags ? `  tags: ${r.tags}\n` : "";
        return `[${r.type.toUpperCase()}] ${r.title}  (${date}, session: ${r.session_id.slice(0, 8)})\n${ref}${tags}  ${r.body}`;
      })
      .join("\n\n---\n\n");

    return { content: [{ type: "text", text: `${rows.length} insight(s):\n\n${text}` }] };
  }
);

// ── get_recent_sessions ───────────────────────────────────────────────────────

server.registerTool(
  "get_recent_sessions",
  {
    description: "List recent sessions with summaries and insight counts.",
    inputSchema: {
      project_path: z.string().optional(),
      limit: z.number().optional().default(10),
    },
  },
  (input) => {
    const where = input.project_path ? "WHERE s.project_path = ?" : "";
    const params: unknown[] = input.project_path ? [input.project_path] : [];

    const rows = db
      .prepare(
        `SELECT s.id, s.project_path, s.started_at, s.ended_at, s.model, s.turn_count,
                ss.summary, ss.outcome,
                COUNT(i.id) AS insight_count
         FROM sessions s
         LEFT JOIN session_summaries ss ON ss.session_id = s.id
         LEFT JOIN insights i ON i.session_id = s.id
         ${where}
         GROUP BY s.id
         ORDER BY s.ended_at DESC
         LIMIT ?`
      )
      .all(...params, input.limit ?? 10) as Array<{
        id: string; project_path: string; started_at: number; ended_at: number;
        model: string | null; turn_count: number; summary: string | null;
        outcome: string | null; insight_count: number;
      }>;

    if (!rows.length) {
      return { content: [{ type: "text", text: "No sessions found." }] };
    }

    const text = rows
      .map((r) => {
        const date = new Date(r.ended_at).toISOString().slice(0, 16).replace("T", " ");
        const dur = Math.round((r.ended_at - r.started_at) / 60000);
        return [
          `${r.id.slice(0, 8)}…  ${date} UTC  (${dur}m · ${r.turn_count} turns · ${r.insight_count} insights)`,
          `  outcome: ${r.outcome ?? "unknown"}  model: ${r.model ?? "unknown"}`,
          `  project: ${r.project_path}`,
          r.summary ? `  ${r.summary}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n");

    return { content: [{ type: "text", text }] };
  }
);

// ── get_session_detail ────────────────────────────────────────────────────────

server.registerTool(
  "get_session_detail",
  {
    description: "Get full detail for a session: metadata, summary, all insights with tags, and optionally the transcript.",
    inputSchema: {
      session_id: z.string(),
      include_transcript: z.boolean().optional().default(false),
    },
  },
  (input) => {
    const session = db
      .prepare(
        `SELECT s.*, ss.summary, ss.outcome
         FROM sessions s
         LEFT JOIN session_summaries ss ON ss.session_id = s.id
         WHERE s.id = ?`
      )
      .get(input.session_id) as {
        id: string; project_path: string; started_at: number; ended_at: number;
        model: string | null; turn_count: number; total_tokens: number;
        summary: string | null; outcome: string | null;
      } | undefined;

    if (!session) {
      return { content: [{ type: "text", text: `Session ${input.session_id} not found.` }], isError: true };
    }

    const insights = db
      .prepare(
        `SELECT i.id, i.type, i.title, i.body, i.file_ref,
                GROUP_CONCAT(it.tag, ', ') AS tags
         FROM insights i
         LEFT JOIN insight_tags it ON it.insight_id = i.id
         WHERE i.session_id = ?
         GROUP BY i.id
         ORDER BY i.id ASC`
      )
      .all(input.session_id) as Array<{
        id: number; type: string; title: string; body: string;
        file_ref: string | null; tags: string | null;
      }>;

    const dur = Math.round((session.ended_at - session.started_at) / 60000);
    const lines = [
      `Session: ${session.id}`,
      `Project: ${session.project_path}`,
      `Date:     ${new Date(session.ended_at).toISOString().slice(0, 16).replace("T", " ")} UTC`,
      `Duration: ${dur}m  |  Turns: ${session.turn_count}  |  Tokens: ${session.total_tokens}`,
      `Model:    ${session.model ?? "unknown"}  |  Outcome: ${session.outcome ?? "unknown"}`,
      "",
      "Summary:",
      session.summary ?? "(none)",
      "",
      `Insights (${insights.length}):`,
      ...insights.map((i) => {
        const ref = i.file_ref ? `\n    ref: ${i.file_ref}` : "";
        const tags = i.tags ? `\n    tags: ${i.tags}` : "";
        return `\n[${i.type.toUpperCase()}] ${i.title}${ref}${tags}\n  ${i.body}`;
      }),
    ];

    if (input.include_transcript) {
      const row = db
        .prepare("SELECT content FROM transcripts WHERE session_id = ?")
        .get(input.session_id) as { content: string } | undefined;
      if (row) {
        lines.push("", "--- Transcript ---", row.content);
      }
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
