import { useEffect, useState } from 'react'
import type { KeywordRecord, KeywordTranslation } from '../shared/keyword'
import type { Language } from '../shared/source'

function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error) }

export function KeywordDialog({ language, onClose }: { language: Language; onClose: () => void }) {
  const [term, setTerm] = useState('')
  const [result, setResult] = useState<KeywordTranslation | null>(null)
  const [resultTerm, setResultTerm] = useState('')
  const [items, setItems] = useState<KeywordRecord[]>([])
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    void window.codelens.listKeywords().then(setItems).catch((cause) => setError(errorText(cause)))
  }, [])

  async function translate() {
    if (!term.trim() || busy) return
    setBusy(true); setError(''); setResult(null)
    try {
      const response = await window.codelens.translateKeyword(term.trim(), language)
      setResult(response.translation); setResultTerm(term.trim())
      if (response.historySaved) setItems(await window.codelens.listKeywords())
      else setError('翻译已完成，但历史记录保存失败')
    } catch (cause) { setError(errorText(cause)) }
    finally { setBusy(false) }
  }

  async function remove(id: string) {
    setBusy(true); setError('')
    try { await window.codelens.deleteKeyword(id); setItems((old) => old.filter((item) => item.id !== id)) }
    catch (cause) { setError(errorText(cause)) }
    finally { setBusy(false) }
  }

  async function clear() {
    setBusy(true); setError('')
    try { await window.codelens.clearKeywords(); setItems([]); setConfirmClear(false) }
    catch (cause) { setError(errorText(cause)) }
    finally { setBusy(false) }
  }

  const shown = items.filter((item) =>
    `${item.term} ${item.translation} ${item.explanation}`.toLowerCase().includes(search.trim().toLowerCase()))

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="history-dialog keyword-dialog" role="dialog" aria-modal="true" aria-labelledby="keyword-title">
      <div className="modal-top"><div><span className="eyebrow">GLOSSARY</span><h2 id="keyword-title">关键词翻译</h2></div><button aria-label="关闭关键词翻译" onClick={onClose}>×</button></div>
      <p className="history-intro">输入看不懂的编程关键词，获取中文译名、用途和简短示例。查询会发送给当前 AI 服务商。</p>
      <form className="keyword-form" onSubmit={(event) => { event.preventDefault(); void translate() }}>
        <input autoFocus maxLength={120} disabled={busy} value={term} onChange={(event) => { setTerm(event.target.value); setResult(null) }} placeholder="例如：volatile、pointer、async" aria-label="待翻译关键词" />
        <button className="action primary" disabled={busy || !term.trim()}>{busy ? '翻译中…' : '翻译'}</button>
      </form>
      {error && <div className="notice" role="alert">{error}</div>}
      {result && <div className="keyword-result" aria-live="polite"><strong>{resultTerm} → {result.translation}</strong><p>{result.explanation}</p><pre>{result.example}</pre></div>}
      <div className="section-heading keyword-heading">查询历史 <span>加密保存在本机</span></div>
      <input className="history-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索关键词或中文解释…" aria-label="搜索关键词历史" />
      <div className="history-list">
        {shown.length === 0 ? <div className="history-empty">{items.length ? '没有匹配的记录' : '还没有翻译记录'}</div> :
          shown.map((item) => <div className="history-row" key={item.id}>
            <button className="history-open" disabled={busy} onClick={() => { setTerm(item.term); setResultTerm(item.term); setResult(item) }}>
              <span className="history-meta">{new Date(item.createdAt).toLocaleString('zh-CN')} · {item.provider === 'openai' ? 'OpenAI' : 'DeepSeek'}</span>
              <code>{item.term} → {item.translation}</code><span className="history-overview">{item.explanation}</span>
            </button>
            <button className="history-delete" disabled={busy} aria-label={`删除关键词记录：${item.term}`} onClick={() => void remove(item.id)}>删除</button>
          </div>)}
      </div>
      <div className="history-actions">
        {items.length > 0 && (confirmClear ? <><span>确定删除全部关键词记录？</span><button className="danger" disabled={busy} onClick={() => void clear()}>确认清空</button><button onClick={() => setConfirmClear(false)}>取消</button></> :
          <button className="danger" disabled={busy} onClick={() => setConfirmClear(true)}>清空全部</button>)}
        <button className="action" onClick={onClose}>关闭</button>
      </div>
    </div>
  </div>
}
