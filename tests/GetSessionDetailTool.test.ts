import { describe, it, expect, vi, beforeEach } from "vitest";
import { GetSessionDetailTool } from "../src/tools/GetSessionDetailTool.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe('GetSessionDetailTool', () => {
  let mockDb: any;
  let mockServer: any;
  let tool: GetSessionDetailTool;
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

    mockServer = {
      registerTool: vi.fn((name, schema, handler) => {
        registeredHandler = handler;
      }),
    };

    tool = new GetSessionDetailTool(mockDb);
    tool.register(mockServer as unknown as McpServer);
  });

  it('should return session details and its insights', async () => {
    const sessionData = {
      id: 'session-abc',
      started_at: Date.now() - 60000,
      ended_at: Date.now(),
      summary: 'Fixed auth bug',
      outcome: 'completed',
      model: 'claude-3-5-sonnet',
      project_path: '/app',
      turn_count: 5,
      total_tokens: 1000,
    };
    
    const insightData = [
      { id: 1, type: 'mistake', title: 'Wrong env var', body: 'Used DB_URL instead of DATABASE_URL', tags: 'env, bug' }
    ];

    mockDb.db.prepare().get
      .mockReturnValueOnce(sessionData)
      .mockReturnValueOnce({ content: 'User: help\nAssistant: OK' });
    mockDb.db.prepare().all.mockReturnValue(insightData);

    const result = await (registeredHandler as any)({ session_id: 'session-abc', include_transcript: true });

    expect(result.content[0].text).toContain('Session: session-abc');
    expect(result.content[0].text).toContain('Fixed auth bug');
    expect(result.content[0].text).toContain('[MISTAKE] Wrong env var');
    expect(result.content[0].text).toContain('User: help');
  });

  it('should not include transcript if not requested', async () => {
    mockDb.db.prepare().get.mockReturnValue({ 
      id: 's1', 
      started_at: Date.now(), 
      ended_at: Date.now(),
      project_path: '/app',
      turn_count: 0,
      total_tokens: 0,
      summary: 'test',
      outcome: 'completed'
    });
    mockDb.db.prepare().all.mockReturnValue([]);

    const result = await (registeredHandler as any)({ session_id: 's1', include_transcript: false });

    expect(result.content[0].text).not.toContain('Transcript:');
    expect(result.content[0].text).not.toContain('secret');
  });

  it('should return error message for non-existent session', async () => {
    mockDb.db.prepare().get.mockReturnValue(undefined);

    const result = await (registeredHandler as any)({ session_id: 'ghost' });

    expect(result.content[0].text).toBe('Session ghost not found.');
  });
});