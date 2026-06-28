/**
 * SKILL.md 解析器
 */
import { readFileSync } from 'node:fs'
import type { Skill } from './types.js'

export class SkillLoader {
  /** 从 SKILL.md 文件加载 Skill 定义 */
  load(filePath: string): Skill | null {
    try {
      const content = readFileSync(filePath, 'utf-8')
      return this.parse(content)
    } catch {
      return null
    }
  }

  /** 解析 SKILL.md 内容 */
  parse(content: string): Skill {
    const lines = content.split('\n')
    let name = 'unknown'
    let description = ''
    const instructions: string[] = []

    for (const line of lines) {
      if (line.startsWith('# ')) {
        name = line.slice(2).trim().toLowerCase().replace(/\s+/g, '-')
      } else if (line.startsWith('> ')) {
        description += line.slice(2).trim() + ' '
      } else {
        instructions.push(line)
      }
    }

    return {
      name,
      description: description.trim(),
      instructions: instructions.join('\n').trim(),
    }
  }
}
