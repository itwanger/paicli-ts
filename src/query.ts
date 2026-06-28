/**
 * 核心 Agent 循环 — AsyncGenerator 流式
 * 参考 Claude Code 的 query.ts 模式
 */

import type { Message, AssistantMessage, AssistantContentBlock, ToolUseBlock, MessageUsage, StopReason } from './types/message.js'
import type { LlmClient } from './llm/types.js'
import type { ToolRegistry } from './tools/registry.js'
import { StreamingToolExecutor } from './tools/executor.js'
import type { ToolContext } from './types/tool.js'
import type { PaiCliConfig } from './types/config.js'

/** 查询参数 */
export interface QueryParams {
  /** LLM 客户端 */
  llmClient: LlmClient
  /** 工具注册表 */
  toolRegistry: ToolRegistry
  /** 系统提示 */
  systemPrompt: string
  /** 用户消息 */
  userMessage: string
  /** 历史消息 */
  history?: Message[]
  /** 最大循环次数 */
  maxTurns?: number
  /** 项目根目录 */
  cwd: string
  /** PaiCLI 配置 */
  config?: PaiCliConfig
  /** 中止信号 */
  abortSignal?: AbortSignal
  /** 工具审批回调 */
  approvalCallback?: ToolContext['approvalCallback']
}

/** Agent 输出事件 */
export type AgentEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'thinking_delta'; thinking: string }
  | { type: 'tool_call'; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; name: string; result: string; isError: boolean }
  | { type: 'turn_complete'; turn: number; stopReason: StopReason }
  | { type: 'usage'; usage: MessageUsage }
  | { type: 'error'; error: Error }
  | { type: 'done'; totalTurns: number; totalTokens: number }

/**
 * 主 Agent 循环 — ReAct 模式
 *
 * 流程：
 * 1. 发送消息给 LLM
 * 2. 流式接收文本/工具调用
 * 3. 如果有工具调用，执行工具并将结果追加到消息
 * 4. 循环回步骤 1，直到 LLM 返回 end_turn 或达到最大循环次数
 */
export async function* query(params: QueryParams): AsyncGenerator<AgentEvent> {
  const {
    llmClient,
    toolRegistry,
    systemPrompt,
    userMessage,
    history = [],
    maxTurns = 20,
    cwd,
    config,
    abortSignal,
    approvalCallback,
  } = params

  const messages: Message[] = [
    ...history,
    { type: 'user', content: userMessage },
  ]

  const executor = new StreamingToolExecutor(toolRegistry)
  const toolContext: ToolContext = { cwd, config: config as unknown as Record<string, unknown> ?? {}, approvalCallback }
  const toolDefinitions = toolRegistry.getDefinitions()

  let totalTokens = 0
  let turn = 0

  while (turn < maxTurns) {
    if (abortSignal?.aborted) break
    turn++

    // 收集本轮 LLM 响应
    const contentBlocks: AssistantContentBlock[] = []
    let currentToolId = ''
    let currentToolName = ''
    let currentToolInput = ''
    let stopReason: StopReason = 'end_turn'

    try {
      const stream = llmClient.chat(messages, toolDefinitions, {
        systemPrompt,
        abortSignal,
      })

      for await (const event of stream) {
        switch (event.type) {
          case 'text_delta':
            contentBlocks.push({ type: 'text', text: event.text })
            yield { type: 'text_delta', text: event.text }
            break

          case 'thinking_delta':
            yield { type: 'thinking_delta', thinking: event.thinking }
            break

          case 'tool_use_start':
            currentToolId = event.id
            currentToolName = event.name
            currentToolInput = ''
            break

          case 'tool_use_delta':
            currentToolInput += event.inputJson
            break

          case 'tool_use_end':
            // 解析工具输入
            let toolInput: Record<string, unknown> = {}
            try {
              toolInput = JSON.parse(currentToolInput)
            } catch {
              toolInput = { raw: currentToolInput }
            }
            contentBlocks.push({
              type: 'tool_use',
              id: currentToolId,
              name: currentToolName,
              input: toolInput,
            })
            yield { type: 'tool_call', name: currentToolName, input: toolInput }
            break

          case 'message_end':
            stopReason = event.stopReason
            break

          case 'usage':
            totalTokens += event.usage.inputTokens + event.usage.outputTokens
            yield { type: 'usage', usage: event.usage }
            break

          case 'error':
            yield { type: 'error', error: event.error }
            break
        }
      }
    } catch (err) {
      yield { type: 'error', error: err instanceof Error ? err : new Error(String(err)) }
      break
    }

    // 合并相邻文本块
    const mergedBlocks = mergeTextBlocks(contentBlocks)

    // 添加助手消息到历史
    const assistantMessage: AssistantMessage = {
      type: 'assistant',
      content: mergedBlocks,
      stopReason,
      model: llmClient.modelName,
    }
    messages.push(assistantMessage)

    yield { type: 'turn_complete', turn, stopReason }

    // 如果没有工具调用，结束循环
    if (stopReason !== 'tool_use') break

    // 执行工具调用
    const toolUses = mergedBlocks.filter((b) => b.type === 'tool_use') as ToolUseBlock[]
    for (const tu of toolUses) {
      executor.add({ id: tu.id, name: tu.name, input: tu.input })
    }

    const toolResults = await executor.executeAll(toolContext)

    // 将工具结果添加到消息历史
    for (const result of toolResults) {
      const toolBlock = toolUses.find((tu) => tu.id === result.toolUseId)
      yield {
        type: 'tool_result',
        name: toolBlock?.name ?? 'unknown',
        result: result.content,
        isError: result.isError ?? false,
      }

      messages.push({
        type: 'tool_result',
        toolUseId: result.toolUseId,
        content: result.content,
        isError: result.isError,
      })
    }

    // 继续循环 — LLM 将看到工具结果
  }

  yield { type: 'done', totalTurns: turn, totalTokens }
}

/** 合并相邻的文本块 */
function mergeTextBlocks(blocks: AssistantContentBlock[]): AssistantContentBlock[] {
  const merged: AssistantContentBlock[] = []

  for (const block of blocks) {
    if (block.type === 'text' && merged.length > 0) {
      const last = merged[merged.length - 1]
      if (last.type === 'text') {
        last.text += block.text
        continue
      }
    }
    merged.push(block)
  }

  return merged
}
