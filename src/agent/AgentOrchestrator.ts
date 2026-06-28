/**
 * AgentOrchestrator — 多代理编排
 * 支持将复杂任务分配给多个 Agent 并行/串行执行
 */

import { Agent, type AgentOptions } from './Agent.js'
import type { AgentEvent } from '../query.js'

/** 子代理角色定义 */
export interface AgentRole {
  /** 角色名称 */
  name: string
  /** 角色描述 */
  description: string
  /** 系统提示 */
  systemPrompt: string
}

/** 预定义角色 */
export const BUILTIN_ROLES: Record<string, AgentRole> = {
  architect: {
    name: 'architect',
    description: '系统架构师 — 负责设计决策和架构规划',
    systemPrompt: 'You are a senior software architect. Focus on high-level design decisions, system architecture, and technical strategy. Provide clear, actionable architectural guidance.',
  },
  developer: {
    name: 'developer',
    description: '开发者 — 负责代码实现',
    systemPrompt: 'You are an expert developer. Focus on writing clean, efficient, and well-tested code. Follow best practices and provide production-ready implementations.',
  },
  reviewer: {
    name: 'reviewer',
    description: '代码审查者 — 负责质量把控',
    systemPrompt: 'You are a thorough code reviewer. Focus on identifying bugs, security issues, performance problems, and maintainability concerns. Provide constructive feedback with suggested fixes.',
  },
  researcher: {
    name: 'researcher',
    description: '研究员 — 负责信息搜集与分析',
    systemPrompt: 'You are a technical researcher. Focus on gathering relevant information, analyzing options, and providing well-structured research summaries to support decision-making.',
  },
}

/** 编排任务分配 */
export interface OrchestrationTask {
  /** 目标 Agent 角色 */
  role: string
  /** 任务描述 */
  prompt: string
  /** 依赖的前置任务索引 */
  dependsOn?: number[]
}

/** 编排计划 */
export interface OrchestrationPlan {
  /** 总体目标 */
  goal: string
  /** 子任务列表 */
  tasks: OrchestrationTask[]
}

/** 子任务执行结果 */
export interface TaskResult {
  /** 任务索引 */
  taskIndex: number
  /** 角色 */
  role: string
  /** 输出文本 */
  output: string
  /** Token 消耗 */
  totalTokens: number
  /** 是否成功 */
  success: boolean
}

/**
 * AgentOrchestrator — 多代理编排器
 * 
 * 支持两种模式：
 * 1. 自动模式: LLM 分析任务并自动分配子任务给不同角色
 * 2. 手动模式: 用户显式指定任务和角色分配
 */
export class AgentOrchestrator {
  private agents: Map<string, Agent> = new Map()
  private roles: Map<string, AgentRole> = new Map()
  private baseOptions: Omit<AgentOptions, 'systemPrompt'>

  constructor(baseOptions: Omit<AgentOptions, 'systemPrompt'>, customRoles?: AgentRole[]) {
    this.baseOptions = baseOptions

    // 注册内置角色
    for (const role of Object.values(BUILTIN_ROLES)) {
      this.registerRole(role)
    }

    // 注册自定义角色
    if (customRoles) {
      for (const role of customRoles) {
        this.registerRole(role)
      }
    }
  }

  /** 注册角色 */
  registerRole(role: AgentRole): void {
    this.roles.set(role.name, role)
    const agent = new Agent({
      ...this.baseOptions,
      systemPrompt: role.systemPrompt,
    })
    this.agents.set(role.name, agent)
  }

  /** 获取已注册角色列表 */
  getRoles(): AgentRole[] {
    return Array.from(this.roles.values())
  }

