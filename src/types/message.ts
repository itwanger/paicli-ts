/**
 * PaiCLI 消息类型 — 判别式联合
 * 参考 Claude Code 的消息格式设计
 */

/** 消息角色 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

/** 用户消息 */
export interface UserMessage {
  type: 'user'
  content: string
  timestamp?: number
}

/** 助手文本内容块 */
export interface TextBlock {
  type: 'text'
  text: string
}

/** 助手工具调用内容块 */
export interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

/** 助手思考内容块 */
export interface ThinkingBlock {
  type: 'thinking'
  thinking: string
}

/** 助手消息内容块联合 */
export type AssistantContentBlock = TextBlock | ToolUseBlock | ThinkingBlock

/** 助手消息 */
export interface AssistantMessage {
  type: 'assistant'
  content: AssistantContentBlock[]
  model?: string
  usage?: MessageUsage
  stopReason?: StopReason
  timestamp?: number
}

/** 工具结果消息 */
export interface ToolResultMessage {
  type: 'tool_result'
  toolUseId: string
  content: string
  isError?: boolean
  timestamp?: number
}

/** 系统消息 */
export interface SystemMessage {
  type: 'system'
  content: string
  timestamp?: number
}

/** 消息联合类型 */
export type Message = UserMessage | AssistantMessage | ToolResultMessage | SystemMessage

/** 消息 Token 使用统计 */
export interface MessageUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

/** 停止原因 */
export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence'

/** 判断是否为文本块 */
export function isTextBlock(block: AssistantContentBlock): block is TextBlock {
  return block.type === 'text'
}

/** 判断是否为工具调用块 */
export function isToolUseBlock(block: AssistantContentBlock): block is ToolUseBlock {
  return block.type === 'tool_use'
}

/** 判断是否为思考块 */
export function isThinkingBlock(block: AssistantContentBlock): block is ThinkingBlock {
  return block.type === 'thinking'
}

/** 提取助手消息中的所有文本 */
export function extractText(msg: AssistantMessage): string {
  return msg.content
    .filter(isTextBlock)
    .map((b) => b.text)
    .join('')
}

/** 提取助手消息中的所有工具调用 */
export function extractToolUses(msg: AssistantMessage): ToolUseBlock[] {
  return msg.content.filter(isToolUseBlock)
}
