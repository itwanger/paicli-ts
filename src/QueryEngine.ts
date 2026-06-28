/**
 * 查询引擎 — SDK/无头模式入口
 * 提供系统提示组装、上下文管理、简化 API
 */

import type { LlmClient } from './llm/types.js'
import type { ToolRegistry } from './tools/registry.js'
import type { PaiCliConfig } from './types/config.js'
import type { Message } from './types/message.js'
import { query, type AgentEvent, type QueryParams } from './query.js'

/** 查询引擎配置 */
export interface QueryEngineConfig {
  llmClient: LlmClient
  toolRegistry: ToolRegistry
  config: PaiCliConfig
  cwd: string
  approvalCallback?: QueryParams['approvalCallback']
}

/**
 * 查询引擎 — 简化的 Agent 调用接口
 */
export class QueryEngine {
  private llmClient: LlmClient
  private toolRegistry: ToolRegistry
  private config: PaiCliConfig
  private cwd: string
  private systemPrompt: string
  private approvalCallback?: QueryParams['approvalCallback']

  constructor(engineConfig: QueryEngineConfig) {
    this.llmClient = engineConfig.llmClient
    this.toolRegistry = engineConfig.toolRegistry
    this.config = engineConfig.config
    this.cwd = engineConfig.cwd
    this.approvalCallback = engineConfig.approvalCallback
    this.systemPrompt = this.buildSystemPrompt()
  }

  /**
   * 发送消息并获取流式响应
   */
  async *ask(
    message: string,
    history: Message[] = [],
    abortSignal?: AbortSignal,
  ): AsyncGenerator<AgentEvent> {
    yield* query({
      llmClient: this.llmClient,
      toolRegistry: this.toolRegistry,
      systemPrompt: this.systemPrompt,
      userMessage: message,
      history,
      cwd: this.cwd,
      config: this.config,
      abortSignal,
      approvalCallback: this.approvalCallback,
    })
  }

  /**
   * 发送消息并等待完整结果（非流式）
   */
  async askComplete(
    message: string,
    history: Message[] = [],
    abortSignal?: AbortSignal,
  ): Promise<{ text: string; totalTokens: number; turns: number }> {
    let text = ''
    let totalTokens = 0
    let turns = 0

    for await (const event of this.ask(message, history, abortSignal)) {
      if (event.type === 'text_delta') text += event.text
      if (event.type === 'error') throw event.error
      if (event.type === 'done') {
        totalTokens = event.totalTokens
        turns = event.totalTurns
      }
    }

    return { text, totalTokens, turns }
  }

  /** 构建系统提示 */
  private buildSystemPrompt(): string {
    const now = new Date().toISOString()
    const tools = this.toolRegistry.listNames()

    return [
      `You are PaiCLI, a powerful AI coding assistant running in a terminal.`,
      `Current time: ${now}`,
      `Working directory: ${this.cwd}`,
      `Model: ${this.llmClient.modelName} (${this.llmClient.providerName})`,
      `Available tools: ${tools.join(', ')}`,
      ``,
      `Guidelines:`,
      `- Be concise and direct in your responses`,
      `- Use tools to read files, search code, and execute commands when needed`,
      `- When writing code, use the write_file tool`,
      `- Always explain what you're doing before executing commands`,
      `- If a task is ambiguous, ask for clarification`,
    ].join('\n')
  }

  /** 更新系统提示 */
  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt
  }

  /** 获取当前工具列表 */
  getToolNames(): string[] {
    return this.toolRegistry.listNames()
  }

  /** 获取当前系统提示 */
  getSystemPrompt(): string {
    return this.systemPrompt
  }
}
