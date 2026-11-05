export type Language = 'auto' | 'c' | 'cpp' | 'python' | 'stm32'
export type Depth = 'beginner' | 'deep'

export interface CodeSource {
  id: string
  text: string
  lines: string[]
  lineCount: number
  lineNumberKind: 'snippet'
  language: Language
}

export interface Explanation {
  id: string
  startLine: number
  endLine: number
  summary: string
  detail: string
}

export interface Analysis {
  sourceId: string
  overview: string
  flow: string
  explanations: Explanation[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function createSource(text: string, language: Language): CodeSource {
  if (!text.trim()) throw new Error('代码不能为空')
  const lines = text.split(/\r\n|\n|\r/)
  return {
    id: crypto.randomUUID(),
    text,
    lines,
    lineCount: lines.length,
    lineNumberKind: 'snippet',
    language,
  }
}

export function validateAnalysis(source: CodeSource, raw: unknown): Analysis {
  if (!isRecord(raw) || typeof raw.overview !== 'string' ||
      typeof raw.flow !== 'string' || !Array.isArray(raw.explanations)) {
    throw new Error('解析结果格式无效')
  }

  const explanations = raw.explanations.flatMap((item, index): Explanation[] => {
    if (!isRecord(item) || !Number.isInteger(item.startLine) ||
        !Number.isInteger(item.endLine) || typeof item.summary !== 'string' ||
        typeof item.detail !== 'string') return []
    const startLine = item.startLine as number
    const endLine = item.endLine as number
    if (startLine < 1 || endLine < startLine || endLine > source.lineCount ||
        !item.summary.trim()) return []
    return [{ id: `${source.id}:${index}`, startLine, endLine,
      summary: item.summary.trim(), detail: item.detail.trim() }]
  })

  return { sourceId: source.id, overview: raw.overview.trim(),
    flow: raw.flow.trim(), explanations }
}
