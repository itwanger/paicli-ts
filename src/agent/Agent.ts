/**
 * ReAct Agent — 封装核心循环的 Agent 类
 */

import { query, type AgentEvent } from '../query.js'
import type { LlmClient } from '../llm/types.js'
import type { ToolRegistry } from '../tools/registry.js'
import type { Message } from '../types/message.js'
import type { PaiCliConfig } from '../types/config.js'
import type { ToolContext } from '../types/tool.js'

/** Agent 配置 */
export interface AgentOptions {
  llmClient: LlmClient
  toolRegistry: ToolRegistry
  systemPrompt: string
  maxTurns?: number
  cwd: string
  config?: PaiCliConfig
  approvalCallback?: ToolContext['approvalCallback']
}

/**
 * ReAct Agent
 * 提供基于事件回调和 AsyncGenerator 两种交互方式
 */
export class Agent {
  private options: AgentOptions & { maxTurns: number }
  private history: Message[] = []

  constructor(options: AgentOptions) {
    this.options = {
      maxTurns: 20,
      ...options,
    }
  }

  /**
   * 发送消息并获取流式事件
   */
  async *run(message: string, abortSignal?: AbortSignal): AsyncGenerator<AgentEvent> {
    for await (const event of query({
      llmClient: this.options.llmClient,
      toolRegistry: this.options.toolRegistry,
      systemPrompt: this.options.systemPrompt,
      userMessage: message,
      history: this.history,
      maxTurns: this.options.maxTurns,
      cwd: this.options.cwd,
      config: this.options.config,
      abortSignal,
      approvalCallback: this.options.approvalCallback,
    })) {
      if (event.type === 'done' && event.messages) {
        this.history = event.messages
      }
      yield event
    }
  }

  /**
   * 发送消息并收集完整回复
   */
  async runComplete(message: string, abortSignal?: AbortSignal): Promise<{
    text: string
    totalTokens: number
    turns: number
  }> {
    let text = ''
    let totalTokens = 0
    let turns = 0

    for await (const event of this.run(message, abortSignal)) {
      if (event.type === 'text_delta') text += event.text
      if (event.type === 'error') throw event.error
      if (event.type === 'done') {
        totalTokens = event.totalTokens
        turns = event.totalTurns
      }
    }

    return { text, totalTokens, turns }
  }

  /** 获取对话历史 */
  getHistory(): Message[] {
    return [...this.history]
  }

  /** 清空对话历史 */
  clearHistory(): void {
    this.history = []
  }

  /** 设置系统提示 */
  setSystemPrompt(prompt: string): void {
    this.options.systemPrompt = prompt
  }
}
