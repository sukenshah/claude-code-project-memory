import Database from "better-sqlite3";
import type { Database as DB, Statement } from "better-sqlite3";
import { mkdirSync, readFileSync } from "fs";
import { dirname } from "path";
import * as sqliteVec from "sqlite-vec";

export class DatabaseService {
  readonly db: DB;
  readonly projectPath: string;

  private readonly stmtInsertSession: Statement;
  private readonly stmtInsertSummary: Statement;
  private readonly stmtInsertInsight: Statement;
  private readonly stmtInsertTag: Statement;
  private readonly stmtInsertTranscript: Statement;
  private readonly stmtInsertEmbedding: Statement;

  constructor(dbPath: string, schemaPath: string, projectPath: string) {
    this.projectPath = projectPath;
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    sqliteVec.load(this.db);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(readFileSync(schemaPath, "utf-8"));

    this.stmtInsertSession = this.db.prepare(`
      INSERT OR REPLACE INTO sessions (id, project_path, started_at, ended_at, model, turn_count, total_tokens)
      VALUES (@id, @project_path, @started_at, @ended_at, @model, @turn_count, @total_tokens)
    `);
    this.stmtInsertSummary = this.db.prepare(`
      INSERT OR REPLACE INTO session_summaries (session_id, summary, outcome, created_at)
      VALUES (@session_id, @summary, @outcome, @created_at)
    `);
    this.stmtInsertInsight = this.db.prepare(`
      INSERT INTO insights (session_id, type, title, body, file_ref, created_at)
      VALUES (@session_id, @type, @title, @body, @file_ref, @created_at)
    `);
    this.stmtInsertTag = this.db.prepare(
      `INSERT OR IGNORE INTO insight_tags (insight_id, tag) VALUES (?, ?)`
    );
    this.stmtInsertTranscript = this.db.prepare(
      `INSERT OR REPLACE INTO transcripts (session_id, content) VALUES (?, ?)`
    );
    this.stmtInsertEmbedding = this.db.prepare(
      `INSERT OR REPLACE INTO insight_vec_v2 (insight_id, embedding) VALUES (?, ?)`
    );
  }

  insertSession(data: {
    id: string;
    project_path: string;
    started_at: number;
    ended_at: number;
    model: string | null;
    turn_count: number;
    total_tokens: number;
  }): void {
    this.stmtInsertSession.run(data);
  }

  insertSummary(data: {
    session_id: string;
    summary: string;
    outcome: string;
    created_at: number;
  }): void {
    this.stmtInsertSummary.run(data);
  }

  insertInsightWithTags(
    sessionId: string,
    type: string,
    title: string,
    body: string,
    fileRef: string | undefined,
    tags: string[]
  ): number {
    const result = this.stmtInsertInsight.run({
      session_id: sessionId,
      type,
      title,
      body,
      file_ref: fileRef ?? null,
      created_at: Date.now(),
    });
    const insightId = result.lastInsertRowid as number;
    for (const tag of tags) {
      this.stmtInsertTag.run(insightId, tag.toLowerCase().trim());
    }
    return insightId;
  }

  insertTranscript(sessionId: string, content: string): void {
    this.stmtInsertTranscript.run(sessionId, content);
  }

  insertEmbedding(insightId: BigInt, embedding: Float32Array<ArrayBufferLike>): void {
    this.stmtInsertEmbedding.run(insightId, embedding);
  }
}
