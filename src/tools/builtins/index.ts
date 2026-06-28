/**
 * 内置工具集合
 */
export { ReadFileTool } from './ReadFileTool.js'
export { WriteFileTool } from './WriteFileTool.js'
export { ListDirTool } from './ListDirTool.js'
export { GlobTool } from './GlobTool.js'
export { GrepTool } from './GrepTool.js'
export { BashTool } from './BashTool.js'
export { WebSearchTool } from './WebSearchTool.js'
export { WebFetchTool } from './WebFetchTool.js'
export { SaveMemoryTool } from './SaveMemoryTool.js'

import type { Tool } from '../Tool.js'
import { ReadFileTool } from './ReadFileTool.js'
import { WriteFileTool } from './WriteFileTool.js'
import { ListDirTool } from './ListDirTool.js'
import { GlobTool } from './GlobTool.js'
import { GrepTool } from './GrepTool.js'
import { BashTool } from './BashTool.js'
import { WebSearchTool } from './WebSearchTool.js'
import { WebFetchTool } from './WebFetchTool.js'
import { SaveMemoryTool } from './SaveMemoryTool.js'

/** 获取所有内置工具 */
export function getBuiltinTools(): Tool[] {
  return [
    ReadFileTool,
    WriteFileTool,
    ListDirTool,
    GlobTool,
    GrepTool,
    BashTool,
    WebSearchTool,
    WebFetchTool,
    SaveMemoryTool,
  ]
}
