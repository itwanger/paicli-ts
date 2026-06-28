/**
 * 纯文本渲染器 — 用于管道模式和非 TTY 环境
 */

import type { Renderer, StatusInfo, ApprovalRequest, ApprovalResult } from './Renderer.js'
import type { StreamEvent } from '../llm/types.js'
import type { ToolResult } from '../types/tool.js'

export class PlainRenderer implements Renderer {
  readonly mode = 'plain' as const

  async start(): Promise<void> {}
  async stop(): Promise<void> {}

  showWelcome(version: string): void {
    console.log(`PaiCLI v${version} — Terminal AI Agent`)
    console.log('Type your message or /help for commands.\n')
  }

  showPrompt(): void {
    process.stdout.write('> ')
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

  showStatus(_status: StatusInfo): void {
    // 纯文本模式不显示状态栏
  }

  async requestApproval(request: ApprovalRequest): Promise<ApprovalResult> {
    console.log(`[APPROVAL REQUIRED] ${request.toolName}: ${request.description}`)
    console.log(`Danger level: ${request.dangerLevel}`)
    console.log(`Input: ${JSON.stringify(request.input)}`)
    // 纯文本模式自动批准（或需要 readline 交互）
    return { decision: 'approve' }
  }

  async readInput(): Promise<string> {
    const readline = await import('node:readline')
    return new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      rl.question('> ', (answer) => {
        rl.close()
        resolve(answer)
      })
    })
  }

  clear(): void {
    console.clear()
  }
}
