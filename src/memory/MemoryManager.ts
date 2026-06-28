/**
 * 记忆管理统一入口
 */
import { ConversationMemory } from './ConversationMemory.js'
import { LongTermMemory } from './LongTermMemory.js'
import { ContextCompressor } from './ContextCompressor.js'
import { TokenBudget } from './TokenBudget.js'
import type { MemoryConfig } from '../types/config.js'
import type { Message } from '../types/message.js'

export class MemoryManager {
  readonly conversation: ConversationMemory
  readonly longTerm: LongTermMemory | null
  readonly compressor: ContextCompressor
  readonly budget: TokenBudget

  constructor(config: MemoryConfig, maxContextWindow: number) {
    this.conversation = new ConversationMemory(config.maxConversationHistory)
    this.longTerm = config.longTermEnabled ? new LongTermMemory(config.longTermDbPath) : null
    this.compressor = new ContextCompressor()
    this.budget = new TokenBudget(config.tokenBudgetMode, maxContextWindow)
  }

  /** 获取适合发送给 LLM 的消息历史 */
  getContext(): Message[] {
    const messages = this.conversation.getAll()
    const threshold = this.budget.getCompressionThreshold()

    // 估算 Token 数
    const estimatedTokens = this.budget.estimateTokens(
      messages.map((m) => JSON.stringify(m)).join('')
    )

    if (estimatedTokens > threshold) {
      const keepRecent = Math.max(4, Math.floor(messages.length * 0.3))
      return this.compressor.compress(messages, keepRecent)
    }

    return messages
  }

  /** 关闭资源 */
  close(): void {
    this.longTerm?.close()
  }
}
