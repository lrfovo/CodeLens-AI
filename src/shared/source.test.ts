import { describe, expect, it } from 'vitest'
import { createSource, validateAnalysis } from './source'

describe('createSource', () => {
  it('keeps the original code and numbers snippet lines locally', () => {
    const text = 'int main() {\r\n  return 0;\r\n}'
    const source = createSource(text, 'cpp')
    expect(source.text).toBe(text)
    expect(source.lines).toEqual(['int main() {', '  return 0;', '}'])
    expect(source.lineCount).toBe(3)
    expect(source.lineNumberKind).toBe('snippet')
  })

  it('rejects blank input', () => {
    expect(() => createSource(' \n\t', 'auto')).toThrow('代码不能为空')
  })
})

describe('validateAnalysis', () => {
  it('keeps valid ranges and removes invented line numbers', () => {
    const source = createSource('a\nb\nc', 'python')
    const result = validateAnalysis(source, {
      overview: '概览',
      flow: '流程',
      explanations: [
        { startLine: 1, endLine: 2, summary: '前两行', detail: '说明' },
        { startLine: 4, endLine: 4, summary: '不存在', detail: '错误' },
        { startLine: 3, endLine: 2, summary: '逆序', detail: '错误' },
      ],
    })
    expect(result.explanations).toHaveLength(1)
    expect(result.explanations[0]).toMatchObject({ startLine: 1, endLine: 2 })
  })

  it('rejects malformed response objects', () => {
    const source = createSource('a', 'auto')
    expect(() => validateAnalysis(source, { overview: 'x' })).toThrow('解析结果格式无效')
  })
})
