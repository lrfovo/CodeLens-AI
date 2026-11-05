import { describe, expect, it, vi } from 'vitest'
import { analyzeCode, extractCodeFromImage } from './openai'
import { createSource } from '../shared/source'

const mockResponse = (content: unknown) => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }),
}) as Response

describe('OpenAI boundary', () => {
  it('validates returned line ranges against the unchanged source', async () => {
    const source = createSource('x\ny', 'python')
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => mockResponse({ overview: '概览', flow: '顺序', explanations: [
      { startLine: 1, endLine: 1, summary: '第一行', detail: '说明' },
      { startLine: 99, endLine: 99, summary: '编造', detail: '错误' },
    ] }))
    const result = await analyzeCode('test-key', 'gpt-4.1-mini', source, 'beginner', fetcher as typeof fetch)
    expect(result.explanations).toHaveLength(1)
    expect(source.text).toBe('x\ny')
    const request = JSON.parse(String(fetcher.mock.calls[0][1]?.body))
    expect(request.response_format.type).toBe('json_schema')
  })

  it('keeps image transcription separate from code analysis', async () => {
    const fetcher = vi.fn(async () => mockResponse({ code: 'int x;', uncertainReason: '末尾模糊' }))
    const result = await extractCodeFromImage('test-key', 'gpt-4.1-mini', 'data:image/png;base64,AA==', fetcher as typeof fetch)
    expect(result.code).toBe('int x;')
    expect(result.uncertainReason).toBe('末尾模糊')
  })
})
