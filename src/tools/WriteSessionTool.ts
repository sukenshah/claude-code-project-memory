import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DatabaseService } from "../services/DatabaseService.js";
import type { EmbeddingService } from "../services/EmbeddingService.js";
import type { BaseTool } from "./BaseTool.js";

export class WriteSessionTool implements BaseTool {
  constructor(
    private readonly db: DatabaseService,
    private readonly embeddings: EmbeddingService
  ) {}

  register(server: McpServer): void {
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
      this.handle.bind(this)
    );
  }

  private async handle(input: {
    session_id: string;
    project_path?: string;
    started_at: number;
    ended_at: number;
    model?: string;
    turn_count?: number;
    total_tokens?: number;
    summary: string;
    outcome: "completed" | "abandoned" | "partial";
    insights?: Array<{
      type: "decision" | "pattern" | "mistake" | "blocker" | "learning";
      title: string;
      body: string;
      file_ref?: string;
      tags?: string[];
    }>;
    transcript?: string;
  }) {
    const projectPath = input.project_path ?? this.db.projectPath;
    const now = Date.now();

    const writeAll = this.db.db.transaction(() => {
      this.db.insertSession({
        id: input.session_id,
        project_path: projectPath,
        started_at: input.started_at,
        ended_at: input.ended_at,
        model: input.model ?? null,
        turn_count: input.turn_count ?? 0,
        total_tokens: input.total_tokens ?? 0,
      });

      this.db.insertSummary({
        session_id: input.session_id,
        summary: input.summary,
        outcome: input.outcome,
        created_at: now,
      });

      const inserted: Array<{ id: number; title: string; body: string }> = [];
      for (const insight of input.insights ?? []) {
        const id = this.db.insertInsightWithTags(
          input.session_id,
          insight.type,
          insight.title,
          insight.body,
          insight.file_ref,
          insight.tags ?? []
        );
        inserted.push({ id, title: insight.title, body: insight.body });
      }

      if (input.transcript) {
        this.db.insertTranscript(input.session_id, input.transcript);
      }

      return inserted;
    });

    const inserted = writeAll();
    await Promise.all(inserted.map((i) => this.embeddings.store(i.id, i.title, i.body)));

    return {
      content: [
        { type: "text" as const, text: `Session ${input.session_id} saved. ${inserted.length} insight(s) stored.` },
      ],
    };
  }
}
