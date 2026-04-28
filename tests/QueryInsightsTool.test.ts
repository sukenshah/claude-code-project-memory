import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryInsightsTool } from "../src/tools/QueryInsightsTool.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe("QueryInsightsTool", () => {
  let mockDb: any;
  let mockEmbeddings: any;
  let mockServer: any;
  let tool: QueryInsightsTool;
  let registeredHandler: Function;

  beforeEach(() => {
    const mockStatement = {
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn(),
    };

    mockDb = {
      db: {
        prepare: vi.fn().mockReturnValue(mockStatement),
        transaction: vi.fn((cb) => vi.fn((...args) => cb(...args))),
      },
    };

    mockEmbeddings = {
      embed: vi.fn().mockResolvedValue(new Float32Array(384).fill(0)),
    };

    mockServer = {
      registerTool: vi.fn((name, schema, handler) => {
        registeredHandler = handler;
      }),
    };

    tool = new QueryInsightsTool(mockDb, mockEmbeddings);
    tool.register(mockServer as unknown as McpServer);
  });

  it("should use default limit of 20 and return 'No insights found.' message (Lines 69-70, 73-74)", async () => {
    // Mock empty results from database
    mockDb.db.prepare().all.mockReturnValue([]);

    const result = await (registeredHandler as any)({});

    // Verify line 69-70: check if the default limit of 20 was passed to the query execution
    const calls = mockDb.db.prepare().all.mock.calls;
    const lastCallArgs = calls[calls.length - 1];
    expect(lastCallArgs[lastCallArgs.length - 1]).toBe(20);

    // Verify line 73-74: check for the correct empty state response
    expect(result.content[0].text).toBe("No insights found.");
  });

  it("should format multiple insights including file references and tags (Lines 131-138)", async () => {
    const now = Date.now();
    const mockRows = [
      {
        id: 1,
        type: "decision",
        title: "Database Selection",
        body: "Chose SQLite for portability.",
        file_ref: "src/db.ts",
        tags: "db, sql",
        created_at: now,
        session_id: "session-123",
        project_path: "/app",
      },
      {
        id: 2,
        type: "mistake",
        title: "Async Race Condition",
        body: "Parallel processing without locks caused data corruption.",
        file_ref: null,
        tags: null,
        created_at: now,
        session_id: "session-456",
        project_path: "/app",
      },
    ];
    mockDb.db.prepare().all.mockReturnValue(mockRows);

    const result = await (registeredHandler as any)({ type: "decision" });
    const text = result.content[0].text;

    // Verify lines 131-138: ensure mapping logic handles presence/absence of optional fields
    expect(text).toContain("2 insight(s):");
    expect(text).toContain("[DECISION] Database Selection");
    expect(text).toContain("ref: src/db.ts");
    expect(text).toContain("tags: db, sql");
    expect(text).toContain("[MISTAKE] Async Race Condition");
  });

  it("should apply tag and project_path filters correctly", async () => {
    mockDb.db.prepare().all.mockReturnValue([]);
    
    await (registeredHandler as any)({ 
      tag: "auth", 
      project_path: "/test/project" 
    });

    const prepareCalls = mockDb.db.prepare.mock.calls;
    const sql = prepareCalls.find((call: any) => typeof call[0] === "string" && call[0].includes("SELECT i.id"))[0];
    
    expect(sql).toContain("s.project_path = ?");
    expect(sql).toContain("EXISTS (SELECT 1 FROM insight_tags it");
  });

  it("should perform successful semantic search and return matched insights", async () => {
    const now = Date.now();
    // 1. Mock vecCount > 0
    mockDb.db.prepare().get.mockReturnValue({ n: 10 });
    
    // 2. Mock KNN result
    mockDb.db.prepare().all.mockReturnValueOnce([{ insight_id: 123n, distance: 0.1 }]);
    
    // 3. Mock fetchByIds result
    mockDb.db.prepare().all.mockReturnValueOnce([{
      id: 123,
      type: "pattern",
      title: "Semantic Match",
      body: "Found via vector search",
      created_at: now,
      session_id: "session-vec",
      project_path: "/app",
      tags: "vector"
    }]);

    const result = await (registeredHandler as any)({ search: "how to use vectors" });
    
    expect(mockEmbeddings.embed).toHaveBeenCalledWith("how to use vectors");
    expect(result.content[0].text).toContain("1 insight(s)");
    expect(result.content[0].text).toContain("Semantic Match");
  });

  it("should fallback to LIKE search when embedding model fails", async () => {
    mockDb.db.prepare().get.mockReturnValue({ n: 5 });
    mockEmbeddings.embed.mockRejectedValue(new Error("Embedding failed"));
    mockDb.db.prepare().all.mockReturnValue([]); // Fallback query returns nothing

    const result = await (registeredHandler as any)({ search: "emergency fallback" });

    // Verify fallback query used LIKE
    expect(mockDb.db.prepare).toHaveBeenCalledWith(expect.stringContaining("i.title LIKE ? OR i.body LIKE ?"));
    expect(result.content[0].text).toBe("No insights found.");
  });

  it("should use LIKE search when vecCount is 0", async () => {
    // Mock vecCount = 0
    mockDb.db.prepare().get.mockReturnValue({ n: 0 });
    mockDb.db.prepare().all.mockReturnValue([]);

    await (registeredHandler as any)({ search: "direct search" });

    expect(mockDb.db.prepare).toHaveBeenCalledWith(expect.stringContaining("i.title LIKE ? OR i.body LIKE ?"));
    expect(mockEmbeddings.embed).not.toHaveBeenCalled();
  });

  it("should use LIKE search when KNN returns no results", async () => {
    // Mock vecCount > 0 but KNN empty
    mockDb.db.prepare().get.mockReturnValue({ n: 5 });
    mockDb.db.prepare().all.mockReturnValueOnce([]); // KNN call
    mockDb.db.prepare().all.mockReturnValueOnce([]); // Fallback LIKE call

    await (registeredHandler as any)({ search: "no match" });

    expect(mockDb.db.prepare).toHaveBeenCalledWith(expect.stringContaining("i.title LIKE ? OR i.body LIKE ?"));
  });
});