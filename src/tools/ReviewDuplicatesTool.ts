import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DatabaseService } from "../services/DatabaseService.js";
import type { EmbeddingService } from "../services/EmbeddingService.js";
import type { BaseTool } from "./BaseTool.js";

type InsightRow = {
  id: number;
  type: string;
  title: string;
  body: string;
  created_at: number;
  session_id: string;
  tags: string | null;
};

export class ReviewDuplicatesTool implements BaseTool {
  constructor(
    private readonly db: DatabaseService,
    private readonly embeddings: EmbeddingService
  ) {}

  register(server: McpServer): void {
    server.registerTool(
      "review_duplicates",
      {
        description:
          "Scan all stored insights for duplicates or near-duplicates. " +
          "Uses vector similarity when embeddings are available, falling back to title word-overlap. " +
          "Returns grouped clusters of similar insights with their IDs so you can remove redundant ones.",
        inputSchema: {
          threshold: z
            .number()
            .optional()
            .default(0.35)
            .describe(
              "Similarity threshold for vector distance (0–1, lower = stricter). Default 0.35. " +
                "Only used when embeddings are available."
            ),
          title_overlap: z
            .number()
            .optional()
            .default(0.6)
            .describe(
              "Jaccard word-overlap ratio for title fallback (0–1, higher = stricter). Default 0.6."
            ),
        },
      },
      this.handle.bind(this)
    );
  }

  private async handle(input: { threshold?: number; title_overlap?: number }) {
    const threshold = input.threshold ?? 0.35;
    const titleOverlap = input.title_overlap ?? 0.6;

    const rows = this.db.db
      .prepare(
        `SELECT i.id, i.type, i.title, i.body, i.created_at, i.session_id,
                GROUP_CONCAT(it.tag, ', ') AS tags
         FROM insights i
         LEFT JOIN insight_tags it ON it.insight_id = i.id
         GROUP BY i.id
         ORDER BY i.created_at ASC`
      )
      .all() as InsightRow[];

    if (rows.length < 2) {
      return { content: [{ type: "text" as const, text: "Fewer than 2 insights stored — nothing to compare." }] };
    }

    const vecCount = (
      this.db.db.prepare("SELECT count(*) AS n FROM insight_vec_v2").get() as { n: number }
    ).n;

    const pairs: Array<[number, number, number]> = []; // [idA, idB, score]

    if (vecCount > 0) {
      pairs.push(...(await this.vectorPairs(rows, threshold)));
    }

    if (pairs.length === 0) {
      pairs.push(...this.titlePairs(rows, titleOverlap));
    }

    if (pairs.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text:
              `No duplicates found among ${rows.length} insights ` +
              `(vector threshold ${threshold}, title overlap ${titleOverlap}).`,
          },
        ],
      };
    }

    const clusters = this.clusterPairs(pairs);
    const byId = new Map(rows.map((r) => [r.id, r]));

    const sections = clusters.map((cluster, i) => {
      const lines = [`Cluster ${i + 1} (${cluster.length} insights):`];
      for (const id of cluster) {
        const r = byId.get(id)!;
        const date = new Date(r.created_at).toISOString().slice(0, 10);
        const tags = r.tags ? ` [${r.tags}]` : "";
        lines.push(`  #${r.id} [${r.type}] ${r.title}${tags}  (${date})`);
        lines.push(`       ${r.body.slice(0, 120).replace(/\n/g, " ")}${r.body.length > 120 ? "…" : ""}`);
      }
      return lines.join("\n");
    });

    const text = [
      `Found ${clusters.length} duplicate cluster(s) across ${rows.length} total insights.`,
      `Use remove_insight with the #ID to delete redundant entries.`,
      "",
      ...sections,
    ].join("\n\n");

    return { content: [{ type: "text" as const, text }] };
  }

  private async vectorPairs(
    rows: InsightRow[],
    threshold: number
  ): Promise<Array<[number, number, number]>> {
    const pairs: Array<[number, number, number]> = [];
    const seen = new Set<string>();

    for (const row of rows) {
      let queryVec: Float32Array;
      try {
        queryVec = await this.embeddings.embed(row.title + " " + row.body.slice(0, 200));
      } catch {
        return [];
      }

      const neighbors = this.db.db
        .prepare(
          `SELECT insight_id, distance
           FROM insight_vec_v2
           WHERE embedding MATCH ?
           AND k = ?
           AND distance < ?
           ORDER BY distance`
        )
        .all(queryVec, 10, threshold) as Array<{ insight_id: bigint; distance: number }>;

      for (const n of neighbors) {
        const otherId = Number(n.insight_id);
        if (otherId === row.id) continue;
        const key = [Math.min(row.id, otherId), Math.max(row.id, otherId)].join(":");
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push([row.id, otherId, n.distance]);
      }
    }

    return pairs;
  }

  private titlePairs(
    rows: InsightRow[],
    minOverlap: number
  ): Array<[number, number, number]> {
    const tokenize = (s: string) =>
      new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean));

    const tokens = rows.map((r) => ({ id: r.id, set: tokenize(r.title) }));
    const pairs: Array<[number, number, number]> = [];

    for (let i = 0; i < tokens.length; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        const a = tokens[i].set;
        const b = tokens[j].set;
        const intersection = [...a].filter((w) => b.has(w)).length;
        const union = new Set([...a, ...b]).size;
        const jaccard = union === 0 ? 0 : intersection / union;
        if (jaccard >= minOverlap) {
          pairs.push([tokens[i].id, tokens[j].id, jaccard]);
        }
      }
    }

    return pairs;
  }

  private clusterPairs(pairs: Array<[number, number, number]>): number[][] {
    const parent = new Map<number, number>();

    const find = (x: number): number => {
      if (!parent.has(x)) parent.set(x, x);
      if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
      return parent.get(x)!;
    };

    const union = (a: number, b: number) => {
      parent.set(find(a), find(b));
    };

    for (const [a, b] of pairs) {
      union(a, b);
    }

    const groups = new Map<number, number[]>();
    for (const [node] of parent) {
      const root = find(node);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root)!.push(node);
    }

    return [...groups.values()].filter((g) => g.length > 1).map((g) => g.sort((a, b) => a - b));
  }
}
