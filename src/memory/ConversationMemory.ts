/**
 * 对话历史管理
 */
import type { Message } from '../types/message.js'

export class ConversationMemory {
  private messages: Message[] = []
  private maxHistory: number

  constructor(maxHistory = 100) {
    this.maxHistory = maxHistory
  }

  /** 添加消息 */
  add(message: Message): void {
    this.messages.push(message)
    if (this.messages.length > this.maxHistory) {
      this.messages = this.messages.slice(-this.maxHistory)
    }
  }

  /** 获取全部历史 */
  getAll(): Message[] {
    return [...this.messages]
  }

  /** 获取最近 N 条 */
  getRecent(n: number): Message[] {
    return this.messages.slice(-n)
  }

  /** 消息数量 */
  get size(): number {
    return this.messages.length
  }

  /** 清空 */
  clear(): void {
    this.messages = []
  }
}
