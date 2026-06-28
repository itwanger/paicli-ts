/**
 * PaiCLI 渲染器接口
 * 支持 InlineRenderer (Ink TUI) 和 PlainRenderer (纯文本)
 */

import type { StreamEvent } from '../llm/types.js'
import type { ToolResult } from '../types/tool.js'

/** 渲染模式 */
export type RenderModeType = 'inline' | 'plain'

/** 渲染器接口 */
export interface Renderer {
  /** 渲染器模式 */
  readonly mode: RenderModeType

  /** 启动渲染器 */
  start(): Promise<void>

  /** 停止渲染器 */
  stop(): Promise<void>

  /** 显示欢迎信息 */
  showWelcome(version: string): void

  /** 显示用户输入提示符 */
  showPrompt(): void

  /** 开始思考阶段 */
  beginThinking(): void

  /** 追加思考内容 */
  appendThinking(text: string): void

  /** 结束思考阶段 */
  endThinking(): void

  /** 开始文本输出 */
  beginText(): void

  /** 追加文本内容（流式打字机效果） */
  appendText(text: string): void

  /** 结束文本输出 */
  endText(): void

  /** 显示工具调用 */
  showToolCall(name: string, input: Record<string, unknown>): void

  /** 显示工具结果 */
  showToolResult(result: ToolResult): void

  /** 处理流式事件 */
  handleStreamEvent(event: StreamEvent): void

  /** 显示错误 */
  showError(error: Error): void

  /** 显示本地命令输出 */
  showOutput(text: string): void

  /** 显示状态信息 */
  showStatus(status: StatusInfo): void

  /** 显示 HITL 审批请求 */
  requestApproval(request: ApprovalRequest): Promise<ApprovalResult>

  /** 读取用户输入 */
  readInput(): Promise<string>

  /** 清屏 */
  clear(): void
}

/** 状态栏信息 */
export interface StatusInfo {
  /** 当前模型 */
  model: string
  /** 当前 Provider */
  provider?: string
  /** Token 使用量 */
  tokensUsed: number
  /** Token 总量限制 */
  tokenLimit: number
  /** Agent 模式 */
  agentMode: string
  /** 当前状态文本 */
  statusText?: string
  /** 当前工作目录 */
  cwd?: string
  /** 可用工具数 */
  toolCount?: number
  /** MCP 服务总数 */
  mcpServers?: number
  /** 已连接 MCP 服务数 */
  connectedMcpServers?: number
  /** Skill 总数 */
  skills?: number
  /** 已加载 Skill 数 */
  loadedSkills?: number
  /** HITL 模式 */
  hitlMode?: string
  /** 是否启用记忆 */
  memoryEnabled?: boolean
  /** 压缩阈值百分比 */
  compressionThresholdPercent?: number
  /** 对话轮数 */
  conversationTurns?: number
}

/** HITL 审批请求 */
export interface ApprovalRequest {
  /** 工具名称 */
  toolName: string
  /** 工具输入 */
  input: Record<string, unknown>
  /** 危险等级 */
  dangerLevel: string
  /** 描述 */
  description: string
}

/** 审批结果 */
export type ApprovalResult =
  | { decision: 'approve' }
  | { decision: 'deny'; reason?: string }
  | { decision: 'approve_all' }
  | { decision: 'skip' }
  | { decision: 'modify'; newInput: Record<string, unknown> }
