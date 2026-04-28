import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface BaseTool {
  register(server: McpServer): void;
}
