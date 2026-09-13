export { TDK, TDKClient } from "./tdk";
export * from "./types";
export * from "./errors";
export * from "./morphology";
export { VERSION } from "./version";

import { createMcpServer as createMcpServerImpl, runMcpServer as runMcpServerImpl } from "./mcp";

/**
 * @deprecated Import from `tdk-api-wrapper/mcp` instead. The main entry will
 * stop re-exporting MCP helpers in 2.0, so plain dictionary users no longer
 * load `@modelcontextprotocol/sdk` and `zod`.
 */
export const createMcpServer = createMcpServerImpl;

/** @deprecated Import from `tdk-api-wrapper/mcp` instead (removed from the main entry in 2.0). */
export const runMcpServer = runMcpServerImpl;
