import { describe, it, expect, vi, beforeEach } from "vitest";
import { GetRecentSessionsTool } from "../src/tools/GetRecentSessionsTool.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe('GetRecentSessionsTool', () => {
  let mockDb: any;
  let mockServer: any;
  let tool: GetRecentSessionsTool;
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

    tool = new GetRecentSessionsTool(mockDb);
    tool.register(mockServer as unknown as McpServer);
  });

  it('should return a list of recent sessions', async () => {
    const now = Date.now();
    const mockSessions = [
      {
        id: "session-1-id",
        project_path: "/app",
        started_at: now - 60000,
        ended_at: now,
        model: "claude-3-5-sonnet",
        turn_count: 5,
        summary: "Session 1",
        outcome: "completed",
        insight_count: 2
      },
      {
        id: "session-2-id",
        project_path: "/app",
        started_at: now - 120000,
        ended_at: now - 60000,
        model: "gpt-4o",
        turn_count: 10,
        summary: "Session 2",
        outcome: "partial",
        insight_count: 0
      }
    ];
    mockDb.db.prepare().all.mockReturnValue(mockSessions);

    const result = await (registeredHandler as any)({ limit: 5 });

    expect(result.content[0].text).toContain('session-');
    expect(result.content[0].text).toContain('Session 1');
    expect(result.content[0].text).toContain('Session 2');
  });

  it('should indicate when no sessions are found', async () => {
    mockDb.db.prepare().all.mockReturnValue([]);

    const result = await (registeredHandler as any)({});

    expect(result.content[0].text).toBe('No sessions found.');
  });

  it('should use default limit if not provided', async () => {
    mockDb.db.prepare().all.mockReturnValue([]);
    await (registeredHandler as any)({});
    expect(mockDb.db.prepare().all).toHaveBeenCalledWith(10);
  });

  it('should include WHERE clause when project_path provided', async () => {
    mockDb.db.prepare().all.mockReturnValue([]);

    await (registeredHandler as any)({ project_path: '/my/project' });

    const prepareCalls = mockDb.db.prepare.mock.calls;
    const sql = prepareCalls.find((c: any[]) =>
      typeof c[0] === 'string' && c[0].includes('FROM sessions')
    )?.[0] as string;

    expect(sql).toContain('WHERE s.project_path = ?');
  });

  it('should render unknown for null model and outcome', async () => {
    const now = Date.now();
    mockDb.db.prepare().all.mockReturnValue([{
      id: 'null-fields-session',
      project_path: '/app',
      started_at: now - 60000,
      ended_at: now,
      model: null,
      turn_count: 0,
      summary: null,
      outcome: null,
      insight_count: 0,
    }]);

    const result = await (registeredHandler as any)({});
    const text = result.content[0].text;

    expect(text).toContain('outcome: unknown');
    expect(text).toContain('model: unknown');
  });
});