import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DatabaseService } from "../services/DatabaseService.js";
import type { BaseTool } from "./BaseTool.js";

export class RemoveInsightTool implements BaseTool {
  constructor(private readonly db: DatabaseService) {}

  register(server: McpServer): void {
    server.registerTool(
      "remove_insight",
      {
        description:
          "Remove insights by ID and/or exact title. At least one of id or title must be provided. " +
          "When both are given, both conditions must match (AND). Returns the IDs that were deleted.",
        inputSchema: {
          id: z.number().optional().describe("Insight ID to remove"),
          title: z.string().optional().describe("Exact title match (case-sensitive)"),
        },
      },
      this.handle.bind(this)
    );
  }

  private handle(input: { id?: number; title?: string }) {
    if (input.id === undefined && !input.title) {
      return {
        content: [{ type: "text" as const, text: "Error: provide at least one of id or title." }],
        isError: true,
      };
    }

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (input.id !== undefined) { conditions.push("id = ?");    params.push(input.id); }
    if (input.title)             { conditions.push("title = ?"); params.push(input.title); }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const matching = this.db.db
      .prepare(`SELECT id FROM insights ${where}`)
      .all(...params) as Array<{ id: number }>;

    if (!matching.length) {
      return { content: [{ type: "text" as const, text: "No matching insights found." }] };
    }

    const ids = matching.map((r) => r.id);
    const placeholders = ids.map(() => "?").join(", ");

    this.db.db.transaction(() => {
      this.db.db.prepare(`DELETE FROM insight_tags WHERE insight_id IN (${placeholders})`).run(...ids);
      this.db.db.prepare(`DELETE FROM insight_vec_v2  WHERE insight_id IN (${placeholders})`).run(...ids);
      this.db.db.prepare(`DELETE FROM insights     WHERE id          IN (${placeholders})`).run(...ids);
    })();

    return {
      content: [{ type: "text" as const, text: `Removed ${ids.length} insight(s): #${ids.join(", #")}.` }],
    };
  }
}
