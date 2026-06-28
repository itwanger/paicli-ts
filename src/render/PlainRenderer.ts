/**
 * 纯文本渲染器 — 用于管道模式和非 TTY 环境
 */

import type { Renderer, StatusInfo, ApprovalRequest, ApprovalResult } from './Renderer.js'
import type { StreamEvent } from '../llm/types.js'
import type { ToolResult } from '../types/tool.js'
import { LineReader } from './LineReader.js'

export class PlainRenderer implements Renderer {
  readonly mode = 'plain' as const
  private status: StatusInfo | null = null
  private lineReader: LineReader | null = null

  async start(): Promise<void> {}
  async stop(): Promise<void> {
    this.lineReader?.close()
    this.lineReader = null
  }

  showWelcome(version: string): void {
    const model = this.status?.model ?? 'unknown'
    const provider = this.status?.provider ? ` (${this.status.provider})` : ''
    console.log(`PaiCLI v${version} — Terminal AI Agent`)
    console.log(`Model ${model}${provider}`)
    console.log('Type /help for commands.\n')
  }

  showPrompt(): void {
    if (this.status) {
      const percent = this.status.tokenLimit > 0
        ? Math.min(100, Math.round((this.status.tokensUsed / this.status.tokenLimit) * 100))
        : 0
      console.log(`[${this.status.statusText ?? 'idle'}] model=${this.status.model} ctx=${percent}% turns=${this.status.conversationTurns ?? 0}`)
    }
  }

  beginThinking(): void {
    console.log('[thinking...]')
  }

  appendThinking(_text: string): void {
    // 纯文本模式不显示思考过程
  }

  endThinking(): void {}

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
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v.slice(0, 50) : JSON.stringify(v)}`)
      .join(', ')
    console.log(`[tool: ${name}(${summary})]`)
  }

  showToolResult(result: ToolResult): void {
    if (result.isError) {
      console.log(`[error: ${result.content.slice(0, 200)}]`)
    }
  }

  handleStreamEvent(event: StreamEvent): void {
    switch (event.type) {
      case 'text_delta':
        this.appendText(event.text)
        break
      case 'tool_use_start':
        console.log(`[tool: ${event.name}]`)
        break
      case 'message_end':
        console.log()
        break
    }
  }

  showError(error: Error): void {
    console.error(`Error: ${error.message}`)
  }

  showOutput(text: string): void {
    console.log(text)
  }

  showStatus(_status: StatusInfo): void {
    this.status = _status
  }

  async requestApproval(request: ApprovalRequest): Promise<ApprovalResult> {
    console.log(`[APPROVAL REQUIRED] ${request.toolName}: ${request.description}`)
    console.log(`Danger level: ${request.dangerLevel}`)
    console.log(`Input: ${JSON.stringify(request.input)}`)
    // 纯文本模式自动批准（或需要 readline 交互）
    return { decision: 'approve' }
  }

  async readInput(): Promise<string> {
    if (!this.lineReader) {
      this.lineReader = new LineReader(
        process.stdin,
        process.stdout,
        Boolean(process.stdin.isTTY && process.stdout.isTTY),
      )
    }
    return this.lineReader.read('> ')
  }

  clear(): void {
    console.clear()
  }
}
