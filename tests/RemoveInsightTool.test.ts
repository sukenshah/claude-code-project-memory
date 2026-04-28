import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemoveInsightTool } from '../src/tools/RemoveInsightTool';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';

describe('RemoveInsightTool', () => {
  let mockDb: any;
  let mockServer: any;
  let tool: RemoveInsightTool;
  let registeredHandler: Function;

  beforeEach(() => {
    const mockPrepare = vi.fn().mockReturnValue({
      all: vi.fn(),
      run: vi.fn()
    });

    mockDb = {
      db: {
        prepare: mockPrepare,
        transaction: vi.fn((cb) => cb)
      }
    };

    mockServer = {
      registerTool: vi.fn((name, schema, handler) => {
        registeredHandler = handler;
      })
    };

    tool = new RemoveInsightTool(mockDb);
    tool.register(mockServer as unknown as McpServer);
  });

  it('should return error if neither id nor title is provided', async () => {
    const result = await (registeredHandler as any)({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error');
  });

  it('should remove insights when matches are found', async () => {
    mockDb.db.prepare().all.mockReturnValue([{ id: 1 }, { id: 2 }]);
    
    const result = await (registeredHandler as any)({ id: 1 });

    expect(mockDb.db.transaction).toHaveBeenCalled();
    expect(result.content[0].text).toContain('Removed 2 insight(s)');
    expect(result.content[0].text).toContain('#1, #2');
  });

  it('should notify if no matching insights are found', async () => {
    mockDb.db.prepare().all.mockReturnValue([]);
    
    const result = await (registeredHandler as any)({ title: 'Non-existent' });

    expect(result.content[0].text).toBe('No matching insights found.');
  });
});