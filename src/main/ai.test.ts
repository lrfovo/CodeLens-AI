import { describe, expect, it, vi } from 'vitest'
import { analyzeCode, extractCodeFromImage, translateKeyword } from './ai'
import { createSource } from '../shared/source'

const mockResponse = (content: unknown) => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }),
}) as Response

describe('AI provider boundary', () => {
  it('translates a programming keyword using the selected provider and validates the result', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      mockResponse({ translation: '易变的', explanation: '禁止相关优化假设', example: 'volatile int flag;' }))
    const result = await translateKeyword({ provider: 'deepseek', key: 'test-key', model: 'deepseek-flash' },
      'volatile', 'c', fetcher as typeof fetch)
    expect(result.translation).toBe('易变的')
    expect(fetcher.mock.calls[0][0]).toBe('https://api.deepseek.com/chat/completions')
    const request = JSON.parse(String(fetcher.mock.calls[0][1]?.body))
    expect(request.messages[1].content).toContain('volatile')
    expect(request.response_format).toEqual({ type: 'json_object' })
    await expect(translateKeyword({ provider: 'deepseek', key: 'test-key', model: 'deepseek-flash' },
      'x'.repeat(121), 'c', fetcher as typeof fetch)).rejects.toThrow('120')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('validates returned line ranges against the unchanged source', async () => {
    const source = createSource('x\ny', 'python')
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => mockResponse({ overview: '概览', flow: '顺序', explanations: [
      { startLine: 1, endLine: 1, summary: '第一行', detail: '说明' },
      { startLine: 99, endLine: 99, summary: '编造', detail: '错误' },
    ] }))
    const result = await analyzeCode({ provider: 'openai', key: 'test-key', model: 'gpt-4.1-mini' },
      source, 'beginner', fetcher as typeof fetch)
    expect(result.explanations).toHaveLength(1)
    expect(source.text).toBe('x\ny')
    const request = JSON.parse(String(fetcher.mock.calls[0][1]?.body))
    expect(request.response_format.type).toBe('json_schema')
  })

  it('keeps image transcription separate from code analysis', async () => {
    const fetcher = vi.fn(async () => mockResponse({ code: 'int x;', uncertainReason: '末尾模糊' }))
    const result = await extractCodeFromImage({ provider: 'openai', key: 'test-key', model: 'gpt-4.1-mini' },
      'data:image/png;base64,AA==', fetcher as typeof fetch)
    expect(result.code).toBe('int x;')
    expect(result.uncertainReason).toBe('末尾模糊')
  })

  it('routes DeepSeek analysis to its endpoint and JSON mode', async () => {
    const source = createSource('print(1)', 'python')
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => mockResponse({ overview: '概览', flow: '顺序', explanations: [
      { startLine: 1, endLine: 1, summary: '输出', detail: '打印数字' },
    ] }))
    const result = await analyzeCode({ provider: 'deepseek', key: 'ds-key', model: 'deepseek-flash' },
      source, 'beginner', fetcher as typeof fetch)
    expect(result.explanations).toHaveLength(1)
    expect(fetcher.mock.calls[0][0]).toBe('https://api.deepseek.com/chat/completions')
    const request = JSON.parse(String(fetcher.mock.calls[0][1]?.body))
    expect(request.response_format).toEqual({ type: 'json_object' })
    expect(request.model).toBe('deepseek-flash')
  })

  it('sends screenshots to DeepSeek vision model', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      mockResponse({ code: 'int x;', uncertainReason: '' }))
    await extractCodeFromImage({ provider: 'deepseek', key: 'ds-key', model: 'deepseek-flash' },
      'data:image/png;base64,AA==', fetcher as typeof fetch)
    const request = JSON.parse(String(fetcher.mock.calls[0][1]?.body))
    expect(request.messages[1].content[1].image_url.url).toBe('data:image/png;base64,AA==')
    expect(request.response_format).toEqual({ type: 'json_object' })
  })
})
