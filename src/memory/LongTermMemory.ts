/**
 * SQLite 长期记忆
 */
import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { expandHomePath } from '../config/paths.js'

export interface MemoryEntry {
  id: number
  content: string
  category: string
  createdAt: string
}

export class LongTermMemory {
  private db: Database.Database | null = null
  private dbPath: string

  constructor(dbPath: string) {
    this.dbPath = expandHomePath(dbPath)
  }

  /** 初始化数据库 */
  init(): void {
    mkdirSync(dirname(this.dbPath), { recursive: true })
    this.db = new Database(this.dbPath)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
  }

  /** 保存记忆 */
  save(content: string, category = 'general'): number {
    if (!this.db) this.init()
    const stmt = this.db!.prepare('INSERT INTO memories (content, category) VALUES (?, ?)')
    const result = stmt.run(content, category)
    return result.lastInsertRowid as number
  }

  /** 查询记忆 */
  search(query: string, limit = 10): MemoryEntry[] {
    if (!this.db) this.init()
    const stmt = this.db!.prepare(
      'SELECT id, content, category, created_at as createdAt FROM memories WHERE content LIKE ? ORDER BY created_at DESC LIMIT ?'
    )
    return stmt.all(`%${query}%`, limit) as MemoryEntry[]
  }

  /** 获取所有记忆 */
  getAll(limit = 100): MemoryEntry[] {
    if (!this.db) this.init()
    const stmt = this.db!.prepare(
      'SELECT id, content, category, created_at as createdAt FROM memories ORDER BY created_at DESC LIMIT ?'
    )
    return stmt.all(limit) as MemoryEntry[]
  }

  /** 删除记忆 */
  delete(id: number): boolean {
    if (!this.db) this.init()
    const stmt = this.db!.prepare('DELETE FROM memories WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /** 关闭数据库 */
  close(): void {
    this.db?.close()
    this.db = null
  }
}
