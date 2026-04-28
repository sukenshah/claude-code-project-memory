import { pipeline } from "@huggingface/transformers";
import type { DatabaseService } from "./DatabaseService.js";

type Embedder = (text: string, opts: Record<string, unknown>) => Promise<{ data: Float32Array }>;

export class EmbeddingService {
  private embedder: Embedder | null = null;

  constructor(private readonly db: DatabaseService) {}

  private async getEmbedder(): Promise<Embedder> {
    if (!this.embedder) {
      this.embedder = await pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2"
      ) as unknown as Embedder;
    }
    return this.embedder;
  }

  async embed(text: string): Promise<Float32Array> {
    const model = await this.getEmbedder();
    const out = await model(text, { pooling: "mean", normalize: true });
    return out.data;
  }

  async store(insightId: number, title: string, body: string): Promise<boolean> {
    try {
      const vec = await this.embed(`${title}. ${body}`);
      this.db.insertEmbedding(BigInt(insightId), vec);
      return true;
    } catch (err) {
      process.stderr.write(`[project-memory] embedding failed for insight #${insightId}: ${err}\n`);
      return false;
    }
  }
}
