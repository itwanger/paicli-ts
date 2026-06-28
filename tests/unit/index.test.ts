import { describe, it, expect } from 'vitest'
import { VERSION, NAME } from '../../src/index.js'

describe('PaiCLI', () => {
  it('should have correct version', () => {
    expect(VERSION).toBe('0.1.0')
  })

  it('should have correct name', () => {
    expect(NAME).toBe('paicli')
  })
})
