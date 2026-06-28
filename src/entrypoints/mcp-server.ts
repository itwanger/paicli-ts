/**
 * MCP 服务模式入口
 * 将 PaiCLI 作为 MCP Server 暴露给外部客户端
 */

import { McpServerManager } from '../mcp/McpServerManager.js'
import { getBuiltinTools } from '../tools/builtins/index.js'
import type { ToolContext } from '../types/tool.js'

export interface McpServeOptions {
  /** 传输方式 */
  transport: 'stdio' | 'http'
  /** HTTP 端口 (仅 http 模式) */
  port?: number
}

/** 默认 MCP 工具上下文 */
function defaultContext(): ToolContext {
  return { cwd: process.cwd(), config: {}, abortSignal: undefined }
}

/**
 * 启动 MCP 服务模式
 * 注册内置工具并等待客户端连接
 */
export async function startMcpServer(options: McpServeOptions): Promise<void> {
  const tools = getBuiltinTools()

  if (options.transport === 'stdio') {
    // stdio 模式 — 通过 stdin/stdout 通信
    const readline = await import('node:readline')
    const rl = readline.createInterface({ input: process.stdin })

    rl.on('line', async (line: string) => {
      try {
        const request = JSON.parse(line)
        const { method, params, id } = request

        if (method === 'tools/list') {
          const toolList = tools.map(t => {
            const def = t.getDefinition()
            return { name: def.name, description: def.description, inputSchema: def.parameters }
          })
          process.stdout.write(JSON.stringify({ id, result: { tools: toolList } }) + '\n')
        } else if (method === 'tools/call') {
          const tool = tools.find(t => t.name === params?.name)
          if (!tool) {
            process.stdout.write(JSON.stringify({ id, error: { message: `Tool "${params?.name}" not found` } }) + '\n')
            return
          }
          const ctx = defaultContext()
          const result = await tool.execute(params?.arguments ?? {}, params?._toolUseId ?? 'mcp', ctx)
          process.stdout.write(JSON.stringify({ id, result: { content: [{ type: 'text', text: result.content }] } }) + '\n')
        } else {
          process.stdout.write(JSON.stringify({ id, error: { message: `Unknown method: ${method}` } }) + '\n')
        }
      } catch (e) {
        process.stdout.write(JSON.stringify({ error: { message: String(e) } }) + '\n')
      }
    })

    // 保持进程运行直到 stdin 关闭
    await new Promise<void>((resolve) => rl.on('close', resolve))
  } else {
    // HTTP 模式 — 简单的 JSON-RPC over HTTP
    const { createServer } = await import('node:http')
    const port = options.port ?? 3000

    const server = createServer(async (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405)
        res.end('Method Not Allowed')
        return
      }

      let body = ''
      for await (const chunk of req) body += chunk

      try {
        const request = JSON.parse(body)
        const { method, params, id } = request

        if (method === 'tools/list') {
          const toolList = tools.map(t => {
            const def = t.getDefinition()
            return { name: def.name, description: def.description, inputSchema: def.parameters }
          })
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ id, result: { tools: toolList } }))
        } else if (method === 'tools/call') {
          const tool = tools.find(t => t.name === params?.name)
          if (!tool) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ id, error: { message: `Tool "${params?.name}" not found` } }))
            return
          }
          const ctx = defaultContext()
          const result = await tool.execute(params?.arguments ?? {}, params?._toolUseId ?? 'mcp', ctx)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ id, result: { content: [{ type: 'text', text: result.content }] } }))
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ id, error: { message: `Unknown method: ${method}` } }))
        }
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { message: String(e) } }))
      }
    })

    server.listen(port, () => {
      process.stderr.write(`PaiCLI MCP server listening on port ${port}\n`)
    })
  }
}

export { McpServerManager }
