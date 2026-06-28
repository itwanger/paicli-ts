/**
 * 路径围栏 — 限制文件访问在项目根目录内
 */
import { isAbsolute, resolve, relative } from 'node:path'

export class PathGuard {
  private rootDir: string

  constructor(rootDir: string) {
    this.rootDir = resolve(rootDir)
  }

  /** 检查路径是否在允许范围内 */
  isAllowed(filePath: string): boolean {
    const resolved = resolve(this.rootDir, filePath)
    const rel = relative(this.rootDir, resolved)
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
  }

  /** 验证路径（不通过则抛错） */
  validate(filePath: string): string {
    const resolved = resolve(this.rootDir, filePath)
    if (!this.isAllowed(filePath)) {
      throw new PathGuardError(`Path "${filePath}" is outside project root "${this.rootDir}"`)
    }
    return resolved
  }

  /** 获取项目根目录 */
  getRoot(): string {
    return this.rootDir
  }
}

export class PathGuardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PathGuardError'
  }
}
