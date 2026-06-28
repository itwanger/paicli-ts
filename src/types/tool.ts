/**
 * PaiCLI 工具类型定义
 * 参考 Claude Code 的 buildTool 工厂模式
 */

import type { ZodType } from 'zod'

/** 工具输入 Schema (Zod) */
export type ToolInputSchema = ZodType<Record<string, unknown>>

/** 工具定义 — 注册到 LLM 的工具描述 */
export interface ToolDefinition {
  /** 工具名称 (snake_case) */
  name: string
  /** 工具描述 — LLM 用于决策是否调用 */
  description: string
  /** JSON Schema 格式的参数描述（给 LLM） */
  parameters: ToolParameters
  /** 是否只读工具 */
  isReadOnly: boolean
  /** 是否可并发执行 */
  isConcurrencySafe: boolean
}

/** 工具参数 JSON Schema */
export interface ToolParameters {
  type: 'object'
  properties: Record<string, ToolParameterProperty>
  required?: string[]
}

/** 工具参数属性 */
export interface ToolParameterProperty {
  type: string
  description?: string
  enum?: string[]
  items?: ToolParameterProperty
  properties?: Record<string, ToolParameterProperty>
  required?: string[]
}

/** 工具执行结果 */
export interface ToolResult {
  /** 工具调用 ID */
  toolUseId: string
  /** 结果内容（给 LLM） */
  content: string
  /** 是否为错误结果 */
  isError?: boolean
  /** 展示给用户的摘要 */
  displaySummary?: string
}

/** 工具执行上下文 */
export interface ToolContext {
  /** 当前工作目录 */
  cwd: string
  /** 配置信息 */
  config: Record<string, unknown>
  /** 中止信号 */
  abortSignal?: AbortSignal
  /** HITL 审批回调 */
  approvalCallback?: (request: ToolApprovalRequest) => Promise<ToolApprovalDecision>
}

/** 工具审批决策 */
export type ToolApprovalDecision = 'approve' | 'deny' | 'approve_all' | 'skip'

/** 工具审批请求 */
export interface ToolApprovalRequest {
  toolName: string
  input: Record<string, unknown>
  dangerLevel: DangerLevel
  description: string
}

/** 工具调用请求（来自 LLM） */
export interface ToolCallRequest {
  id: string
  name: string
  input: Record<string, unknown>
}

/** 工具危险等级 */
export type DangerLevel = 'safe' | 'low' | 'medium' | 'high'

/** 工具元信息 */
export interface ToolMeta {
  /** 危险等级 */
  dangerLevel: DangerLevel
  /** 是否需要 HITL 审批 */
  requiresApproval: boolean
  /** 超时时间 (ms) */
  timeout: number
}

/** 默认工具超时 */
export const DEFAULT_TOOL_TIMEOUT = 60_000
export const DEFAULT_BATCH_TIMEOUT = 90_000
export const MAX_CONCURRENT_READ_TOOLS = 4
