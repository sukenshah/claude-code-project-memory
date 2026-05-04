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
          "Use for incremental writes during a session rather than waiting until the end. " +
          "file_ref format: path/to/file.ts:lineNumber (e.g. src/services/DatabaseService.ts:47).",
        inputSchema: {
          session_id: z.string().optional().describe("Session ID (auto-generated if omitted)"),
          type: z.enum(["decision", "pattern", "mistake", "blocker", "learning"]),
          title: z.string(),
          body: z.string(),
          file_ref: z.string().optional().describe("path/to/file.ts:line — navigation hint for future sessions"),
          tags: z.array(z.string()).optional(),
        },
      },
      this.handle.bind(this)
    );
  }

  private async handle(input: {
    session_id?: string;
    type: "decision" | "pattern" | "mistake" | "blocker" | "learning";
    title: string;
    body: string;
    file_ref?: string;
    tags?: string[];
  }) {
    const sessionId = input.session_id ?? (Date.now().toString(36) + Math.random().toString(36).slice(2, 6));

    try {
      const vec = await this.embeddings.embed(`${input.title}. ${input.body}`);
      const similar = this.db.findSimilarByVector(vec, 0.35, 3);
      if (similar.length > 0) {
        const top = similar[0];
        const snippet = top.body.length > 120 ? top.body.slice(0, 120) + "..." : top.body;
        return {
          content: [{
            type: "text" as const,
            text: `Near-duplicate detected (distance: ${top.distance.toFixed(3)}): ` +
                  `insight #${top.id} [${top.type}] "${top.title}" — ${snippet}\n` +
                  `Use remove_insight to delete the old one first, or rephrase to be more specific.`,
          }],
        };
      }
    } catch {
      // Embedding unavailable — skip dedup, proceed with insert
    }

    const exists = this.db.db.prepare("SELECT id FROM sessions WHERE id = ?").get(sessionId);
    if (!exists) {
      const now = Date.now();
      this.db.insertSession({
        id: sessionId,
        project_path: this.db.projectPath,
        started_at: now,
        ended_at: now,
        model: null,
        turn_count: 0,
        total_tokens: 0,
      });
    }

    const id = this.db.insertInsightWithTags(
      sessionId,
      input.type,
      input.title,
      input.body,
      input.file_ref,
      input.tags ?? []
    );
    await this.embeddings.store(id, input.title, input.body);

    return {
      content: [{ type: "text" as const, text: `Insight #${id} added to session ${sessionId}.` }],
    };
  }
}
