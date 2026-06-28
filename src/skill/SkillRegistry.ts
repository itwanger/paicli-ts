/**
 * Skill 注册表 — 发现、加载、管理 Skills
 */
import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { Skill } from './types.js'
import { SkillLoader } from './SkillLoader.js'

export class SkillRegistry {
  private skills = new Map<string, Skill>()
  private loader = new SkillLoader()

  /** 从目录加载 Skills */
  loadFromDir(dir: string): void {
    if (!existsSync(dir)) return

    try {
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillPath = join(dir, entry.name, 'SKILL.md')
          if (existsSync(skillPath)) {
            const skill = this.loader.load(skillPath)
            if (skill) this.skills.set(skill.name, skill)
          }
        }
      }
    } catch { /* skip */ }
  }

  /** 加载所有层级的 Skills */
  loadAll(builtinDir: string): void {
    // 内置 Skills
    this.loadFromDir(builtinDir)

    // 用户级 Skills
    this.loadFromDir(join(homedir(), '.paicli', 'skills'))

    // 项目级 Skills
    this.loadFromDir(join(process.cwd(), 'skills'))
  }

  /** 获取 Skill */
  get(name: string): Skill | undefined {
    return this.skills.get(name)
  }

  /** 列出所有 Skills */
  list(): Skill[] {
    return [...this.skills.values()]
  }

  /** 注册 Skill */
  register(skill: Skill): void {
    this.skills.set(skill.name, skill)
  }
}
