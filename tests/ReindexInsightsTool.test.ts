import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReindexInsightsTool } from '../src/tools/ReindexInsightsTool';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';

describe('ReindexInsightsTool', () => {
  let mockDb: any;
  let mockEmbeddings: any;
  let mockServer: any;
  let tool: ReindexInsightsTool;
  let registeredHandler: Function;

  beforeEach(() => {
    mockDb = {
      db: {
        prepare: vi.fn().mockReturnValue({
          all: vi.fn()
        })
      }
    };

    mockEmbeddings = {
      store: vi.fn()
    };

    mockServer = {
      registerTool: vi.fn((name, schema, handler) => {
        registeredHandler = handler;
      })
    };

    tool = new ReindexInsightsTool(mockDb, mockEmbeddings);
    tool.register(mockServer as unknown as McpServer);
  });

  it('should reindex insights missing from vector table', async () => {
    mockDb.db.prepare().all.mockReturnValue([
      { id: 1, title: 'T1', body: 'B1' },
      { id: 2, title: 'T2', body: 'B2' }
    ]);
    
    mockEmbeddings.store.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    const result = await (registeredHandler as any)({});

    expect(mockEmbeddings.store).toHaveBeenCalledTimes(2);
    expect(result.content[0].text).toBe('Reindexed 2 insight(s).');
  });
});