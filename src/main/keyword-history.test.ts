import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { KeywordHistoryStore } from './keyword-history'
import type { HistoryCodec } from './history'

const codec: HistoryCodec = {
  encode: async (text) => Buffer.from(Buffer.from(text).toString('base64')),
  decode: async (data) => Buffer.from(data.toString(), 'base64').toString(),
}

describe('keyword history', () => {
  it('stores translations separately and restores, deletes, and clears them', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'codelens-keyword-'))
    try {
      const store = new KeywordHistoryStore(directory, codec)
      const entry = await store.add('openai', 'gpt-4.1-mini', 'c', 'volatile', {
        translation: '易变的', explanation: '编译器应重新读取', example: 'volatile int flag;',
      })
      const file = (await readdir(directory))[0]
      expect((await readFile(path.join(directory, file))).toString()).not.toContain('volatile')
      expect((await new KeywordHistoryStore(directory, codec).list())[0]).toMatchObject({
        id: entry.id, term: 'volatile', translation: '易变的',
      })
      await store.delete(entry.id)
      expect(await store.list()).toEqual([])
      await store.add('deepseek', 'deepseek-flash', 'python', 'async', {
        translation: '异步', explanation: '协程声明', example: 'async def run(): pass',
      })
      await store.clear()
      expect(await store.list()).toEqual([])
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
})
