import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DatabaseService } from "../services/DatabaseService.js";
import type { BaseTool } from "./BaseTool.js";

export class GetRecentSessionsTool implements BaseTool {
  constructor(private readonly db: DatabaseService) {}

  register(server: McpServer): void {
    server.registerTool(
      "get_recent_sessions",
      {
        description: "List recent sessions with summaries and insight counts.",
        inputSchema: {
          project_path: z.string().optional(),
          limit: z.number().optional().default(10),
        },
      },
      this.handle.bind(this)
    );
  }

  private handle(input: { project_path?: string; limit?: number }) {
    const where = input.project_path ? "WHERE s.project_path = ?" : "";
    const params: unknown[] = input.project_path ? [input.project_path] : [];
    const limit = input.limit ?? 10;

    const rows = this.db.db
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
      .all(...params, limit) as Array<{
        id: string;
        project_path: string;
        started_at: number;
        ended_at: number;
        model: string | null;
        turn_count: number;
        summary: string | null;
        outcome: string | null;
        insight_count: number;
      }>;

    if (!rows.length) {
      return { content: [{ type: "text" as const, text: "No sessions found." }] };
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

    return { content: [{ type: "text" as const, text }] };
  }
}
