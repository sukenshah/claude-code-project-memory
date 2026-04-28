import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { join } from "path";
import { fileURLToPath } from "url";
import { DatabaseService } from "./services/DatabaseService.js";
import { EmbeddingService } from "./services/EmbeddingService.js";
import { AddInsightTool } from "./tools/AddInsightTool.js";
import { GetRecentSessionsTool } from "./tools/GetRecentSessionsTool.js";
import { GetSessionDetailTool } from "./tools/GetSessionDetailTool.js";
import { QueryInsightsTool } from "./tools/QueryInsightsTool.js";
import { ReindexInsightsTool } from "./tools/ReindexInsightsTool.js";
import { RemoveInsightTool } from "./tools/RemoveInsightTool.js";
import { WriteSessionTool } from "./tools/WriteSessionTool.js";

const PROJECT_PATH = process.env.PROJECT_PATH ?? process.cwd();
const DB_PATH = join(PROJECT_PATH, ".claude", "project-memory", "insights.db");
const SCHEMA_PATH = join(fileURLToPath(import.meta.url), "..", "..", "config", "schema.sql");

const db = new DatabaseService(DB_PATH, SCHEMA_PATH, PROJECT_PATH);
const embeddings = new EmbeddingService(db);

const server = new McpServer({ name: "project-memory-mcp", version: "1.0.0" });

const tools = [
  new WriteSessionTool(db, embeddings),
  new AddInsightTool(db, embeddings),
  new RemoveInsightTool(db),
  new QueryInsightsTool(db, embeddings),
  new GetRecentSessionsTool(db),
  new GetSessionDetailTool(db),
  new ReindexInsightsTool(db, embeddings),
];

for (const tool of tools) tool.register(server);

const transport = new StdioServerTransport();
await server.connect(transport);
