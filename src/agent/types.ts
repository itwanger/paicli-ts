/**
 * Agent 类型定义
 */

import type { LlmClient } from '../llm/types.js'
import type { ToolRegistry } from '../tools/registry.js'

/** Agent 配置 */
export interface AgentConfig {
  /** LLM 客户端 */
  llmClient: LlmClient
  /** 工具注册表 */
  toolRegistry: ToolRegistry
  /** 系统提示 */
  systemPrompt: string
  /** 最大循环次数 */
  maxTurns: number
  /** 项目根目录 */
  cwd: string
}

/** 运行选项 */
export interface RunOptions {
  /** 中止信号 */
  abortSignal?: AbortSignal
  /** 回调：每次 LLM 响应后 */
  onTurn?: (turn: number) => void
}

/** 查询参数 */
export interface QueryParams {
  /** 用户消息 */
  message: string
  /** 历史消息 */
  history?: import('../types/message.js').Message[]
  /** 覆盖的系统提示 */
  systemPrompt?: string
  /** 中止信号 */
  abortSignal?: AbortSignal
}

/** 查询结果 */
export interface QueryResult {
  /** 最终文本回复 */
  text: string
  /** 完整消息历史 */
  messages: import('../types/message.js').Message[]
  /** 使用的 Token 数 */
  totalTokens: number
  /** 循环次数 */
  turns: number
}
