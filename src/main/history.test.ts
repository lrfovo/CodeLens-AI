import { mkdtemp, readFile, readdir, rmdir, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createSource, validateAnalysis } from '../shared/source'
import { HistoryStore, type HistoryCodec } from './history'

const codec: HistoryCodec = {
  encode: async (text) => Buffer.from(Buffer.from(text).toString('base64')),
  decode: async (data) => Buffer.from(data.toString(), 'base64').toString(),
}

describe('local history', () => {
  it('persists code, explanation and follow-up, then deletes them', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'codelens-history-'))
    try {
      const store = new HistoryStore(directory, codec)
      const source = createSource('int value = 1;\nreturn value;', 'c')
      const analysis = validateAnalysis(source, { overview: '返回数值', flow: '先赋值再返回', explanations: [
        { startLine: 1, endLine: 2, summary: '两行代码', detail: '声明并返回' },
      ] })
      const saved = await store.add('deepseek', 'deepseek-flash', source, analysis)
      const files = await readdir(directory)
      expect((await readFile(path.join(directory, files[0]))).toString()).not.toContain(source.text)
      expect((await store.list())[0]).toMatchObject({ id: saved.id, provider: 'deepseek', lineCount: 2 })
      await store.appendTurn(saved.id, source.id, '变量是什么？', 'value 是局部变量。')
      expect((await new HistoryStore(directory, codec).get(saved.id)).turns).toEqual([
        { question: '变量是什么？', answer: 'value 是局部变量。' },
      ])
      await store.delete(saved.id)
      expect(await store.list()).toEqual([])
      const second = await store.add('openai', 'gpt-4.1-mini', source, analysis)
      await store.clear()
      expect(await store.list()).toEqual([])
      await expect(store.get(second.id)).rejects.toThrow('无法读取历史记录')
    } finally {
      for (const name of await readdir(directory)) await unlink(path.join(directory, name))
      await rmdir(directory)
    }
  })
})
