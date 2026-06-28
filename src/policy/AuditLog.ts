/**
 * 审计日志 — JSONL 格式记录所有工具调用
 */
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { expandHomePath } from '../config/paths.js'

/** 审计条目 */
export interface AuditEntry {
  timestamp: string
  type: 'tool_call' | 'tool_result' | 'user_message' | 'assistant_message' | 'error'
  data: Record<string, unknown>
}

export class AuditLog {
  private logPath: string
  private enabled: boolean

  constructor(logPath: string, enabled = true) {
    this.logPath = expandHomePath(logPath)
    this.enabled = enabled
    if (enabled) {
      mkdirSync(dirname(logPath), { recursive: true })
    }
  }

  /** 记录日志 */
  log(type: AuditEntry['type'], data: Record<string, unknown>): void {
    if (!this.enabled) return

    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      type,
      data,
    }

    try {
      appendFileSync(this.logPath, JSON.stringify(entry) + '\n', 'utf-8')
    } catch {
      // 日志写入失败不中断主流程
    }
  }

  /** 记录工具调用 */
  logToolCall(toolName: string, input: Record<string, unknown>): void {
    this.log('tool_call', { tool: toolName, input })
  }

  /** 记录工具结果 */
  logToolResult(toolName: string, result: string, isError: boolean): void {
    this.log('tool_result', { tool: toolName, resultLength: result.length, isError })
  }

  /** 记录错误 */
  logError(error: string, context?: Record<string, unknown>): void {
    this.log('error', { error, ...context })
  }

  /** 是否启用 */
  isEnabled(): boolean {
    return this.enabled
  }

  /** 启用/禁用 */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }
}
