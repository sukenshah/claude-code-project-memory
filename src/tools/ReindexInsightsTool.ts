import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DatabaseService } from "../services/DatabaseService.js";
import type { EmbeddingService } from "../services/EmbeddingService.js";
import type { BaseTool } from "./BaseTool.js";

export class ReindexInsightsTool implements BaseTool {
  constructor(
    private readonly db: DatabaseService,
    private readonly embeddings: EmbeddingService
  ) {}

  register(server: McpServer): void {
    server.registerTool(
      "reindex_insights",
      {
        description:
          "Backfill semantic embeddings for insights that predate vector search. " +
          "Run once after upgrading to add vector search support to existing insights.",
        inputSchema: {},
      },
      this.handle.bind(this)
    );
  }

  private async handle() {
    const missing = this.db.db
      .prepare(
        `SELECT i.id, i.title, i.body FROM insights i
         WHERE NOT EXISTS (SELECT 1 FROM insight_vec_v2 v WHERE v.insight_id = i.id)`
      )
      .all() as Array<{ id: number; title: string; body: string }>;

    let succeeded = 0;
    for (const row of missing) {
      const ok = await this.embeddings.store(row.id, row.title, row.body);
      if (ok) succeeded++;
    }

    const failed = missing.length - succeeded;
    return {
      content: [
        {
          type: "text" as const,
          text: `Reindexed ${succeeded} insight(s).${failed > 0 ? ` ${failed} failed (see server logs).` : ""}`,
        },
      ],
    };
  }
}
