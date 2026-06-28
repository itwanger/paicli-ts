/**
 * LLM 客户端基类
 * 提供通用的 HTTP 请求、SSE 流式处理、消息格式化
 */

import type { LlmClient, LlmCapabilities, ChatOptions, StreamEvent } from './types.js'
import type { Message, AssistantMessage, ToolUseBlock } from '../types/message.js'
import type { ToolDefinition } from '../types/tool.js'

/** 基础客户端配置 */
export interface BaseLlmConfig {
  apiKey: string
  baseUrl: string
  model: string
  maxTokens: number
  temperature: number
  timeout: number
}

/**
 * LLM 客户端抽象基类
 * 子类需要实现 formatMessages() 和 parseStreamEvent()
 */
export abstract class BaseLlmClient implements LlmClient {
  abstract readonly modelName: string
  abstract readonly providerName: string
  abstract readonly maxContextWindow: number
  abstract readonly capabilities: LlmCapabilities

  protected config: BaseLlmConfig

  constructor(config: BaseLlmConfig) {
    this.config = config
  }

  /**
   * 发送聊天请求（子类可覆盖以自定义请求格式）
   */
  async *chat(
    messages: Message[],
    tools: ToolDefinition[],
    options?: ChatOptions,
  ): AsyncGenerator<StreamEvent> {
    const body = this.buildRequestBody(messages, tools, options)
    const url = `${this.config.baseUrl}/chat/completions`

    const controller = new AbortController()
    let timedOut = false
    const timeoutId = this.config.timeout > 0
      ? setTimeout(() => {
          timedOut = true
          controller.abort()
        }, this.config.timeout)
      : undefined
    const abortHandler = () => controller.abort()

    if (options?.abortSignal) {
      options.abortSignal.addEventListener('abort', abortHandler, { once: true })
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        yield {
          type: 'error',
          error: new Error(`LLM API error ${response.status}: ${errorText}`),
          recoverable: response.status >= 500,
        }
        return
      }

      if (!response.body) {
        yield { type: 'error', error: new Error('No response body'), recoverable: false }
        return
      }

      yield* this.parseStreamResponse(response.body, controller.signal)
    } catch (err) {
      if (controller.signal.aborted) {
        yield {
          type: 'error',
          error: new Error(timedOut ? `LLM request timed out after ${this.config.timeout}ms` : 'LLM request aborted'),
          recoverable: timedOut,
        }
        return
      }
      yield {
        type: 'error',
        error: err instanceof Error ? err : new Error(String(err)),
        recoverable: true,
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
      if (options?.abortSignal) {
        options.abortSignal.removeEventListener('abort', abortHandler)
      }
    }
  }

  /** 构建请求头 */
  protected buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    }
  }

  /** 构建请求体（子类可覆盖） */
  protected buildRequestBody(
    messages: Message[],
    tools: ToolDefinition[],
    options?: ChatOptions,
  ): Record<string, unknown> {
    const formattedMessages = this.formatMessages(messages)
    const body: Record<string, unknown> = {
      model: options?.maxTokens ? this.config.model : this.config.model,
      messages: formattedMessages,
      stream: true,
      max_tokens: options?.maxTokens ?? this.config.maxTokens,
      temperature: options?.temperature ?? this.config.temperature,
    }

    if (tools.length > 0) {
      body.tools = this.formatTools(tools)
    }

    if (options?.systemPrompt) {
      (body.messages as unknown[]).unshift({ role: 'system', content: options.systemPrompt })
    }

    if (options?.stopSequences) {
      body.stop = options.stopSequences
    }

    return body
  }

  /** 格式化消息为 API 格式（子类实现） */
  protected abstract formatMessages(messages: Message[]): unknown[]

  /** 格式化工具定义为 API 格式（子类实现） */
  protected abstract formatTools(tools: ToolDefinition[]): unknown[]

  /** 解析流式响应（子类实现） */
  protected abstract parseStreamResponse(
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal,
  ): AsyncGenerator<StreamEvent>

  /** 工具：将 PaiCLI 消息转为 OpenAI chat 格式 */
  protected toOpenAiMessages(messages: Message[]): Record<string, unknown>[] {
    const result: Record<string, unknown>[] = []

    for (const msg of messages) {
      switch (msg.type) {
        case 'user':
          result.push({ role: 'user', content: msg.content })
          break
        case 'assistant':
          result.push(this.formatAssistantMessage(msg))
          break
        case 'tool_result':
          result.push({
            role: 'tool',
            tool_call_id: msg.toolUseId,
            content: msg.content,
          })
          break
        case 'system':
          result.push({ role: 'system', content: msg.content })
          break
      }
    }

    return result
  }

  /** 格式化助手消息为 OpenAI 格式 */
  protected formatAssistantMessage(msg: AssistantMessage): Record<string, unknown> {
    const textParts = msg.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('')

    const toolCalls = msg.content
      .filter((b) => b.type === 'tool_use')
      .map((b) => {
        const block = b as ToolUseBlock
        return {
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input),
          },
        }
      })

    const result: Record<string, unknown> = { role: 'assistant' }
    if (textParts) result.content = textParts
    if (toolCalls.length > 0) result.tool_calls = toolCalls

    return result
  }

  /** 工具：将 ToolDefinition 转为 OpenAI function 格式 */
  protected toOpenAiTools(tools: ToolDefinition[]): Record<string, unknown>[] {
    return tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }))
  }
}
