/**
 * OpenAI 兼容层 LLM 客户端
 * 支持所有 OpenAI 兼容 API（DeepSeek、GLM、Moonshot 等）
 */

import { BaseLlmClient, type BaseLlmConfig } from '../BaseLlmClient.js'
import type { LlmCapabilities, StreamEvent } from '../types.js'
import type { Message, StopReason } from '../../types/message.js'
import type { ToolDefinition } from '../../types/tool.js'
import { parseSseStream } from '../streaming.js'

/** OpenAI 兼容客户端配置 */
export interface OpenAICompatibleConfig extends BaseLlmConfig {
  /** 提供商名称 */
  providerName: string
  /** 最大上下文窗口 */
  maxContextWindow?: number
}

/**
 * 通用 OpenAI 兼容 LLM 客户端
 */
export class OpenAICompatibleClient extends BaseLlmClient {
  readonly modelName: string
  readonly providerName: string
  readonly maxContextWindow: number
  readonly capabilities: LlmCapabilities

  constructor(config: OpenAICompatibleConfig) {
    super(config)
    this.modelName = config.model
    this.providerName = config.providerName
    this.maxContextWindow = config.maxContextWindow ?? 128_000
    this.capabilities = {
      tools: true,
      images: false,
      promptCache: false,
    }
  }

  protected formatMessages(messages: Message[]): unknown[] {
    return this.toOpenAiMessages(messages)
  }

  protected formatTools(tools: ToolDefinition[]): unknown[] {
    return this.toOpenAiTools(tools)
  }

  protected async *parseStreamResponse(
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal,
  ): AsyncGenerator<StreamEvent> {
    yield { type: 'message_start', model: this.config.model }

    const toolStates = new Map<number, { id: string; name: string; input: string; ended: boolean }>()

    for await (const sseEvent of parseSseStream(body, signal)) {
      if (sseEvent.data === '[DONE]') break

      let chunk: Record<string, unknown>
      try {
        chunk = JSON.parse(sseEvent.data) as Record<string, unknown>
      } catch {
        continue
      }

      const choices = chunk.choices as Array<Record<string, unknown>> | undefined
      if (!choices?.length) continue

      const choice = choices[0]
      const delta = (choice.delta as Record<string, unknown> | undefined) ?? {}

      // 文本内容
      if (typeof delta.content === 'string' && delta.content) {
        yield { type: 'text_delta', text: delta.content }
      }

      // 工具调用
      const toolCalls = delta.tool_calls as Array<Record<string, unknown>> | undefined
      if (toolCalls?.length) {
        for (const tc of toolCalls) {
          const index = tc.index as number ?? 0
          let state = toolStates.get(index)

          if (tc.id) {
            // 新的工具调用开始
            const fn = tc.function as Record<string, unknown> | undefined
            state = {
              id: tc.id as string,
              name: (fn?.name as string) ?? state?.name ?? '',
              input: state?.input ?? '',
              ended: false,
            }
            toolStates.set(index, state)
            yield { type: 'tool_use_start', id: state.id, name: state.name }
          }

          const fn = tc.function as Record<string, unknown> | undefined
          if (fn?.name && state) {
            state.name = fn.name as string
          }
          if (fn?.arguments) {
            if (!state) {
              state = { id: `tool_${index}`, name: '', input: '', ended: false }
              toolStates.set(index, state)
              yield { type: 'tool_use_start', id: state.id, name: state.name }
            }
            state.input += fn.arguments as string
            yield { type: 'tool_use_delta', id: state.id, inputJson: fn.arguments as string }
          }
        }
      }

      // 结束原因
      if (choice.finish_reason) {
        const stopReason = mapFinishReason(choice.finish_reason as string)
        if (choice.finish_reason === 'tool_calls') {
          for (const state of toolStates.values()) {
            if (!state.ended) {
              state.ended = true
              yield { type: 'tool_use_end', id: state.id }
            }
          }
        }
        yield { type: 'message_end', stopReason }
      }

      // Token 使用统计
      if (chunk.usage) {
        const usage = chunk.usage as Record<string, number>
        yield {
          type: 'usage',
          usage: {
            inputTokens: usage.prompt_tokens ?? 0,
            outputTokens: usage.completion_tokens ?? 0,
          },
        }
      }
    }
  }
}

/** 映射 finish_reason 到 StopReason */
function mapFinishReason(reason: string): StopReason {
  switch (reason) {
    case 'stop':
    case 'end_turn':
      return 'end_turn'
    case 'tool_calls':
    case 'tool_use':
      return 'tool_use'
    case 'length':
      return 'max_tokens'
    case 'content_filter':
      return 'stop_sequence'
    default:
      return 'end_turn'
  }
}
