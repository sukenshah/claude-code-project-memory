import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DatabaseService } from "../services/DatabaseService.js";
import type { BaseTool } from "./BaseTool.js";

export class GetSessionDetailTool implements BaseTool {
  constructor(private readonly db: DatabaseService) {}

  register(server: McpServer): void {
    server.registerTool(
      "get_session_detail",
      {
        description:
          "Get full detail for a session: metadata, summary, all insights with tags, and optionally the transcript.",
        inputSchema: {
          session_id: z.string(),
          include_transcript: z.boolean().optional().default(false),
        },
      },
      this.handle.bind(this)
    );
  }

  private handle(input: { session_id: string; include_transcript?: boolean }) {
    const session = this.db.db
      .prepare(
        `SELECT s.*, ss.summary, ss.outcome
         FROM sessions s
         LEFT JOIN session_summaries ss ON ss.session_id = s.id
         WHERE s.id = ?`
      )
      .get(input.session_id) as {
        id: string;
        project_path: string;
        started_at: number;
        ended_at: number;
        model: string | null;
        turn_count: number;
        total_tokens: number;
        summary: string | null;
        outcome: string | null;
      } | undefined;

    if (!session) {
      return {
        content: [{ type: "text" as const, text: `Session ${input.session_id} not found.` }],
        isError: true,
      };
    }

    const insights = this.db.db
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
        id: number;
        type: string;
        title: string;
        body: string;
        file_ref: string | null;
        tags: string | null;
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
      const row = this.db.db
        .prepare("SELECT content FROM transcripts WHERE session_id = ?")
        .get(input.session_id) as { content: string } | undefined;
      if (row) {
        lines.push("", "--- Transcript ---", row.content);
      }
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  }
}
