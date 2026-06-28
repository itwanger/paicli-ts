/**
 * CLI 入口 — Commander.js 参数解析
 */
import { Command } from 'commander'
import { VERSION } from '../index.js'
import { loadConfig } from '../config/Config.js'
import { startRepl } from '../main.js'

const program = new Command()

program
  .name('paicli')
  .description('PaiCLI — Terminal AI Agent')
  .version(VERSION)
  .option('-p, --prompt <text>', 'Print mode: single prompt, non-interactive')
  .option('-m, --model <model>', 'Override model name')
  .option('--provider <provider>', 'Override LLM provider')
  .option('--plain', 'Use plain text rendering (no TUI)')
  .option('--cwd <path>', 'Working directory', process.cwd())

program
  .command('mcp')
  .description('MCP server management')
  .command('serve')
  .description('Start as MCP server')
  .option('--transport <transport>', 'Transport type: stdio or http', 'stdio')
  .option('--port <port>', 'HTTP port when using --transport http', '3000')
  .action(async (options) => {
    const transport = options.transport === 'http' ? 'http' : 'stdio'
    const port = Number.parseInt(options.port, 10)
    const { startMcpServer } = await import('./mcp-server.js')
    await startMcpServer({ transport, port: Number.isFinite(port) ? port : 3000 })
  })

program.action(async (options) => {
  const cwd = options.cwd || process.cwd()

  // 加载配置
  const config = loadConfig({
    projectRoot: cwd,
    overrides: {
      llm: {
        provider: options.provider,
        model: options.model,
      } as Record<string, unknown>,
      renderMode: options.plain ? 'plain' : undefined,
    } as Record<string, unknown>,
  })

  if (options.prompt) {
    // Print 模式
    config.renderMode = 'plain'
    const { createLlmClient } = await import('../llm/LlmClientFactory.js')
    const { ToolRegistry } = await import('../tools/registry.js')
    const { getBuiltinTools } = await import('../tools/builtins/index.js')
    const { QueryEngine } = await import('../QueryEngine.js')

    const llmClient = createLlmClient(config.llm)
    const toolRegistry = new ToolRegistry()
    toolRegistry.registerAll(getBuiltinTools())

    const engine = new QueryEngine({ llmClient, toolRegistry, config, cwd })
    const result = await engine.askComplete(options.prompt)
    console.log(result.text)
    return
  }

  // 交互式 TUI 模式
  await startRepl(config, cwd)
})

export function run(): void {
  program.parseAsync().catch((err) => {
    console.error('Fatal error:', err instanceof Error ? err.message : String(err))
    process.exit(1)
  })
}
