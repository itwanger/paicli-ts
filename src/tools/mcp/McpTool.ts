/**
 * MCP 工具包装器 — 将 MCP 工具暴露为 PaiCLI 工具
 */
import { z } from 'zod'
import { buildTool } from '../Tool.js'
import type { McpConnection } from '../../mcp/McpConnection.js'

export function createMcpTool(
  serverName: string,
  toolName: string,
  description: string,
  connection: McpConnection,
) {
  return buildTool({
    name: `mcp__${serverName}__${toolName}`,
    description: `[MCP:${serverName}] ${description}`,
    inputSchema: z.object({}).passthrough() as z.ZodType<Record<string, unknown>>,
    isReadOnly: true,
    isConcurrencySafe: true,
    async call(input: Record<string, unknown>) {
      try {
        const result = await connection.sendRequest('tools/call', { name: toolName, arguments: input })
        return {
          content: typeof result === 'string' ? result : JSON.stringify(result),
          displaySummary: `MCP:${serverName}.${toolName}`,
        }
      } catch (err) {
        return {
          content: `MCP error: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        }
      }
    },
  })
}
