import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { HistoryCodec } from './history'
import type { Provider } from '../shared/desktop'
import type { KeywordRecord, KeywordTranslation } from '../shared/keyword'
import type { Language } from '../shared/source'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function validRecord(value: unknown): value is KeywordRecord {
  if (typeof value !== 'object' || value === null) return false
  const item = value as KeywordRecord
  return typeof item.id === 'string' && uuid.test(item.id) &&
    typeof item.createdAt === 'string' && !Number.isNaN(Date.parse(item.createdAt)) &&
    ['openai', 'deepseek'].includes(item.provider) && typeof item.model === 'string' &&
    ['auto', 'c', 'cpp', 'python', 'stm32'].includes(item.language) &&
    typeof item.term === 'string' && item.term.length > 0 && item.term.length <= 120 &&
    ['translation', 'explanation', 'example'].every((key) => typeof item[key as keyof KeywordRecord] === 'string')
}

export class KeywordHistoryStore {
  constructor(private readonly directory: string, private readonly codec: HistoryCodec) {}

  private recordPath(id: string): string {
    if (!uuid.test(id)) throw new Error('关键词记录 ID 无效')
    return path.join(this.directory, `${id}.bin`)
  }

  async add(provider: Provider, model: string, language: Language, term: string,
    translation: KeywordTranslation): Promise<KeywordRecord> {
    await mkdir(this.directory, { recursive: true })
    const record: KeywordRecord = { id: randomUUID(), createdAt: new Date().toISOString(),
      provider, model, language, term, ...translation }
    const temporary = path.join(this.directory, `${record.id}.${randomUUID()}.tmp`)
    try {
      await writeFile(temporary, await this.codec.encode(JSON.stringify(record)), { flag: 'wx' })
      await rename(temporary, this.recordPath(record.id))
    } catch (error) {
      await unlink(temporary).catch(() => {})
      throw error
    }
    return record
  }

  async list(): Promise<KeywordRecord[]> {
    await mkdir(this.directory, { recursive: true })
    const files = (await readdir(this.directory)).filter((name) => uuid.test(name.slice(0, -4)) && name.endsWith('.bin'))
    const results = await Promise.allSettled(files.map(async (name) => {
      const record = JSON.parse(await this.codec.decode(await readFile(this.recordPath(name.slice(0, -4))))) as unknown
      if (!validRecord(record) || `${record.id}.bin` !== name) throw new Error('关键词记录已损坏')
      return record
    }))
    return results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async delete(id: string): Promise<void> { await unlink(this.recordPath(id)) }

  async clear(): Promise<void> {
    await mkdir(this.directory, { recursive: true })
    const files = (await readdir(this.directory)).filter((name) => uuid.test(name.slice(0, -4)) && name.endsWith('.bin'))
    await Promise.all(files.map((name) => unlink(this.recordPath(name.slice(0, -4)))))
  }
}
