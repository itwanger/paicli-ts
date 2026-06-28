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

  async start(): Promise<void> {
    // Ink 实例在 main.tsx 中创建
  }

  async stop(): Promise<void> {
    this.instance?.unmount()
    this.instance = null
  }

  showWelcome(version: string): void {
    console.log(`\x1b[32m\x1b[1m  π PaiCLI\x1b[0m v${version}`)
    console.log('  Terminal AI Agent\n')
  }

  showPrompt(): void {
    // 由 Ink 组件处理
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
    // 由 Ink StatusBar 组件处理
  }

  async requestApproval(_request: ApprovalRequest): Promise<ApprovalResult> {
    // 由 Ink PermissionPrompt 组件处理
    return { decision: 'approve' }
  }

  async readInput(): Promise<string> {
    const readline = await import('node:readline')
    return new Promise((resolve) => {
      process.stdout.write('\x1b[32m\x1b[1mπ\x1b[0m ')
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
}