  /**
   * 自动编排 — LLM 分析任务并自动分配
   */
  async *runAuto(goal: string, abortSignal?: AbortSignal): AsyncGenerator<AgentEvent> {
    yield { type: 'text_delta', text: '🤖 Analyzing task and creating orchestration plan...\n\n' }

    // 使用 developer agent 生成编排计划
    const plannerAgent = this.agents.get('developer') ?? this.agents.values().next().value
    if (!plannerAgent) {
      yield { type: 'text_delta', text: '❌ No agents available for orchestration.\n' }
      yield { type: 'done', totalTurns: 0, totalTokens: 0 }
      return
    }

    const roleDescriptions = this.getRoles()
      .map(r => `- ${r.name}: ${r.description}`)
      .join('\n')

    const planPrompt = `Analyze this goal and create an execution plan using available agent roles.

Available roles:
${roleDescriptions}

Goal: ${goal}

Create a plan with specific tasks assigned to specific roles. Format:
1. [role_name] Task description
2. [role_name] Task description
...

Only use available roles. Keep it concise.`

    const planResult = await plannerAgent.runComplete(planPrompt, abortSignal)
    yield { type: 'text_delta', text: `📋 Orchestration Plan:\n${planResult.text}\n\n` }

    // 解析并执行计划
    const tasks = this.parseOrchestrationPlan(planResult.text)
    yield { type: 'text_delta', text: `📝 Executing ${tasks.length} tasks...\n\n` }

    const results: TaskResult[] = []
    for (let i = 0; i < tasks.length; i++) {
      if (abortSignal?.aborted) break

      const task = tasks[i]!
      yield { type: 'text_delta', text: `\n--- Task ${i + 1}/${tasks.length} [${task.role}] ---\n` }

      // 构建上下文（包含依赖任务结果）
      let contextPrompt = task.prompt
      if (task.dependsOn && task.dependsOn.length > 0) {
        const depResults = task.dependsOn
          .map(idx => results[idx])
          .filter(Boolean)
          .map((r, j) => `Previous task ${j + 1} [${r.role}] result:\n${r.output}`)
          .join('\n\n')
        if (depResults) {
          contextPrompt = `${depResults}\n\nNow execute: ${task.prompt}`
        }
      }

      const result = yield* this.executeTask(i, task, contextPrompt, abortSignal)
      if (result) results.push(result)
    }

    yield { type: 'text_delta', text: '\n✅ Orchestration complete.\n' }
    yield { type: 'done', totalTurns: results.length + 1, totalTokens: planResult.totalTokens }
  }

  /**
   * 手动编排 — 执行预定义计划
   */
  async *runPlan(plan: OrchestrationPlan, abortSignal?: AbortSignal): AsyncGenerator<AgentEvent> {
    yield { type: 'text_delta', text: `🤖 Executing orchestration plan: ${plan.goal}\n` }
    yield { type: 'text_delta', text: `📝 ${plan.tasks.length} tasks to execute.\n\n` }

    const results: TaskResult[] = []

    for (let i = 0; i < plan.tasks.length; i++) {
      if (abortSignal?.aborted) break

      const task = plan.tasks[i]!
      yield { type: 'text_delta', text: `\n--- Task ${i + 1}/${plan.tasks.length} [${task.role}] ---\n` }

      // 构建上下文
      let contextPrompt = task.prompt
      if (task.dependsOn && task.dependsOn.length > 0) {
        const depResults = task.dependsOn
          .map(idx => results[idx])
          .filter(Boolean)
          .map((r, j) => `Previous task ${j + 1} [${r.role}] result:\n${r.output}`)
          .join('\n\n')
        if (depResults) {
          contextPrompt = `${depResults}\n\nNow execute: ${task.prompt}`
        }
      }

      const result = yield* this.executeTask(i, task, contextPrompt, abortSignal)
      if (result) results.push(result)
    }

    yield { type: 'text_delta', text: '\n✅ Plan execution complete.\n' }
    yield { type: 'done', totalTurns: plan.tasks.length, totalTokens: 0 }
  }

  /** 执行单个子任务 */
  private async *executeTask(
    index: number,
    task: OrchestrationTask,
    prompt: string,
    abortSignal?: AbortSignal,
  ): AsyncGenerator<AgentEvent, TaskResult | undefined> {
    const agent = this.agents.get(task.role)
    if (!agent) {
      yield { type: 'text_delta', text: `⚠️ Unknown role "${task.role}", skipping.\n` }
      return {
        taskIndex: index,
        role: task.role,
        output: '',
        totalTokens: 0,
        success: false,
      }
    }

    // 清空 agent 历史以开始新任务
    agent.clearHistory()

    let output = ''
    let totalTokens = 0
    let success = true

    for await (const event of agent.run(prompt, abortSignal)) {
      if (event.type === 'text_delta') output += event.text
      if (event.type === 'done') totalTokens = event.totalTokens
      if (event.type === 'error') success = false
      yield event
    }

    return {
      taskIndex: index,
      role: task.role,
      output,
      totalTokens,
      success,
    }
  }

  /** 从 LLM 输出解析编排计划 */
  private parseOrchestrationPlan(text: string): OrchestrationTask[] {
    const lines = text.split('\n')
    const tasks: OrchestrationTask[] = []

    for (const line of lines) {
      // 匹配格式: 1. [role_name] Task description
      const match = line.match(/^\d+[\.\)]\s*\[(\w+)\]\s*(.+)/)
      if (match) {
        const role = match[1]!
        const prompt = match[2]!.trim()
        // 默认依赖前一个任务
        const dependsOn = tasks.length > 0 ? [tasks.length - 1] : undefined
        tasks.push({ role, prompt, dependsOn })
      }
    }

    // 如果未解析到任务，用 developer 角色执行
    if (tasks.length === 0) {
      tasks.push({ role: 'developer', prompt: text })
    }

    return tasks
  }
}
