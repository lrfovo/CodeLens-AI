import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Provider } from '../shared/desktop'
import type { HistoryRecord, HistorySummary } from '../shared/history'
import { validateAnalysis, type Analysis, type CodeSource } from '../shared/source'

export interface HistoryCodec {
  encode(text: string): Promise<Buffer>
  decode(data: Buffer): Promise<string>
}

const fileName = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.bin$/i
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function parseRecord(value: unknown): HistoryRecord {
  if (!isRecord(value) || typeof value.id !== 'string' ||
      !fileName.test(`${value.id}.bin`) || typeof value.createdAt !== 'string' ||
      Number.isNaN(Date.parse(value.createdAt)) ||
      !['openai', 'deepseek'].includes(String(value.provider)) ||
      typeof value.model !== 'string' || !isRecord(value.source) || !isRecord(value.analysis) ||
      !Array.isArray(value.turns)) throw new Error('历史记录已损坏')
  const source = value.source as unknown as CodeSource
  if (typeof source.text !== 'string' || typeof source.id !== 'string' ||
      !Array.isArray(source.lines) || source.text.length > 30_000 ||
      !['auto', 'c', 'cpp', 'python', 'stm32'].includes(source.language) ||
      source.lineNumberKind !== 'snippet') throw new Error('历史记录已损坏')
  const lines = source.text.split(/\r\n|\n|\r/)
  if (source.lineCount !== lines.length || source.lines.length !== lines.length ||
      source.lines.some((line, index) => line !== lines[index])) throw new Error('历史记录已损坏')
  const rawAnalysis = value.analysis as unknown as Analysis
  if (rawAnalysis.sourceId !== source.id) throw new Error('历史记录已损坏')
  const analysis = validateAnalysis(source, rawAnalysis)
  if (analysis.explanations.length !== rawAnalysis.explanations.length ||
      value.turns.some((turn) => !isRecord(turn) || typeof turn.question !== 'string' ||
        typeof turn.answer !== 'string')) throw new Error('历史记录已损坏')
  return {
    id: value.id, createdAt: value.createdAt, provider: value.provider as Provider,
    model: value.model, source, analysis,
    turns: value.turns as HistoryRecord['turns'],
  }
}

function summary(record: HistoryRecord): HistorySummary {
  return {
    id: record.id, createdAt: record.createdAt, provider: record.provider,
    language: record.source.language, lineCount: record.source.lineCount,
    preview: record.source.lines.find((line) => line.trim())?.trim().slice(0,140) ?? '空代码片段',
    overview: record.analysis.overview.slice(0,180),
  }
}

export class HistoryStore {
  constructor(private readonly directory: string, private readonly codec: HistoryCodec) {}

  private recordPath(id: string): string {
    if (!fileName.test(`${id}.bin`)) throw new Error('历史记录 ID 无效')
    return path.join(this.directory, `${id}.bin`)
  }

  private async write(record: HistoryRecord): Promise<void> {
    await mkdir(this.directory, { recursive: true })
    const temporary = path.join(this.directory, `${record.id}.${randomUUID()}.tmp`)
    try {
      await writeFile(temporary, await this.codec.encode(JSON.stringify(record)), { flag: 'wx' })
      await rename(temporary, this.recordPath(record.id))
    } catch (error) {
      await unlink(temporary).catch(() => {})
      throw error
    }
  }

  async add(provider: Provider, model: string, source: CodeSource, analysis: Analysis): Promise<HistoryRecord> {
    const record: HistoryRecord = {
      id: randomUUID(), createdAt: new Date().toISOString(), provider, model,
      source, analysis, turns: [],
    }
    await this.write(record)
    return record
  }

  async get(id: string): Promise<HistoryRecord> {
    try {
      const record = parseRecord(JSON.parse(await this.codec.decode(await readFile(this.recordPath(id)))))
      if (record.id !== id) throw new Error('历史记录已损坏')
      return record
    } catch { throw new Error('无法读取历史记录') }
  }

  async list(): Promise<HistorySummary[]> {
    await mkdir(this.directory, { recursive: true })
    const names = (await readdir(this.directory)).filter((name) => fileName.test(name))
    const records = await Promise.allSettled(names.map((name) => this.get(name.slice(0, -4))))
    return records.flatMap((result) => result.status === 'fulfilled' ? [summary(result.value)] : [])
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async appendTurn(id: string, sourceId: string, question: string, answer: string): Promise<void> {
    const record = await this.get(id)
    if (record.source.id !== sourceId) throw new Error('历史记录与当前代码不匹配')
    record.turns.push({ question, answer })
    await this.write(record)
  }

  async delete(id: string): Promise<void> {
    await unlink(this.recordPath(id))
  }

  async clear(): Promise<void> {
    await mkdir(this.directory, { recursive: true })
    const names = (await readdir(this.directory)).filter((name) => fileName.test(name))
    await Promise.all(names.map((name) => unlink(path.join(this.directory, name))))
  }
}
