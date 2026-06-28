/**
 * HITL (Human-In-The-Loop) 审批处理器
 */

import type { DangerLevel } from '../types/tool.js'

/** 审批决策 */
export type HitlDecision = 'approve' | 'deny' | 'approve_all' | 'skip'

/** 审批请求 */
export interface HitlRequest {
  toolName: string
  input: Record<string, unknown>
  dangerLevel: DangerLevel
  description: string
}

/** 审批回调 */
export type HitlCallback = (request: HitlRequest) => Promise<HitlDecision>

export class HitlHandler {
  private callback: HitlCallback | null = null
  private approvedAll = false
  private approvedTools = new Set<string>()

  /** 设置审批回调 */
  setCallback(callback: HitlCallback): void {
    this.callback = callback
  }

  /** 请求审批 */
  async requestApproval(request: HitlRequest): Promise<HitlDecision> {
    // 如果已全局批准
    if (this.approvedAll) return 'approve'

    // 如果该工具已被批准
    if (this.approvedTools.has(request.toolName)) return 'approve'

    // 安全工具自动批准
    if (request.dangerLevel === 'safe') return 'approve'

    // 调用审批回调
    if (!this.callback) return 'approve' // 无回调时自动批准

    const decision = await this.callback(request)

    if (decision === 'approve_all') {
      this.approvedAll = true
    } else if (decision === 'approve') {
      // 可选：记住该工具的批准
    }

    return decision
  }

  /** 重置所有批准状态 */
  reset(): void {
    this.approvedAll = false
    this.approvedTools.clear()
  }

  /** 是否已全局批准 */
  isApprovedAll(): boolean {
    return this.approvedAll
  }
}
