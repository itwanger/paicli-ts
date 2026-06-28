/**
 * Skill 类型定义
 */
export interface Skill {
  name: string
  description: string
  instructions: string
  tools?: string[]
  triggers?: string[]
}
