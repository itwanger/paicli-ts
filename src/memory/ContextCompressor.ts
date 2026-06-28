/**
 * 上下文压缩器
 */
import type { Message } from '../types/message.js'

export class ContextCompressor {
  /** 压缩对话历史 — 保留最近 N 条，摘要旧消息 */
  compress(messages: Message[], keepRecent: number): Message[] {
    if (messages.length <= keepRecent) return messages

    const old = messages.slice(0, -keepRecent)
    const recent = messages.slice(-keepRecent)

    // 简单压缩：合并旧的用户消息为摘要
    const summary = this.summarize(old)
    return [
      { type: 'system', content: `[Earlier conversation summary: ${summary}]` },
      ...recent,
    ]
  }

  /** 生成摘要 */
  private summarize(messages: Message[]): string {
    const userMessages = messages.filter((m) => m.type === 'user')
    if (userMessages.length === 0) return 'No user messages in earlier conversation.'

    const topics = userMessages
      .slice(0, 5)
      .map((m) => (m as { content: string }).content.slice(0, 50))
      .join('; ')

    return `${userMessages.length} messages covering: ${topics}...`
  }
}
