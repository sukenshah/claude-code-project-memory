import { describe, it, expect, vi, beforeEach } from "vitest";
import { WriteSessionTool } from "../src/tools/WriteSessionTool.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe('WriteSessionTool', () => {
  let mockDb: any;
  let mockEmbeddings: any;
  let mockServer: any;
  let tool: WriteSessionTool;
  let registeredHandler: Function;

  beforeEach(() => {
    const mockStatement = {
      run: vi.fn().mockReturnValue({ lastInsertRowid: 0, changes: 1 }),
      get: vi.fn(),
      all: vi.fn(),
    };

    mockDb = {
      // Mock the high-level DatabaseService methods that WriteSessionTool calls
      insertSession: vi.fn(),
      insertSummary: vi.fn(),
      insertInsightWithTags: vi.fn().mockReturnValue(123), // Return an ID for insights
      insertTranscript: vi.fn(),
      projectPath: "/test/path", // Provide a default projectPath
      // Still need to mock the underlying db.db for transaction
      // The transaction function in better-sqlite3 returns a function that needs to be called
      // So, we mock it to return a spy that executes the callback
      // The mockStatement is not directly used by WriteSessionTool for db.db.prepare,
      // but it's good practice to have it if other tools might use it.
      db: {
        prepare: vi.fn().mockReturnValue(mockStatement),
        transaction: vi.fn((cb) => vi.fn((...args) => cb(...args))),
      },
    };

    mockEmbeddings = {
      store: vi.fn().mockResolvedValue(true),
    };

    mockServer = {
      registerTool: vi.fn((name, schema, handler) => {
        registeredHandler = handler;
      }),
    };

    tool = new WriteSessionTool(mockDb, mockEmbeddings);
    tool.register(mockServer as unknown as McpServer);
  });

  it('should successfully write a session with insights', async () => {
    const input = {
      session_id: 'test-session',
      started_at: Date.now() - 5000,
      ended_at: Date.now(),
      project_path: '/test/path',
      summary: 'Test summary',
      outcome: 'completed',
      model: 'claude-3-5-sonnet',
      insights: [
        { type: 'decision', title: 'Test Title', body: 'Test Body', tags: ['tag1'] }
      ]
    };

    const result = await (registeredHandler as any)(input);

    // Assertions for the high-level DatabaseService methods
    expect(mockDb.insertSession).toHaveBeenCalledWith(expect.objectContaining({ id: 'test-session' }));
    expect(mockDb.insertSummary).toHaveBeenCalledWith(expect.objectContaining({ session_id: 'test-session', summary: 'Test summary' }));
    expect(mockDb.insertInsightWithTags).toHaveBeenCalledWith(
      'test-session', 'decision', 'Test Title', 'Test Body', undefined, ['tag1']
    );
    // If transcript is not provided, insertTranscript should not be called
    expect(mockDb.insertTranscript).not.toHaveBeenCalled();
    expect(mockDb.db.transaction).toHaveBeenCalled();
    expect(mockEmbeddings.store).toHaveBeenCalledWith(123, 'Test Title', 'Test Body');
    expect(result.content[0].text).toContain('Session test-session saved');
  });

  it('should handle sessions with no insights', async () => {
    const input = {
      session_id: 'empty-session',
      started_at: Date.now() - 1000,
      ended_at: Date.now(),
      project_path: '/test/path',
      summary: 'Nothing done',
      outcome: 'partial',
      model: 'claude-3-5-sonnet'
    };

    const result = await (registeredHandler as any)(input);

    expect(mockDb.insertSession).toHaveBeenCalledWith(expect.objectContaining({ id: 'empty-session' }));
    expect(mockDb.insertSummary).toHaveBeenCalledWith(expect.objectContaining({ session_id: 'empty-session', summary: 'Nothing done' }));
    expect(mockDb.insertInsightWithTags).not.toHaveBeenCalled();
    expect(mockDb.insertTranscript).not.toHaveBeenCalled();
    expect(mockDb.db.transaction).toHaveBeenCalled();
    expect(mockEmbeddings.store).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain('Session empty-session saved');
  });
});