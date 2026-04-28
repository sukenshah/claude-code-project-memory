import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DatabaseService } from "../services/DatabaseService.js";
import type { EmbeddingService } from "../services/EmbeddingService.js";
import type { BaseTool } from "./BaseTool.js";

export class AddInsightTool implements BaseTool {
  constructor(
    private readonly db: DatabaseService,
    private readonly embeddings: EmbeddingService
  ) {}

  register(server: McpServer): void {
    server.registerTool(
      "add_insight",
      {
        description:
          "Add a single insight to a session. Creates the session automatically if it does not exist yet. " +
          "Use for incremental writes during a session rather than waiting until the end.",
        inputSchema: {
          session_id: z.string(),
          type: z.enum(["decision", "pattern", "mistake", "blocker", "learning"]),
          title: z.string(),
          body: z.string(),
          file_ref: z.string().optional(),
          tags: z.array(z.string()).optional(),
        },
      },
      this.handle.bind(this)
    );
  }

  private async handle(input: {
    session_id: string;
    type: "decision" | "pattern" | "mistake" | "blocker" | "learning";
    title: string;
    body: string;
    file_ref?: string;
    tags?: string[];
  }) {
    const exists = this.db.db.prepare("SELECT id FROM sessions WHERE id = ?").get(input.session_id);
    if (!exists) {
      const now = Date.now();
      this.db.insertSession({
        id: input.session_id,
        project_path: this.db.projectPath,
        started_at: now,
        ended_at: now,
        model: null,
        turn_count: 0,
        total_tokens: 0,
      });
    }

    const id = this.db.insertInsightWithTags(
      input.session_id,
      input.type,
      input.title,
      input.body,
      input.file_ref,
      input.tags ?? []
    );
    await this.embeddings.store(id, input.title, input.body);

    return {
      content: [{ type: "text" as const, text: `Insight #${id} added to session ${input.session_id}.` }],
    };
  }
}
