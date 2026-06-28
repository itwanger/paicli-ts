/**
 * 命令黑名单 — 拦截危险 shell 命令
 */

const DEFAULT_BLACKLIST = [
  'sudo',
  'rm -rf /',
  'rm -rf ~',
  'mkfs',
  'dd if=/dev/zero',
  ':(){:|:&};:',
  'chmod -R 777 /',
  '> /dev/sda',
  'wget.*|.*sh',
  'curl.*|.*sh',
]

export class CommandGuard {
  private blacklist: RegExp[]

  constructor(blacklist: string[] = DEFAULT_BLACKLIST) {
    this.blacklist = blacklist.map((pattern) => new RegExp(pattern, 'i'))
  }

  /** 检查命令是否被允许 */
  isAllowed(command: string): boolean {
    return !this.blacklist.some((pattern) => pattern.test(command))
  }

  /** 验证命令（不通过则抛错） */
  validate(command: string): void {
    if (!this.isAllowed(command)) {
      throw new CommandGuardError(`Command blocked by security policy: "${command}"`)
    }
  }

  /** 获取黑名单 */
  getBlacklist(): string[] {
    return this.blacklist.map((r) => r.source)
  }
}

export class CommandGuardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CommandGuardError'
  }
}
