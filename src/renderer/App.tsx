import { useEffect, useMemo, useRef, useState } from 'react'
import { defaultModels, languages, type Provider } from '../shared/desktop'
import type { HistorySummary, HistoryTurn } from '../shared/history'
import { createSource, type Analysis, type CodeSource, type Depth, type Language } from '../shared/source'
import { KeywordDialog } from './KeywordDialog'

async function readImage(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('只支持 PNG、JPEG 或 WebP 图片')
  if (file.size > 12_000_000) throw new Error('图片不能超过 12 MB')
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

function message(error: unknown): string { return error instanceof Error ? error.message : String(error) }

function centerInPane(pane: HTMLElement | null, target: HTMLElement | undefined): void {
  if (!pane || !target) return
  const paneRect = pane.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  pane.scrollTo({
    top: pane.scrollTop + targetRect.top - paneRect.top - (pane.clientHeight - targetRect.height) / 2,
    left: pane.scrollLeft,
    behavior: 'smooth',
  })
}

export function App({ bubble }: { bubble: boolean }) {
  const [text, setText] = useState('')
  const [language, setLanguage] = useState<Language>('auto')
  const [depth, setDepth] = useState<Depth>('beginner')
  const [source, setSource] = useState<CodeSource | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [selectedLine, setSelectedLine] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [image, setImage] = useState('')
  const [uncertain, setUncertain] = useState('')
  const [busy, setBusy] = useState<'analysis' | 'extract' | 'ask' | null>(null)
  const [error, setError] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [keywordOpen, setKeywordOpen] = useState(false)
  const [provider, setProvider] = useState<Provider>('openai')
  const [settingsProvider, setSettingsProvider] = useState<Provider>('openai')
  const [hasKeys, setHasKeys] = useState<Record<Provider, boolean>>({ openai: false, deepseek: false })
  const [key, setKey] = useState('')
  const [models, setModels] = useState({ ...defaultModels })
  const [draftModel, setDraftModel] = useState(defaultModels.openai)
  const [shortcutReady, setShortcutReady] = useState(true)
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<HistoryTurn[]>([])
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyItems, setHistoryItems] = useState<HistorySummary[]>([])
  const [historyQuery, setHistoryQuery] = useState('')
  const [historyBusy, setHistoryBusy] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const codeScrollRef = useRef<HTMLDivElement>(null)
  const explainScrollRef = useRef<HTMLDivElement>(null)
  const codeLineRefs = useRef(new Map<number, HTMLButtonElement>())
  const explanationRefs = useRef(new Map<string, HTMLButtonElement>())

  useEffect(() => {
    if (bubble) return
    void window.codelens.settings().then((settings) => {
      setProvider(settings.provider)
      setHasKeys({ openai: settings.providers.openai.hasApiKey,
        deepseek: settings.providers.deepseek.hasApiKey })
      setModels({ openai: settings.providers.openai.model, deepseek: settings.providers.deepseek.model })
      setShortcutReady(settings.shortcuts.open)
    }).catch((cause) => setError(message(cause)))
    const offCode = window.codelens.onClipboard((value) => {
      setText(value); setSource(null); setAnalysis(null); setImage(''); setError('')
      setCurrentHistoryId(null); setTurns([])
    })
    const offImage = window.codelens.onImage((value) => {
      setImage(value); setText(''); setSource(null); setAnalysis(null); setUncertain(''); setError('')
      setCurrentHistoryId(null); setTurns([])
    })
    const paste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith('image/'))
      if (file) { event.preventDefault(); void acceptImage(file) }
    }
    document.addEventListener('paste', paste)
    return () => { offCode(); offImage(); document.removeEventListener('paste', paste) }
  }, [bubble])

  const highlighted = useMemo(() => {
    if (!analysis) return null
    return analysis.explanations.find((item) => item.id === selectedId) ??
      analysis.explanations.find((item) => selectedLine !== null && selectedLine >= item.startLine && selectedLine <= item.endLine) ?? null
  }, [analysis, selectedId, selectedLine])
  const hasKey = hasKeys[provider]
  const providerName = provider === 'openai' ? 'OpenAI' : 'DeepSeek'
  const settingsProviderName = settingsProvider === 'openai' ? 'OpenAI' : 'DeepSeek'

  if (bubble) return <div className="bubble-shell">
    <div className="bubble-handle" aria-label="拖动悬浮图标" />
    <button className="bubble-button" aria-label="展开 CodeLens AI" onClick={() => void window.codelens.expand()}>⌘</button>
  </div>

  async function useClipboard() {
    try {
      const value = await window.codelens.readClipboard()
      if (!value.trim()) throw new Error('剪贴板中没有文字代码')
      setText(value); setImage(''); setSource(null); setAnalysis(null); setError('')
      setCurrentHistoryId(null); setTurns([])
    } catch (cause) { setError(message(cause)) }
  }

  async function analyze() {
    setError('')
    try {
      if (!hasKey) throw new Error(`请先在设置中保存 ${providerName} API 密钥`)
      const next = createSource(text, language)
      setBusy('analysis')
      const result = await window.codelens.analyze(next, depth)
      setSource(next); setAnalysis(result.analysis); setSelectedLine(null); setSelectedId(null)
      setTurns([]); setCurrentHistoryId(result.historyId)
      if (!result.historyId) setError('解析已完成，但历史记录保存失败')
    } catch (cause) { setError(message(cause)) }
    finally { setBusy(null) }
  }

  async function extract() {
    setError('')
    try {
      if (!hasKey) throw new Error(`请先在设置中保存 ${providerName} API 密钥`)
      setBusy('extract')
      const result = await window.codelens.extractImage(image)
      setText(result.code); setUncertain(result.uncertainReason)
    } catch (cause) { setError(message(cause)) }
    finally { setBusy(null) }
  }

  async function ask() {
    if (!source || !question.trim()) return
    setError(''); setBusy('ask')
    try {
      const result = await window.codelens.ask(source, question.trim(), turns.slice(-4), currentHistoryId)
      setTurns([...turns, { question: question.trim(), answer: result.answer }]); setQuestion('')
      if (currentHistoryId && !result.historySaved) setError('回答已生成，但追问未能保存到历史记录')
    } catch (cause) { setError(message(cause)) }
    finally { setBusy(null) }
  }

  async function saveSettings() {
    setError('')
    try {
      if (key.trim()) {
        await window.codelens.setApiKey(settingsProvider, key.trim())
        setHasKeys((previous) => ({ ...previous, [settingsProvider]: true }))
        setKey('')
      }
      await window.codelens.setModel(settingsProvider, draftModel.trim())
      await window.codelens.setProvider(settingsProvider)
      setModels((previous) => ({ ...previous, [settingsProvider]: draftModel.trim() }))
      setProvider(settingsProvider)
      setSettingsOpen(false)
    } catch (cause) { setError(message(cause)) }
  }

  async function acceptImage(file: File) {
    try {
      setImage(await readImage(file)); setText(''); setSource(null); setAnalysis(null); setUncertain(''); setError('')
      setCurrentHistoryId(null); setTurns([])
    } catch (cause) { setError(message(cause)) }
  }

  async function openHistory() {
    setHistoryOpen(true); setHistoryBusy(true); setConfirmClear(false); setError('')
    try { setHistoryItems(await window.codelens.listHistory()) }
    catch (cause) { setError(message(cause)) }
    finally { setHistoryBusy(false) }
  }

  async function restoreHistory(id: string) {
    setHistoryBusy(true); setError('')
    try {
      const record = await window.codelens.getHistory(id)
      setText(record.source.text); setSource(record.source); setAnalysis(record.analysis)
      setLanguage(record.source.language); setTurns(record.turns); setCurrentHistoryId(record.id)
      setImage(''); setUncertain(''); setQuestion(''); setSelectedLine(null); setSelectedId(null)
      setHistoryOpen(false)
    } catch (cause) { setError(message(cause)) }
    finally { setHistoryBusy(false) }
  }

  async function deleteHistory(id: string) {
    setHistoryBusy(true); setError('')
    try {
      await window.codelens.deleteHistory(id)
      setHistoryItems((items) => items.filter((item) => item.id !== id))
      if (currentHistoryId === id) setCurrentHistoryId(null)
    } catch (cause) { setError(message(cause)) }
    finally { setHistoryBusy(false) }
  }

  async function clearHistory() {
    setHistoryBusy(true); setError('')
    try {
      await window.codelens.clearHistory()
      setHistoryItems([]); setCurrentHistoryId(null); setConfirmClear(false)
    } catch (cause) { setError(message(cause)) }
    finally { setHistoryBusy(false) }
  }

  const visibleHistory = historyItems.filter((item) =>
    `${item.preview} ${item.overview} ${item.language} ${item.provider}`.toLowerCase()
      .includes(historyQuery.trim().toLowerCase()))

  function selectCodeLine(number: number) {
    const match = analysis?.explanations.find((item) => number >= item.startLine && number <= item.endLine)
    setSelectedLine(number)
    setSelectedId(match?.id ?? null)
    if (match) centerInPane(explainScrollRef.current, explanationRefs.current.get(match.id))
  }

  function selectExplanation(item: Analysis['explanations'][number]) {
    setSelectedId(item.id)
    setSelectedLine(null)
    const middleLine = Math.floor((item.startLine + item.endLine) / 2)
    centerInPane(codeScrollRef.current, codeLineRefs.current.get(middleLine))
  }

  return <div className="app-shell" onDragOver={(event) => event.preventDefault()}
    onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void acceptImage(file) }}>
    <header className="titlebar">
      <div className="brand"><span className="brand-mark">⌘</span><span><strong>CodeLens AI</strong><small>代码解析助手</small></span></div>
      <div className="title-drag" />
      <span className="state-pill">{hasKey ? `● ${providerName} 已就绪` : `○ ${providerName} 未配置`}</span>
      <button className="title-button" aria-label="设置" title="设置" onClick={() => {
        setSettingsProvider(provider); setDraftModel(models[provider]); setKey(''); setSettingsOpen(true)
      }}>⚙</button>
      <button className="title-button" aria-label="收起为悬浮图标" title="收起为悬浮图标" onClick={() => void window.codelens.collapse()}>—</button>
      <button className="title-button close" aria-label="退出" title="退出" onClick={() => void window.codelens.quit()}>×</button>
    </header>

    <div className="workspace-heading">
      <div><span className="eyebrow">WORKSPACE / 01</span><h1>看懂每一行代码</h1><p>复制代码或截取屏幕区域，获取与原文对应的中文解释。</p></div>
      <div className="shortcut-note">快捷键 <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>E</kbd> {!shortcutReady && <em>快捷键被占用</em>}</div>
    </div>

    <div className="toolbar">
      <div className="toolbar-group">
        <button className="action primary" onClick={() => void useClipboard()}>粘贴剪贴板代码</button>
        <button className="action" onClick={() => void window.codelens.startCapture().catch((cause) => setError(message(cause)))}>截取屏幕</button>
        <label className="action file-action">导入图片<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void acceptImage(file); event.target.value = '' }} /></label>
        <button className="action" disabled={!!busy} onClick={() => void openHistory()}>历史记录</button>
        <button className="action" onClick={() => setKeywordOpen(true)}>关键词翻译</button>
      </div>
      <div className="toolbar-group selectors">
        <label>语言 <select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>{languages.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label>解析 <select value={depth} onChange={(event) => setDepth(event.target.value as Depth)}><option value="beginner">初学者</option><option value="deep">深入解析</option></select></label>
      </div>
    </div>

    {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="关闭错误提示">×</button></div>}

    <main className="panes">
      <section className="pane code-pane" aria-label="原始代码">
        <div className="pane-header"><div><span className="pane-index">01</span><h2>原始代码</h2></div><span className="pane-meta">{source ? `${source.lineCount} 行 · 片段行号` : '保持原文不变'}</span></div>
        {image && !source && <div className="image-preview"><img src={image} alt="待转写的代码截图" /><div><span>图片已就绪</span><button onClick={() => void extract()} disabled={!!busy}>{busy === 'extract' ? '正在转写…' : '识别图片代码'}</button></div></div>}
        {uncertain && !source && <div className="notice">识别提示：{uncertain}。请检查下方代码后再解析。</div>}
        {source ? <div className="code-lines" role="list" aria-label="代码片段行号" ref={codeScrollRef}>
          {source.lines.map((line, index) => {
            const number = index + 1
            const active = (highlighted && number >= highlighted.startLine && number <= highlighted.endLine) || selectedLine === number
            return <button type="button" role="listitem" className={`code-line ${active ? 'is-highlighted' : ''}`} key={number}
              ref={(node) => { if (node) codeLineRefs.current.set(number, node); else codeLineRefs.current.delete(number) }}
              onClick={() => selectCodeLine(number)} aria-label={`第 ${number} 行：${line || '空行'}`}>
              <span className="line-number">{number}</span><code>{line || ' '}</code>
            </button>
          })}
        </div> : <div className="editor-wrap"><span className="editor-caption">粘贴或输入代码 · 行号从片段第 1 行开始</span><textarea value={text} onChange={(event) => setText(event.target.value)} spellCheck={false} placeholder={'在这里粘贴代码…\n\n或使用上方按钮读取剪贴板。'} aria-label="待解析的代码" /></div>}
        <div className="pane-footer">{source ? <button className="text-button" onClick={() => { setSource(null); setAnalysis(null); setCurrentHistoryId(null); setTurns([]) }}>编辑代码</button> : <><span>支持 C、C++、Python 与 STM32</span><button className="action primary" disabled={!!busy || !text.trim()} onClick={() => void analyze()}>{busy === 'analysis' ? '正在解析…' : '开始解析 →'}</button></>}</div>
      </section>

      <section className="pane explain-pane" aria-label="中文解释">
        <div className="pane-header"><div><span className="pane-index">02</span><h2>中文解释</h2></div><span className="pane-meta">{analysis ? `${analysis.explanations.length} 个行段` : '等待解析'}</span></div>
        {!analysis ? <div className="empty-state"><div className="empty-glyph">{busy ? '◌' : '⌁'}</div><h3>{busy ? '正在阅读代码' : '解释会显示在这里'}</h3><p>{busy ? '分析行段、函数用途和执行流程…' : '左侧保留原代码；完成解析后，点击代码行或解释卡片可双向定位。'}</p></div> :
          <div className="explanation-scroll" ref={explainScrollRef}>
            <div className="overview"><span className="section-label">整体概览</span><p>{analysis.overview}</p><span className="section-label">执行流程</span><p>{analysis.flow}</p></div>
            <div className="section-heading">逐段解释 <span>点击卡片或代码行双向定位</span></div>
            {selectedLine !== null && !highlighted && <div className="notice" role="status">第 {selectedLine} 行暂无对应解释，请选择其他代码行。</div>}
            {analysis.explanations.length === 0 && <div className="notice">模型没有给出可核对的行段解释，请缩小代码片段后重试。</div>}
            {analysis.explanations.map((item) => <button type="button" className={`explanation ${highlighted?.id === item.id ? 'active' : ''}`} key={item.id}
              ref={(node) => { if (node) explanationRefs.current.set(item.id, node); else explanationRefs.current.delete(item.id) }}
              onClick={() => selectExplanation(item)}>
              <span className="range">L{item.startLine}{item.endLine !== item.startLine ? `–${item.endLine}` : ''}</span>
              <strong>{item.summary}</strong><span className="detail">{item.detail}</span>
            </button>)}
            <div className="conversation"><span className="section-label">继续提问</span>
              {turns.map((turn, index) => <div className="turn" key={index}><b>你：{turn.question}</b><p>{turn.answer}</p></div>)}
              <form onSubmit={(event) => { event.preventDefault(); void ask() }}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="例如：这个函数为什么会进入中断？" aria-label="继续提问" /><button disabled={!!busy || !question.trim()}>{busy === 'ask' ? '…' : '发送'}</button></form>
            </div>
          </div>}
      </section>
    </main>

    <footer className="statusbar"><span>本地片段行号 · 解析历史加密保存在本机</span><span>截图原图不会写入历史记录</span></footer>

    {keywordOpen && <KeywordDialog language={language} onClose={() => setKeywordOpen(false)} />}

    {historyOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setHistoryOpen(false) }}>
      <div className="history-dialog" role="dialog" aria-modal="true" aria-labelledby="history-title">
        <div className="modal-top"><div><span className="eyebrow">LIBRARY</span><h2 id="history-title">历史记录</h2></div><button aria-label="关闭历史记录" onClick={() => setHistoryOpen(false)}>×</button></div>
        <p className="history-intro">成功解析的代码、中文解释和追问加密保存在本机；截图原图不保存。</p>
        <input className="history-search" value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="搜索代码或解释…" aria-label="搜索历史记录" />
        {error && <div className="notice" role="alert">{error}</div>}
        <div className="history-list">
          {historyBusy && historyItems.length === 0 ? <div className="history-empty">正在读取历史记录…</div> :
            visibleHistory.length === 0 ? <div className="history-empty">{historyItems.length ? '没有匹配的记录' : '还没有解析记录'}</div> :
              visibleHistory.map((item) => <div className="history-row" key={item.id}>
                <button className="history-open" disabled={historyBusy} onClick={() => void restoreHistory(item.id)}>
                  <span className="history-meta">{new Date(item.createdAt).toLocaleString('zh-CN')} · {item.provider === 'openai' ? 'OpenAI' : 'DeepSeek'} · {item.lineCount} 行</span>
                  <code>{item.preview}</code><span className="history-overview">{item.overview || '无整体概览'}</span>
                </button>
                <button className="history-delete" disabled={historyBusy} aria-label={`删除记录：${item.preview}`} onClick={() => void deleteHistory(item.id)}>删除</button>
              </div>)}
        </div>
        <div className="history-actions">
          {historyItems.length > 0 && (confirmClear ? <><span>确定删除全部历史记录？</span><button className="danger" disabled={historyBusy} onClick={() => void clearHistory()}>确认清空</button><button onClick={() => setConfirmClear(false)}>取消</button></> :
            <button className="danger" disabled={historyBusy} onClick={() => setConfirmClear(true)}>清空全部</button>)}
          <button className="action" onClick={() => setHistoryOpen(false)}>关闭</button>
        </div>
      </div>
    </div>}

    {settingsOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false) }}>
      <div className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="modal-top"><div><span className="eyebrow">PREFERENCES</span><h2 id="settings-title">AI 设置</h2></div><button aria-label="关闭设置" onClick={() => setSettingsOpen(false)}>×</button></div>
        <p>密钥分别加密保存在本机。代码和截图会发送到当前选择的 AI 服务商。</p>
        {error && <div className="notice" role="alert">{error}</div>}
        <label>AI 服务商<select value={settingsProvider} onChange={(event) => {
          const next = event.target.value as Provider
          setSettingsProvider(next); setDraftModel(models[next]); setKey('')
        }}><option value="openai">OpenAI</option><option value="deepseek">DeepSeek</option></select></label>
        <label>{settingsProviderName} API 密钥<input type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder={hasKeys[settingsProvider] ? '已保存；留空表示不修改' : '输入 API 密钥'} autoComplete="off" /></label>
        <label>模型<input value={draftModel} onChange={(event) => setDraftModel(event.target.value)} placeholder={defaultModels[settingsProvider]} /></label>
        {settingsProvider === 'deepseek' && <div className="notice">推荐使用 deepseek-flash，支持截图识别；其他模型可能不支持图片输入。</div>}
        <div className="modal-actions"><button className="action" onClick={() => setSettingsOpen(false)}>取消</button><button className="action primary" onClick={() => void saveSettings()}>保存设置</button></div>
      </div>
    </div>}
  </div>
}
