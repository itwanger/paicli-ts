/**
 * MCP 服务生命周期管理
 */
import type { McpServerConfig } from '../types/config.js'
import { StdioMcpConnection, HttpMcpConnection, type McpConnection } from './McpConnection.js'

export class McpServerManager {
  private connections = new Map<string, McpConnection>()

  /** 启动所有 MCP 服务 */
  async startAll(servers: McpServerConfig[]): Promise<void> {
    for (const server of servers) {
      if (!server.enabled) continue
      await this.start(server)
    }
  }

  /** 启动单个 MCP 服务 */
  async start(config: McpServerConfig): Promise<void> {
    const connection = config.transport === 'stdio'
      ? new StdioMcpConnection(config.endpoint, config.args, config.env)
      : new HttpMcpConnection(config.endpoint)

    await connection.connect()
    this.connections.set(config.name, connection)
  }

  /** 停止所有 MCP 服务 */
  async stopAll(): Promise<void> {
    for (const conn of this.connections.values()) {
      await conn.disconnect()
    }
    this.connections.clear()
  }

  /** 获取连接 */
  getConnection(name: string): McpConnection | undefined {
    return this.connections.get(name)
  }

  /** 已连接的服务列表 */
  listConnected(): string[] {
    return [...this.connections.entries()]
      .filter(([, conn]) => conn.isConnected())
      .map(([name]) => name)
  }
}
