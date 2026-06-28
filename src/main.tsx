/**
 * REPL 启动 — Ink render
 * 整合渲染器、Agent、工具系统的主入口
 */

import type { PaiCliConfig } from './types/config.js'
import { InlineRenderer } from './render/InlineRenderer.js'
import { PlainRenderer } from './render/PlainRenderer.js'
import { QueryEngine } from './QueryEngine.js'
import { createLlmClient } from './llm/LlmClientFactory.js'
import { ToolRegistry } from './tools/registry.js'
import { getBuiltinTools } from './tools/builtins/index.js'
import { VERSION } from './index.js'
import { commandRegistry, type ModelStatus } from './commands/index.js'
import { Agent } from './agent/Agent.js'
import { PlanExecuteAgent } from './agent/PlanExecuteAgent.js'
import { AgentOrchestrator } from './agent/AgentOrchestrator.js'
import type { Message } from './types/message.js'

/** 启动 REPL */
export async function startRepl(config: PaiCliConfig, cwd: string): Promise<void> {
  // 1. 创建渲染器
  const renderer = config.renderMode === 'plain'
    ? new PlainRenderer()
    : new InlineRenderer()

  // 2. 创建 LLM 客户端
  let llmClient = createLlmClient(config.llm)

  // 3. 创建工具注册表
  const toolRegistry = new ToolRegistry()
  toolRegistry.registerAll(getBuiltinTools())

  // 应用工具过滤
  if (config.tools.enabled.length > 0) {
    const filtered = toolRegistry.filter(config.tools.enabled)
    toolRegistry.clear()
    toolRegistry.registerAll(filtered.listAll())
  }
  if (config.tools.disabled.length > 0) {
    for (const name of config.tools.disabled) {
      toolRegistry.unregister(name)
    }
  }

  // 4. 创建查询引擎
  let engine = createEngine()
  let shouldExit = false
  let planMode = config.prompt.agentMode === 'plan'
  let teamMode = config.prompt.agentMode === 'team'
  let history: Message[] = []
  let sessionTokens = 0

  // 5. 启动 REPL
  await renderer.start()
  renderer.showStatus(buildStatus('idle'))
  renderer.showWelcome(VERSION)

  const runLoop = async () => {
    while (true) {
      renderer.showStatus(buildStatus('idle'))
      renderer.showPrompt()
      const input = await renderer.readInput()

      if (!input.trim()) continue
      if (input === '/exit' || input === '/quit') break

      // 斜线命令处理
      if (input.startsWith('/')) {
        const output = await commandRegistry.execute(input, {
          cwd,
          config: {
            ...config,
            model: config.llm.model,
            provider: config.llm.provider,
            planMode,
            teamMode,
            conversationTurns: Math.floor(history.length / 2),
            contextTokens: getContextTokens(),
          },
          setModel(model, provider) {
            if (provider) config.llm.provider = provider
            config.llm.model = model
            llmClient = createLlmClient(config.llm)
            engine = createEngine()
            renderer.showStatus(buildStatus('idle'))
            return getModelStatus()
          },
          getModelStatus() {
            return getModelStatus()
          },
          clearHistory() {
            history = []
            sessionTokens = 0
            renderer.showStatus(buildStatus('idle'))
          },
          exit() {
            shouldExit = true
          },
          setPlanMode(enabled) {
            planMode = enabled
            if (enabled) teamMode = false
            config.prompt.agentMode = enabled ? 'plan' : 'react'
          },
          setTeamMode(enabled) {
            teamMode = enabled
            if (enabled) planMode = false
            config.prompt.agentMode = enabled ? 'team' : 'react'
          },
        })
        if (output) console.log(output)
        if (shouldExit) break
        continue
      }

      // 执行 Agent 查询
      try {
        let assistantText = ''
        let completed = false
        renderer.showStatus(buildStatus('thinking'))
        for await (const event of runAgent(input)) {
          switch (event.type) {
            case 'text_delta':
              assistantText += event.text
              renderer.appendText(event.text)
              break
            case 'tool_call':
              renderer.showToolCall(event.name, event.input)
              break
            case 'tool_result':
              renderer.showToolResult({
                toolUseId: '',
                content: event.result,
                isError: event.isError,
              })
              break
            case 'error':
              renderer.showError(event.error)
              break
            case 'usage':
              sessionTokens += event.usage.inputTokens + event.usage.outputTokens
              renderer.showStatus(buildStatus('streaming'))
              break
            case 'done':
              completed = true
              sessionTokens = Math.max(sessionTokens, event.totalTokens, getContextTokens())
              renderer.endText()
              break
          }
        }
        if (completed) {
          history.push({ type: 'user', content: input })
          if (assistantText) {
            history.push({
              type: 'assistant',
              content: [{ type: 'text', text: assistantText }],
              model: config.llm.model,
              stopReason: 'end_turn',
            })
          }
        }
        renderer.showStatus(buildStatus('idle'))
      } catch (err) {
        renderer.showError(err instanceof Error ? err : new Error(String(err)))
        renderer.showStatus(buildStatus('idle'))
      }

      console.log()
    }

    await renderer.stop()
  }

  await runLoop()

  function createEngine(): QueryEngine {
    return new QueryEngine({
      llmClient,
      toolRegistry,
      config,
      cwd,
      approvalCallback: async (request) => {
        const result = await renderer.requestApproval(request)
        if (result.decision === 'modify') return 'approve'
        return result.decision
      },
    })
  }

  function createAgent(systemPrompt = engine.getSystemPrompt()): Agent {
    return new Agent({
      llmClient,
      toolRegistry,
      systemPrompt,
      cwd,
      config,
      approvalCallback: async (request) => {
        const result = await renderer.requestApproval(request)
        if (result.decision === 'modify') return 'approve'
        return result.decision
      },
    })
  }

  function runAgent(input: string) {
    if (planMode) {
      return new PlanExecuteAgent(createAgent()).run(input)
    }
    if (teamMode) {
      return new AgentOrchestrator({
        llmClient,
        toolRegistry,
        cwd,
        config,
        approvalCallback: async (request) => {
          const result = await renderer.requestApproval(request)
          if (result.decision === 'modify') return 'approve'
          return result.decision
        },
      }).runAuto(input)
    }
    return engine.ask(input, history)
  }

  function buildStatus(statusText: string) {
    const mcpServers = config.mcp.servers.length
    const enabledMcpServers = config.mcp.servers.filter((server) => server.enabled).length
    return {
      model: config.llm.model,
      provider: config.llm.provider,
      tokensUsed: getContextTokens(),
      tokenLimit: llmClient.maxContextWindow,
      agentMode: planMode ? 'Plan' : teamMode ? 'Team' : 'ReAct',
      statusText,
      cwd,
      toolCount: toolRegistry.size,
      mcpServers,
      connectedMcpServers: enabledMcpServers,
      skills: 0,
      loadedSkills: 0,
      hitlMode: config.policy.hitlMode,
      memoryEnabled: config.features.memory,
      compressionThresholdPercent: Math.round(config.memory.compressionThreshold * 100),
      conversationTurns: Math.floor(history.length / 2),
    }
  }

  function getModelStatus(): ModelStatus {
    return {
      provider: config.llm.provider,
      model: config.llm.model,
      contextWindow: llmClient.maxContextWindow,
      compressionThreshold: config.memory.compressionThreshold,
      shortTermMemoryBudget: Math.floor(llmClient.maxContextWindow * 0.45),
      mcpResourceIndex: config.features.mcp,
      promptCache: 'automatic-prefix-cache',
      conversationTurns: Math.floor(history.length / 2),
    }
  }

  function getContextTokens(): number {
    return Math.max(sessionTokens, estimateHistoryTokens(history))
  }
}

function estimateHistoryTokens(messages: Message[]): number {
  if (messages.length === 0) return 0
  const serialized = messages.map((message) => JSON.stringify(message)).join('')
  return Math.ceil(serialized.length / 4)
}
