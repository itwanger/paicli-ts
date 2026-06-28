/**
 * PaiCLI — Terminal AI Agent
 * 主导出模块
 */

export const VERSION = '0.1.0'
export const NAME = 'paicli'

export { loadConfig, getConfigPaths } from './config/Config.js'
export type { PaiCliConfig } from './types/config.js'

/**
 * 主入口函数 — 启动 PaiCLI
 * 将在 Task 13 (CLI 入口与集成) 中实现完整逻辑
 */
export async function main(): Promise<void> {
  console.log(`${NAME} v${VERSION} — Terminal AI Agent`)
  console.log('项目脚手架已就绪，等待后续 Task 实现。')
}
