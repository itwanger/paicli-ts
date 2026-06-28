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
import { commandRegistry } from './commands/index.js'
import { Agent } from './agent/Agent.js'
import { PlanExecuteAgent } from './agent/PlanExecuteAgent.js'
import { AgentOrchestrator } from './agent/AgentOrchestrator.js'

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

  // 5. 启动 REPL
  await renderer.start()
  renderer.showWelcome(VERSION)

  const runLoop = async () => {
    while (true) {
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
          },
          setModel(model) {
            config.llm.model = model
            llmClient = createLlmClient(config.llm)
            engine = createEngine()
          },
          clearHistory() {
            // QueryEngine is stateless today; this hook is kept for command consistency.
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
        for await (const event of runAgent(input)) {
          switch (event.type) {
            case 'text_delta':
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
            case 'done':
              renderer.endText()
              break
          }
        }
      } catch (err) {
        renderer.showError(err instanceof Error ? err : new Error(String(err)))
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
    return engine.ask(input)
  }
}
