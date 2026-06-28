/**
 * 斜线命令注册表
 */

export interface SlashCommand {
  name: string
  description: string
  execute: (args: string[], context: CommandContext) => Promise<string | void>
}

export interface CommandContext {
  cwd: string
  config: Record<string, unknown>
  setModel?: (model: string) => void
  clearHistory?: () => void
  exit?: () => void
  /** 切换到 plan 模式 */
  setPlanMode?: (enabled: boolean) => void
  /** 切换到 team 模式 */
  setTeamMode?: (enabled: boolean) => void
}

class CommandRegistry {
  private commands = new Map<string, SlashCommand>()

  register(cmd: SlashCommand): void {
    this.commands.set(cmd.name, cmd)
  }

  get(name: string): SlashCommand | undefined {
    return this.commands.get(name)
  }

  list(): SlashCommand[] {
    return [...this.commands.values()]
  }

  async execute(input: string, context: CommandContext): Promise<string | void> {
    const parts = input.slice(1).split(' ')
    const name = parts[0]
    const args = parts.slice(1)
    const cmd = this.commands.get(name)
    if (!cmd) return `Unknown command: /${name}. Type /help for available commands.`
    return cmd.execute(args, context)
  }

  isCommand(input: string): boolean {
    return input.startsWith('/') && !this.commands.size === false
  }

  /** 命令名列表（用于补全） */
  getNames(): string[] {
    return [...this.commands.keys()]
  }
}

export const commandRegistry = new CommandRegistry()

// ─── 注册内置命令 ───

commandRegistry.register({
  name: 'help',
  description: 'Show available commands',
  async execute() {
    const cmds = commandRegistry.list()
    return 'Available commands:\n' + cmds.map((c) => `  /${c.name} — ${c.description}`).join('\n')
  },
})

commandRegistry.register({
  name: 'clear',
  description: 'Clear conversation history',
  async execute(_args, ctx) {
    ctx.clearHistory?.()
    return 'Conversation history cleared.'
  },
})

commandRegistry.register({
  name: 'model',
  description: 'Show or switch model: /model [name]',
  async execute(args, ctx) {
    if (args.length > 0) {
      ctx.setModel?.(args[0])
      return `Switched to model: ${args[0]}`
    }
    return `Current model: ${ctx.config.model ?? 'unknown'}`
  },
})

commandRegistry.register({
  name: 'exit',
  description: 'Exit PaiCLI',
  async execute(_args, ctx) {
    ctx.exit?.()
  },
})

commandRegistry.register({
  name: 'plan',
  description: 'Toggle plan-and-execute mode for complex tasks',
  async execute(_args, ctx) {
    const enabled = !ctx.config.planMode
    ctx.setPlanMode?.(enabled)
    return enabled ? 'Plan mode enabled. Next query will use plan-and-execute.' : 'Plan mode disabled.'
  },
})

commandRegistry.register({
  name: 'team',
  description: 'Toggle multi-agent team mode',
  async execute(_args, ctx) {
    const enabled = !ctx.config.teamMode
    ctx.setTeamMode?.(enabled)
    return enabled ? 'Team mode enabled. Next query will use multi-agent orchestration.' : 'Team mode disabled.'
  },
})

commandRegistry.register({
  name: 'memory',
  description: 'Show memory stats or manage: /memory [clear|stats]',
  async execute(args, ctx) {
    const sub = args[0] ?? 'stats'
    if (sub === 'clear') {
      return 'Memory cleared (conversation + context).'
    }
    return `Memory: conversation turns: ${ctx.config.conversationTurns ?? 0}, long-term entries: ${ctx.config.memoryEntries ?? 0}`
  },
})

commandRegistry.register({
  name: 'mcp',
  description: 'MCP server management: /mcp [list|start|stop]',
  async execute(args, _ctx) {
    const sub = args[0] ?? 'list'
    if (sub === 'list') {
      return 'Connected MCP servers: (none)'
    }
    if (sub === 'start' && args[1]) {
      return `Starting MCP server: ${args[1]}...`
    }
    if (sub === 'stop' && args[1]) {
      return `Stopping MCP server: ${args[1]}...`
    }
    return 'Usage: /mcp [list|start <name>|stop <name>]'
  },
})

commandRegistry.register({
  name: 'config',
  description: 'Show or update config: /config [key] [value]',
  async execute(args, ctx) {
    if (args.length === 0) {
      return 'Current config:\n' + JSON.stringify(ctx.config, null, 2)
    }
    if (args.length === 1) {
      const val = ctx.config[args[0]]
      return `${args[0]} = ${val ?? '(not set)'}`
    }
    return `Config update not supported in runtime. Edit config file directly.`
  },
})

commandRegistry.register({
  name: 'hitl',
  description: 'HITL approval mode: /hitl [on|off|auto]',
  async execute(args, _ctx) {
    const mode = args[0] ?? 'auto'
    if (['on', 'off', 'auto'].includes(mode)) {
      return `HITL approval mode set to: ${mode}`
    }
    return 'Usage: /hitl [on|off|auto]'
  },
})

commandRegistry.register({
  name: 'skill',
  description: 'Skill management: /skill [list|load|unload]',
  async execute(args, _ctx) {
    const sub = args[0] ?? 'list'
    if (sub === 'list') {
      return 'Loaded skills: (none)'
    }
    if (sub === 'load' && args[1]) {
      return `Loading skill: ${args[1]}...`
    }
    if (sub === 'unload' && args[1]) {
      return `Unloading skill: ${args[1]}...`
    }
    return 'Usage: /skill [list|load <name>|unload <name>]'
  },
})
