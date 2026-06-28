/**
 * 流式工具执行器
 * 支持读安全工具并发执行（max 4），非读工具串行执行
 * 90 秒批量超时、60 秒单工具超时
 */

import type { Tool } from './Tool.js'
import type { ToolRegistry } from './registry.js'
import type { HitlMode } from '../types/config.js'
import type { ToolCallRequest, ToolContext, ToolResult, ToolApprovalDecision } from '../types/tool.js'
import { DEFAULT_BATCH_TIMEOUT, MAX_CONCURRENT_READ_TOOLS } from '../types/tool.js'

/** 待执行工具请求 */
interface PendingToolCall {
  request: ToolCallRequest
  tool: Tool
}

/** 执行器配置 */
export interface ExecutorConfig {
  /** 最大并发读工具数 */
  maxConcurrent: number
  /** 批量超时 (ms) */
  batchTimeout: number
  /** 单工具超时 (ms) */
  toolTimeout: number
}

const DEFAULT_EXECUTOR_CONFIG: ExecutorConfig = {
  maxConcurrent: MAX_CONCURRENT_READ_TOOLS,
  batchTimeout: DEFAULT_BATCH_TIMEOUT,
  toolTimeout: 60_000,
}

/**
 * 流式工具执行器
 */
export class StreamingToolExecutor {
  private pending: PendingToolCall[] = []
  private registry: ToolRegistry
  private config: ExecutorConfig

  constructor(registry: ToolRegistry, config?: Partial<ExecutorConfig>) {
    this.registry = registry
    this.config = { ...DEFAULT_EXECUTOR_CONFIG, ...config }
  }

  /** 添加工具调用请求 */
  add(request: ToolCallRequest): void {
    const tool = this.registry.get(request.name)
    if (!tool) {
      // 工具不存在，添加错误结果占位
      this.pending.push({
        request,
        tool: null as unknown as Tool,
      })
      return
    }
    this.pending.push({ request, tool })
  }

  /** 是否有待执行的请求 */
  hasPending(): boolean {
    return this.pending.length > 0
  }

  /** 待执行请求数 */
  get pendingCount(): number {
    return this.pending.length
  }

  /**
   * 执行所有待处理请求
   * - 只读+可并发工具：并行执行（最多 maxConcurrent 个）
   * - 其他工具：串行执行
   */
  async executeAll(context: ToolContext): Promise<ToolResult[]> {
    const pending = [...this.pending]
    this.pending = []

    if (pending.length === 0) return []

    // 分离可并发和不可并发的工具
    const concurrent: PendingToolCall[] = []
    const sequential: PendingToolCall[] = []

    for (const item of pending) {
      if (item.tool && item.tool.isReadOnly && item.tool.isConcurrencySafe) {
        concurrent.push(item)
      } else {
        sequential.push(item)
      }
    }

    const results: ToolResult[] = []

    // 批量超时控制
    const batchDeadline = Date.now() + this.config.batchTimeout

    // 1. 并发执行只读工具
    if (concurrent.length > 0) {
      const concurrentResults = await this.executeConcurrent(concurrent, context, batchDeadline)
      results.push(...concurrentResults)
    }

    // 2. 串行执行其他工具
    for (const item of sequential) {
      if (Date.now() >= batchDeadline) {
        results.push({
          toolUseId: item.request.id,
          content: 'Tool execution timed out (batch deadline)',
          isError: true,
        })
        continue
      }
      const result = await this.executeSingle(item, context, batchDeadline)
      results.push(result)
    }

    return results
  }

  /** 并发执行工具 */
  private async executeConcurrent(
    items: PendingToolCall[],
    context: ToolContext,
    batchDeadline: number,
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = []
    const { maxConcurrent } = this.config

    // 分批执行
    for (let i = 0; i < items.length; i += maxConcurrent) {
      const batch = items.slice(i, i + maxConcurrent)
      const batchPromises = batch.map((item) => this.executeSingle(item, context, batchDeadline))
      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)
    }

    return results
  }

  /** 执行单个工具 */
  private async executeSingle(
    item: PendingToolCall,
    context: ToolContext,
    batchDeadline: number,
  ): Promise<ToolResult> {
    const { request, tool } = item

    // 工具不存在
    if (!tool) {
      return {
        toolUseId: request.id,
        content: `Tool "${request.name}" not found. Available tools: ${this.registry.listNames().join(', ')}`,
        isError: true,
      }
    }

    // 超时控制
    const remainingTime = batchDeadline - Date.now()
    const timeout = Math.min(this.config.toolTimeout, Math.max(remainingTime, 1000))

    try {
      // 验证输入
      const validatedInput = tool.validate(request.input)
      const approval = await this.requestApprovalIfNeeded(tool, validatedInput as Record<string, unknown>, context)
      if (approval === 'deny' || approval === 'skip') {
        return {
          toolUseId: request.id,
          content: `Tool "${request.name}" was ${approval === 'deny' ? 'denied' : 'skipped'} by approval policy.`,
          isError: true,
        }
      }

      // 创建带超时的 AbortController
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const timedContext: ToolContext = {
        ...context,
        abortSignal: controller.signal,
      }

      try {
        const result = await tool.execute(validatedInput, request.id, timedContext)
        return result
      } finally {
        clearTimeout(timeoutId)
      }
    } catch (err) {
      return {
        toolUseId: request.id,
        content: `Tool "${request.name}" execution error: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      }
    }
  }

  /** 清除所有待执行请求 */
  clear(): void {
    this.pending = []
  }

  private async requestApprovalIfNeeded(
    tool: Tool,
    input: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolApprovalDecision> {
    const policy = (context.config as { policy?: { hitlMode?: HitlMode } }).policy
    if (!policy) return 'approve'
    if (policy.hitlMode === 'never') return 'approve'

    const requiresApproval = policy.hitlMode === 'always' || tool.meta.requiresApproval
    if (!requiresApproval) return 'approve'

    if (!context.approvalCallback) {
      return 'deny'
    }

    return context.approvalCallback({
      toolName: tool.name,
      input,
      dangerLevel: tool.meta.dangerLevel,
      description: tool.description,
    })
  }
}
