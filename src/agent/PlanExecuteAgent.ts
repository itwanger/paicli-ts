/**
 * Plan-and-Execute Agent — 任务规划 + 逐步执行
 */
import { Agent } from './Agent.js'
import type { AgentEvent } from '../query.js'

export interface PlanStep {
  index: number
  description: string
  status: 'pending' | 'running' | 'done' | 'failed'
  result?: string
}

/**
 * PlanExecuteAgent
 * 1. 使用 LLM 生成任务计划
 * 2. 逐步执行每个步骤
 */
export class PlanExecuteAgent {
  private agent: Agent

  constructor(agent: Agent) {
    this.agent = agent
  }

  /**
   * 执行 Plan-and-Execute 流程
   */
  async *run(task: string, abortSignal?: AbortSignal): AsyncGenerator<AgentEvent> {
    // Phase 1: 生成计划
    yield { type: 'text_delta', text: '📋 Creating plan...\n' }

    const planResult = await this.agent.runComplete(
      `Create a detailed step-by-step plan for this task:\n${task}\n\nProvide a numbered list of steps.`,
      abortSignal,
    )

    yield { type: 'text_delta', text: planResult.text + '\n\n' }

    // Phase 2: 逐步执行
    const steps = this.parseSteps(planResult.text)
    yield { type: 'text_delta', text: `📝 Plan has ${steps.length} steps. Executing...\n\n` }

    for (let i = 0; i < steps.length; i++) {
      if (abortSignal?.aborted) break

      yield { type: 'text_delta', text: `\n--- Step ${i + 1}/${steps.length}: ${steps[i]} ---\n` }

      const stepResult = await this.agent.runComplete(
        `Execute step ${i + 1} of the plan: "${steps[i]}"\nContext: previous steps completed. Task: ${task}`,
        abortSignal,
      )

      yield { type: 'text_delta', text: stepResult.text + '\n' }
    }

    yield { type: 'text_delta', text: '\n✅ Plan execution complete.\n' }
    yield { type: 'done', totalTurns: steps.length + 1, totalTokens: planResult.totalTokens }
  }

  /** 从 LLM 输出解析步骤 */
  private parseSteps(text: string): string[] {
    const lines = text.split('\n')
    const steps: string[] = []

    for (const line of lines) {
      const match = line.match(/^\d+[\.\)]\s*(.+)/)
      if (match) steps.push(match[1].trim())
    }

    return steps.length > 0 ? steps : ['Execute the task']
  }
}
