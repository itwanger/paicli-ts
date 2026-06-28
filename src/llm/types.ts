/**
 * LLM 客户端类型定义
 * 参考 Claude Code 的 LlmClient 接口和 Java 版能力声明
 */

import type { Message, MessageUsage, StopReason } from '../types/message.js'
import type { ToolDefinition } from '../types/tool.js'

/** LLM 客户端接口 */
export interface LlmClient {
  /** 模型名称 */
  readonly modelName: string
  /** 提供商名称 */
  readonly providerName: string
  /** 最大上下文窗口 (tokens) */
  readonly maxContextWindow: number
  /** 能力声明 */
  readonly capabilities: LlmCapabilities

  /** 发送聊天请求，返回 AsyncGenerator 流式事件 */
  chat(
    messages: Message[],
    tools: ToolDefinition[],
    options?: ChatOptions,
  ): AsyncGenerator<StreamEvent>
}

/** LLM 能力声明 */
export interface LlmCapabilities {
  /** 是否支持工具调用 */
  tools: boolean
  /** 是否支持图像输入 */
  images: boolean
  /** 是否支持 prompt 缓存 */
  promptCache: boolean
}

/** 聊天选项 */
export interface ChatOptions {
  /** 系统提示 */
  systemPrompt?: string
  /** 最大输出 Token */
  maxTokens?: number
  /** 温度 */
  temperature?: number
  /** 中止信号 */
  abortSignal?: AbortSignal
  /** 停止序列 */
  stopSequences?: string[]
}

/** 流式事件联合类型 */
export type StreamEvent =
  | TextDeltaEvent
  | ThinkingDeltaEvent
  | ToolUseStartEvent
  | ToolUseDeltaEvent
  | ToolUseEndEvent
  | MessageStartEvent
  | MessageEndEvent
  | UsageEvent
  | ErrorEvent

/** 文本增量事件 */
export interface TextDeltaEvent {
  type: 'text_delta'
  text: string
}

/** 思考增量事件 */
export interface ThinkingDeltaEvent {
  type: 'thinking_delta'
  thinking: string
}

/** 工具调用开始事件 */
export interface ToolUseStartEvent {
  type: 'tool_use_start'
  id: string
  name: string
}

/** 工具调用参数增量事件 */
export interface ToolUseDeltaEvent {
  type: 'tool_use_delta'
  id: string
  inputJson: string
}

/** 工具调用结束事件 */
export interface ToolUseEndEvent {
  type: 'tool_use_end'
  id: string
}

/** 消息开始事件 */
export interface MessageStartEvent {
  type: 'message_start'
  model: string
}

/** 消息结束事件 */
export interface MessageEndEvent {
  type: 'message_end'
  stopReason: StopReason
}

/** Token 使用事件 */
export interface UsageEvent {
  type: 'usage'
  usage: MessageUsage
}

/** 错误事件 */
export interface ErrorEvent {
  type: 'error'
  error: Error
  recoverable: boolean
}

/** 流式监听器 (回调模式) */
export interface StreamListener {
  onTextDelta?: (text: string) => void
  onThinkingDelta?: (thinking: string) => void
  onToolUse?: (id: string, name: string, input: Record<string, unknown>) => void
  onMessageEnd?: (stopReason: StopReason) => void
  onError?: (error: Error) => void
}

/** 流式事件类型守卫 */
export function isTextDelta(event: StreamEvent): event is TextDeltaEvent {
  return event.type === 'text_delta'
}

export function isThinkingDelta(event: StreamEvent): event is ThinkingDeltaEvent {
  return event.type === 'thinking_delta'
}

export function isToolUseStart(event: StreamEvent): event is ToolUseStartEvent {
  return event.type === 'tool_use_start'
}

export function isMessageEnd(event: StreamEvent): event is MessageEndEvent {
  return event.type === 'message_end'
}

export function isError(event: StreamEvent): event is ErrorEvent {
  return event.type === 'error'
}
