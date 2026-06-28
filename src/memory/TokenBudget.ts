/**
 * Token 预算管理
 */
import type { TokenBudgetMode } from '../types/config.js'

const BUDGET_RATIOS: Record<TokenBudgetMode, number> = {
  short: 0.3,
  balanced: 0.6,
  long: 0.85,
}

export class TokenBudget {
  private mode: TokenBudgetMode
  private maxContextWindow: number

  constructor(mode: TokenBudgetMode, maxContextWindow: number) {
    this.mode = mode
    this.maxContextWindow = maxContextWindow
  }

  /** 获取可用 Token 预算 */
  getBudget(): number {
    return Math.floor(this.maxContextWindow * BUDGET_RATIOS[this.mode])
  }

  /** 估算文本 Token 数（粗略：1 token ≈ 4 chars） */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
  }

  /** 检查是否超出预算 */
  isOverBudget(estimatedTokens: number): boolean {
    return estimatedTokens > this.getBudget()
  }

  /** 获取压缩阈值 */
  getCompressionThreshold(): number {
    return Math.floor(this.getBudget() * 0.8)
  }

  /** 设置模式 */
  setMode(mode: TokenBudgetMode): void {
    this.mode = mode
  }
}
