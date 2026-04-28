import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DatabaseService } from "../services/DatabaseService.js";
import type { EmbeddingService } from "../services/EmbeddingService.js";
import type { BaseTool } from "./BaseTool.js";

type InsightRow = {
  id: number;
  session_id: string;
  type: string;
  title: string;
  body: string;
  file_ref: string | null;
  created_at: number;
  project_path: string;
  tags: string | null;
};

const INSIGHT_SELECT = `
  SELECT i.id, i.session_id, i.type, i.title, i.body, i.file_ref, i.created_at,
         s.project_path,
         GROUP_CONCAT(it.tag, ', ') AS tags
  FROM insights i
  JOIN sessions s ON s.id = i.session_id
  LEFT JOIN insight_tags it ON it.insight_id = i.id`;

export class QueryInsightsTool implements BaseTool {
  constructor(
    private readonly db: DatabaseService,
    private readonly embeddings: EmbeddingService
  ) {}

  register(server: McpServer): void {
    server.registerTool(
      "query_insights",
      {
        description:
          "Search stored insights across sessions. Filter by type, tag, project, or free-text. " +
          "The search parameter uses semantic (intent-based) vector search when embeddings are available, " +
          "falling back to substring match. Use before starting work to recall past decisions, patterns, and mistakes.",
        inputSchema: {
          type: z.enum(["decision", "pattern", "mistake", "blocker", "learning"]).optional(),
          tag: z.string().optional().describe("Filter by tag (case-insensitive)"),
          project_path: z.string().optional(),
          search: z.string().optional().describe("Semantic search on title and body"),
          limit: z.number().optional().default(20),
        },
      },
      this.handle.bind(this)
    );
  }

  private async handle(input: {
    type?: "decision" | "pattern" | "mistake" | "blocker" | "learning";
    tag?: string;
    project_path?: string;
    search?: string;
    limit?: number;
  }) {
    const limit = input.limit ?? 20;

    const metaConditions: string[] = [];
    const metaParams: unknown[] = [];
    if (input.type) {
      metaConditions.push("i.type = ?");
      metaParams.push(input.type);
    }
    if (input.project_path) {
      metaConditions.push("s.project_path = ?");
      metaParams.push(input.project_path);
    }
    if (input.tag) {
      metaConditions.push("EXISTS (SELECT 1 FROM insight_tags it WHERE it.insight_id = i.id AND it.tag = ?)");
      metaParams.push(input.tag.toLowerCase().trim());
    }

    let rows: InsightRow[];

    if (input.search) {
      rows = await this.semanticOrLike(input.search, metaConditions, metaParams, limit);
    } else {
      rows = this.fetchWithWhere(metaConditions, metaParams, [], [], limit);
    }

    if (!rows.length) {
      return { content: [{ type: "text" as const, text: "No insights found." }] };
    }

    const text = rows
      .map((r) => {
        const date = new Date(r.created_at).toISOString().slice(0, 10);
        const ref = r.file_ref ? `  ref: ${r.file_ref}\n` : "";
        const tags = r.tags ? `  tags: ${r.tags}\n` : "";
        return `[${r.type.toUpperCase()}] ${r.title}  (${date}, session: ${r.session_id.slice(0, 8)})\n${ref}${tags}  ${r.body}`;
      })
      .join("\n\n---\n\n");

    return { content: [{ type: "text" as const, text: `${rows.length} insight(s):\n\n${text}` }] };
  }

  private async semanticOrLike(
    search: string,
    metaConditions: string[],
    metaParams: unknown[],
    limit: number
  ): Promise<InsightRow[]> {
    const vecCount = (
      this.db.db.prepare("SELECT count(*) AS n FROM insight_vec").get() as { n: number }
    ).n;

    if (vecCount > 0) {
      try {
        const queryVec = await this.embeddings.embed(search);
        const knnRows = this.db.db
          .prepare(
            `SELECT insight_id, distance
             FROM insight_vec_v2
             WHERE embedding MATCH ?
             AND k = ?
             AND distance < 0.7
             ORDER BY distance`
          )
          .all(queryVec, limit * 4) as Array<{ insight_id: bigint; distance: number }>;
          // distance strict (0.4 - 0.6), sweet spot (0.6 - 0.8), and loose match (0.8 - 1.0)

        if (knnRows.length > 0) {
          const ids = knnRows.map((r) => Number(r.insight_id));
          return this.fetchByIds(ids, metaConditions, metaParams).slice(0, limit);
        }
      } catch (err) {
        process.stderr.write(
          `[project-memory] semantic search failed, falling back to LIKE: ${err}\n`
        );
      }
    }

    const like = `%${search}%`;
    return this.fetchWithWhere(metaConditions, metaParams, ["(i.title LIKE ? OR i.body LIKE ?)"], [like, like], limit);
  }

  private fetchByIds(
    ids: number[],
    metaConditions: string[],
    metaParams: unknown[]
  ): InsightRow[] {
    const placeholders = ids.map(() => "?").join(", ");
    const conditions = [`i.id IN (${placeholders})`, ...metaConditions];
    const where = `WHERE ${conditions.join(" AND ")}`;
    const orderCase = ids.map((id, i) => `WHEN i.id = ${id} THEN ${i}`).join(" ");

    return this.db.db
      .prepare(`${INSIGHT_SELECT} ${where} GROUP BY i.id ORDER BY CASE ${orderCase} ELSE ${ids.length} END`)
      .all(...ids, ...metaParams) as InsightRow[];
  }

  private fetchWithWhere(
    metaConditions: string[],
    metaParams: unknown[],
    extraConditions: string[],
    extraParams: unknown[],
    limit: number
  ): InsightRow[] {
    const all = [...metaConditions, ...extraConditions];
    const where = all.length ? `WHERE ${all.join(" AND ")}` : "";

    return this.db.db
      .prepare(`${INSIGHT_SELECT} ${where} GROUP BY i.id ORDER BY i.created_at DESC LIMIT ?`)
      .all(...metaParams, ...extraParams, limit) as InsightRow[];
  }
}
