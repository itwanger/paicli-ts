/**
 * Bash 命令执行工具
 */
import { z } from 'zod'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { buildTool } from '../Tool.js'
import { validateToolCommand } from './guards.js'

const execAsync = promisify(exec)

export const BashTool = buildTool({
  name: 'bash',
  description: 'Execute a shell command in the project directory. Use for git, npm, system commands, etc.',
  inputSchema: z.object({
    command: z.string().describe('Shell command to execute'),
    timeout: z.number().optional().describe('Timeout in milliseconds (default: 30000)'),
  }),
  isReadOnly: false,
  isConcurrencySafe: false,
  dangerLevel: 'high',
  async call(input, context) {
    const timeout = input.timeout ?? 30_000
    try {
      validateToolCommand(context, input.command)
      const { stdout, stderr } = await execAsync(input.command, {
        cwd: context.cwd,
        timeout,
        maxBuffer: 1024 * 1024 * 10, // 10MB
        env: { ...process.env },
      })

      let output = ''
      if (stdout) output += stdout
      if (stderr) output += (output ? '\n--- stderr ---\n' : '') + stderr

      return {
        content: output.trim() || '(command completed with no output)',
        displaySummary: `$ ${input.command}`,
      }
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string; message: string; killed?: boolean }
      if (error.killed) {
        return { content: `Command timed out after ${timeout}ms: ${input.command}`, isError: true }
      }
      const output = [error.stdout, error.stderr].filter(Boolean).join('\n')
      return {
        content: `Command failed: ${error.message}\n${output}`.trim(),
        isError: true,
        displaySummary: `$ ${input.command} (failed)`,
      }
    }
  },
})
