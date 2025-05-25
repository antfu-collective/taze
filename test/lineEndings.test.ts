import { describe, expect, it } from 'vitest'
import { detectLineEnding, normalizeLineEnding } from '../src/io/packages'

describe('line ending detection and normalization', () => {
  it('should detect LF line endings', () => {
    const content = 'line1\nline2\nline3\n'
    expect(detectLineEnding(content)).toBe('lf')
  })

  it('should detect CRLF line endings', () => {
    const content = 'line1\r\nline2\r\nline3\r\n'
    expect(detectLineEnding(content)).toBe('crlf')
  })

  it('should detect mixed line endings and prefer CRLF when equal', () => {
    const content = 'line1\r\nline2\nline3\r\n'
    expect(detectLineEnding(content)).toBe('crlf')
  })

  it('should prefer LF when more common', () => {
    const content = 'line1\nline2\nline3\r\nline4\n'
    expect(detectLineEnding(content)).toBe('lf')
  })

  it('should handle empty content', () => {
    const content = ''
    expect(detectLineEnding(content)).toBe('lf')
  })

  it('should normalize content to LF', () => {
    const content = 'line1\r\nline2\r\nline3\r\n'
    const normalized = normalizeLineEnding(content, 'lf')
    expect(normalized).toBe('line1\nline2\nline3\n')
  })

  it('should normalize content to CRLF', () => {
    const content = 'line1\nline2\nline3\n'
    const normalized = normalizeLineEnding(content, 'crlf')
    expect(normalized).toBe('line1\r\nline2\r\nline3\r\n')
  })

  it('should handle mixed line endings when normalizing', () => {
    const content = 'line1\r\nline2\nline3\r\n'
    const normalizedLF = normalizeLineEnding(content, 'lf')
    expect(normalizedLF).toBe('line1\nline2\nline3\n')
    
    const normalizedCRLF = normalizeLineEnding(content, 'crlf')
    expect(normalizedCRLF).toBe('line1\r\nline2\r\nline3\r\n')
  })
})
