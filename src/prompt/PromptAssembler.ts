/**
 * Prompt 分层组装器
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export interface PromptContext {
  date: string
  model: string
  tools: string[]
  cwd: string
  agentMode: string
}

export class PromptAssembler {
  private builtinPath: string
  private userPath: string
  private projectPaths: string[]

  constructor(builtinPath: string, projectPaths: string[] = []) {
    this.builtinPath = builtinPath
    this.userPath = join(homedir(), '.paicli', 'prompts')
    this.projectPaths = projectPaths
  }

  /** 组装完整 Prompt */
  assemble(context: PromptContext, personality = 'default'): string {
    const parts: string[] = []

    // 1. 基础 Prompt
    const base = this.loadTemplate('base.md')
    if (base) parts.push(base)

    // 2. 模式 Prompt
    const mode = this.loadTemplate(`modes/${context.agentMode}.md`)
    if (mode) parts.push(mode)

    // 3. 人格 Prompt
    if (personality !== 'default') {
      const persona = this.loadTemplate(`personalities/${personality}.md`)
      if (persona) parts.push(persona)
    }

    // 4. 运行时上下文注入
    parts.push(this.buildContextSection(context))

    return parts.join('\n\n')
  }

  /** 加载模板（支持层级覆盖） */
  private loadTemplate(relativePath: string): string | null {
    const paths = [
      ...this.projectPaths.map((p) => join(p, relativePath)),
      join(this.userPath, relativePath),
      join(this.builtinPath, relativePath),
    ]

    // 优先级：项目级 > 用户级 > 内置
    for (const path of paths) {
      if (existsSync(path)) {
        try {
          return readFileSync(path, 'utf-8').trim()
        } catch { /* skip */ }
      }
    }
    return null
  }

  /** 构建运行时上下文 */
  private buildContextSection(ctx: PromptContext): string {
    return [
      '## Runtime Context',
      `- Date: ${ctx.date}`,
      `- Model: ${ctx.model}`,
      `- Working directory: ${ctx.cwd}`,
      `- Available tools: ${ctx.tools.join(', ')}`,
      `- Agent mode: ${ctx.agentMode}`,
    ].join('\n')
  }
}
