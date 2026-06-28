import { resolve } from 'node:path'
import type { ToolContext } from '../../types/tool.js'
import { PathGuard } from '../../policy/PathGuard.js'
import { CommandGuard } from '../../policy/CommandGuard.js'

type PolicyConfigLike = {
  pathGuardEnabled?: boolean
  commandBlacklist?: string[]
}

function getPolicy(context: ToolContext): PolicyConfigLike | undefined {
  const config = context.config as { policy?: PolicyConfigLike }
  return config.policy
}

export function resolveToolPath(context: ToolContext, path: string): string {
  const policy = getPolicy(context)
  if (policy?.pathGuardEnabled === false) {
    return resolve(context.cwd, path)
  }
  return new PathGuard(context.cwd).validate(path)
}

export function validateToolCommand(context: ToolContext, command: string): void {
  const policy = getPolicy(context)
  const guard = new CommandGuard(policy?.commandBlacklist)
  guard.validate(command)
}
