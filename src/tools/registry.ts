/**
 * 工具注册表
 * 管理所有可用工具的注册、查询、过滤
 */

import type { Tool } from './Tool.js'
import type { ToolDefinition } from '../types/tool.js'

/**
 * 工具注册表
 */
export class ToolRegistry {
  private tools = new Map<string, Tool>()

  /** 注册工具 */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`)
    }
    this.tools.set(tool.name, tool)
  }

  /** 批量注册 */
  registerAll(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool)
    }
  }

  /** 取消注册 */
  unregister(name: string): boolean {
    return this.tools.delete(name)
  }

  /** 获取工具 */
  get(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  /** 获取工具（不存在则抛错） */
  getOrThrow(name: string): Tool {
    const tool = this.tools.get(name)
    if (!tool) {
      throw new Error(`Tool "${name}" not found. Available: ${this.listNames().join(', ')}`)
    }
    return tool
  }

  /** 是否已注册 */
  has(name: string): boolean {
    return this.tools.has(name)
  }

  /** 获取所有工具名称 */
  listNames(): string[] {
    return [...this.tools.keys()]
  }

  /** 获取所有工具实例 */
  listAll(): Tool[] {
    return [...this.tools.values()]
  }

  /** 获取所有工具定义（给 LLM） */
  getDefinitions(): ToolDefinition[] {
    return this.listAll().map((t) => t.getDefinition())
  }

  /** 按名称过滤工具 */
  filter(names: string[]): ToolRegistry {
    const filtered = new ToolRegistry()
    for (const name of names) {
      const tool = this.tools.get(name)
      if (tool) filtered.register(tool)
    }
    return filtered
  }

  /** 排除指定工具 */
  exclude(names: string[]): ToolRegistry {
    const nameSet = new Set(names)
    const filtered = new ToolRegistry()
    for (const [name, tool] of this.tools) {
      if (!nameSet.has(name)) filtered.register(tool)
    }
    return filtered
  }

  /** 获取只读工具 */
  getReadOnlyTools(): Tool[] {
    return this.listAll().filter((t) => t.isReadOnly)
  }

  /** 获取可并发工具 */
  getConcurrentSafeTools(): Tool[] {
    return this.listAll().filter((t) => t.isConcurrencySafe)
  }

  /** 工具数量 */
  get size(): number {
    return this.tools.size
  }

  /** 清空 */
  clear(): void {
    this.tools.clear()
  }
}
