import { describe, it, expect, vi, beforeEach } from "vitest";
import { AddInsightTool } from "../src/tools/AddInsightTool.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe('AddInsightTool', () => {
  let mockDb: any;
  let mockEmbeddings: any;
  let mockServer: any;
  let tool: AddInsightTool;
  let registeredHandler: Function;

  beforeEach(() => {
    const mockStatement = {
      run: vi.fn().mockReturnValue({ lastInsertRowid: 456, changes: 1 }),
      get: vi.fn().mockReturnValue({ id: "existing-session" }),
      all: vi.fn(),
    };

    mockDb = {
      db: {
        prepare: vi.fn().mockReturnValue(mockStatement),
        transaction: vi.fn((cb) => vi.fn((...args) => cb(...args))),
      },
      projectPath: "/app",
      insertSession: vi.fn(),
      insertInsightWithTags: vi.fn().mockReturnValue(456),
    };

    mockEmbeddings = {
      store: vi.fn().mockResolvedValue(true),
    };

    mockServer = {
      registerTool: vi.fn((name, schema, handler) => {
        registeredHandler = handler;
      }),
    };

    tool = new AddInsightTool(mockDb, mockEmbeddings);
    tool.register(mockServer as unknown as McpServer);
  });

  it('should add a single insight and store its embedding', async () => {
    const input = {
      session_id: 'session-123',
      type: 'pattern',
      title: 'Singleton usage',
      body: 'Use singletons for services.',
      project_path: '/app',
      tags: ['architecture']
    };

    const result = await (registeredHandler as any)(input);

    expect(mockDb.insertInsightWithTags).toHaveBeenCalled();
    expect(mockEmbeddings.store).toHaveBeenCalledWith(456, 'Singleton usage', 'Use singletons for services.');
    expect(result.content[0].text).toContain(`Insight #456 added to session session-123.`);
  });

  it('should create a session if it does not exist', async () => {
    // Mock session check returning undefined
    mockDb.db.prepare().get.mockReturnValue(undefined);

    const input = {
      session_id: 'new-session',
      type: 'learning',
      title: 'New API discovered',
      body: 'The SDK supports async now.',
      project_path: '/app'
    };

    await (registeredHandler as any)(input);

    // Verify session insertion was called
    expect(mockDb.insertSession).toHaveBeenCalled();
  });
});