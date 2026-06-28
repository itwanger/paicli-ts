/**
 * Ink 流式 TUI 渲染器
 */
import type { Instance } from 'ink'
import type { Renderer, StatusInfo, ApprovalRequest, ApprovalResult } from './Renderer.js'
import type { StreamEvent } from '../llm/types.js'
import type { ToolResult } from '../types/tool.js'

/**
 * InlineRenderer — Ink TUI 渲染器
 * 注意：完整的 Ink App 在 main.tsx 中实现，这里提供程序化的渲染接口
 */
export class InlineRenderer implements Renderer {
  readonly mode = 'inline' as const
  private instance: Instance | null = null
  private status: StatusInfo | null = null

  async start(): Promise<void> {
    // Ink 实例在 main.tsx 中创建
  }

  async stop(): Promise<void> {
    this.instance?.unmount()
    this.instance = null
  }

  showWelcome(version: string): void {
    const status = this.status
    const model = status?.model ?? 'unknown'
    const provider = status?.provider ? ` (${status.provider})` : ''
    const mcp = `${status?.connectedMcpServers ?? 0}/${status?.mcpServers ?? 0}`
    const skills = `${status?.loadedSkills ?? 0}/${status?.skills ?? 0}`
    const mode = status?.agentMode ?? 'ReAct'

    console.log()
    console.log(`  \x1b[92m\x1b[1m██████╗ \x1b[0m  \x1b[1mPaiCLI \x1b[92mπ\x1b[0m  \x1b[90mv${version}\x1b[0m`)
    console.log(`  \x1b[92m\x1b[1m╚═██╔═╝\x1b[0m  \x1b[90mModel\x1b[0m ${model}${provider}`)
    console.log(`  \x1b[92m\x1b[1m  ██║  \x1b[0m  \x1b[90mMCP\x1b[0m ${mcp} · \x1b[90m${status?.toolCount ?? 0} tools\x1b[0m · ${skills} skills · ${mode}`)
    console.log(`  \x1b[92m\x1b[1m  ██║  \x1b[0m  \x1b[90mReAct · Plan · MCP · Browser · Image · Tools · Memory · RAG\x1b[0m`)
    console.log(`  \x1b[92m\x1b[1m  ╚═╝  \x1b[0m`)
    console.log()
    console.log('Tips for getting started:')
    console.log('1. Type / for commands and Tab completion')
    console.log('2. Ask coding questions, edit code or run commands')
    console.log('3. Attach context with @path or @image')
    console.log()
  }

  showPrompt(): void {
    if (this.status) {
      this.renderStatusBar(this.status)
    }
  }

  beginThinking(): void {
    process.stdout.write('\x1b[34m💭 Thinking...\x1b[0m')
  }

  appendThinking(_text: string): void {}

  endThinking(): void {
    process.stdout.write('\r\x1b[K')
  }

  beginText(): void {}

  appendText(text: string): void {
    process.stdout.write(text)
  }

  endText(): void {
    console.log()
  }

  showToolCall(name: string, input: Record<string, unknown>): void {
    const summary = Object.entries(input)
      .slice(0, 3)
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v.slice(0, 40) : JSON.stringify(v)}`)
      .join(', ')
    console.log(`\x1b[33m⚡ ${name}\x1b[0m(${summary})`)
  }

  showToolResult(result: ToolResult): void {
    const color = result.isError ? '\x1b[31m' : '\x1b[36m'
    const label = result.isError ? '✗' : '✓'
    const summary = result.displaySummary ?? result.content.slice(0, 100)
    console.log(`${color}${label}\x1b[0m ${summary}`)
  }

  handleStreamEvent(event: StreamEvent): void {
    switch (event.type) {
      case 'text_delta':
        this.appendText(event.text)
        break
      case 'tool_use_start':
        console.log(`\x1b[33m⚡ ${event.name}\x1b[0m`)
        break
      case 'message_end':
        console.log()
        break
    }
  }

  showError(error: Error): void {
    console.error(`\x1b[31mError: ${error.message}\x1b[0m`)
  }

  showStatus(_status: StatusInfo): void {
    this.status = _status
  }

  async requestApproval(_request: ApprovalRequest): Promise<ApprovalResult> {
    // 由 Ink PermissionPrompt 组件处理
    return { decision: 'approve' }
  }

  async readInput(): Promise<string> {
    const readline = await import('node:readline')
    return new Promise((resolve) => {
      process.stdout.write('\x1b[35m>\x1b[0m ')
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      rl.question('', (answer) => {
        rl.close()
        resolve(answer)
      })
    })
  }

  clear(): void {
    console.clear()
  }

  private renderStatusBar(status: StatusInfo): void {
    const width = process.stdout.columns && process.stdout.columns > 40 ? process.stdout.columns : 100
    const divider = '─'.repeat(Math.min(width, 140))
    const contextPercent = status.tokenLimit > 0
      ? Math.min(100, Math.round((status.tokensUsed / status.tokenLimit) * 100))
      : 0
    const provider = status.provider ? ` (${status.provider})` : ''
    const ctx = `${contextPercent}% (${formatCompact(status.tokensUsed)}/${formatCompact(status.tokenLimit)})`
    const cwd = compactPath(status.cwd ?? process.cwd())
    const hitl = status.hitlMode ?? 'auto'
    const memory = status.memoryEnabled ? 'Memory' : 'Memory off'

    console.log(divider)
    console.log(
      `\x1b[93mYOLO Ctrl+Y to enable HITL\x1b[0m    ` +
      `\x1b[38;5;213m${status.loadedSkills ?? 0} skills\x1b[0m · ` +
      `\x1b[38;5;147m${status.connectedMcpServers ?? 0} MCP servers\x1b[0m`,
    )
    console.log(
      `\x1b[38;5;213mAuto Model\x1b[0m · \x1b[38;5;147m${status.model}${provider}\x1b[0m ` +
      `\x1b[92m${status.statusText ?? 'idle'}\x1b[0m · ` +
      `\x1b[36mctx\x1b[0m \x1b[92m${ctx}\x1b[0m · ` +
      `turns ${status.conversationTurns ?? 0} · ${memory} · hitl ${hitl} · ${cwd}`,
    )
  }
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}k`
  return String(value)
}

function compactPath(path: string): string {
  const home = process.env.HOME
  const normalized = home && path.startsWith(home) ? `~${path.slice(home.length)}` : path
  if (normalized.length <= 48) return normalized
  return `…${normalized.slice(-47)}`
}
