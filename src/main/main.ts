import { app, BrowserWindow, clipboard, desktopCapturer, globalShortcut, ipcMain,
  safeStorage, screen } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { analyzeCode, askFollowup, extractCodeFromImage, type AiConfig } from './ai'
import { HistoryStore } from './history'
import { defaultModels, type DesktopSettings, type Provider } from '../shared/desktop'
import type { CodeSource, Depth } from '../shared/source'

let mainWindow: BrowserWindow | null = null
let bubbleWindow: BrowserWindow | null = null
let captureWindow: BrowserWindow | null = null
let historyStore: HistoryStore
let quitting = false
let provider: Provider = 'openai'
const models = { ...defaultModels }
const shortcuts = { open: false, capture: false }
const html = path.join(__dirname, '../renderer/index.html')
const preload = path.join(__dirname, 'preload.cjs')

function lockWindow(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
}

function createWindow(query = ''): BrowserWindow {
  const bubble = query === 'bubble'
  const window = new BrowserWindow({
    width: bubble ? 64 : 1040, height: bubble ? 64 : 680,
    minWidth: bubble ? 64 : 720, minHeight: bubble ? 64 : 480,
    frame: false, transparent: bubble, backgroundColor: bubble ? '#00000000' : '#101719',
    alwaysOnTop: true, skipTaskbar: bubble, show: false, resizable: !bubble,
    webPreferences: { preload, nodeIntegration: false, contextIsolation: true,
      sandbox: true, webSecurity: true },
  })
  lockWindow(window)
  void window.loadFile(html, query ? { query: { view: query } } : undefined)
  return window
}

function bubbleBounds(): Electron.Rectangle {
  const work = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
  return { x: work.x + work.width - 72, y: work.y + Math.round(work.height / 3), width: 64, height: 64 }
}

function showMain(): void {
  bubbleWindow?.hide()
  mainWindow?.show()
  mainWindow?.focus()
}

function collapse(): void {
  mainWindow?.hide()
  bubbleWindow?.show()
}

async function settings(): Promise<DesktopSettings> {
  const hasKey = async (selected: Provider) => {
    try { await readFile(keyPath(selected)); return true } catch { return false }
  }
  return { provider, providers: {
    openai: { hasApiKey: await hasKey('openai'), model: models.openai },
    deepseek: { hasApiKey: await hasKey('deepseek'), model: models.deepseek },
  }, shortcuts }
}

function validProvider(value: unknown): value is Provider {
  return value === 'openai' || value === 'deepseek'
}

function keyPath(selected: Provider): string {
  return path.join(app.getPath('userData'), selected === 'openai' ? 'api-key.bin' : 'deepseek-key.bin')
}
function modelPath(selected: Provider): string {
  return path.join(app.getPath('userData'), selected === 'openai' ? 'model.txt' : 'deepseek-model.txt')
}
function providerPath(): string { return path.join(app.getPath('userData'), 'provider.txt') }

async function getKey(selected: Provider): Promise<string> {
  try {
    const decrypted = await safeStorage.decryptStringAsync(await readFile(keyPath(selected)))
    if (decrypted.shouldReEncrypt) {
      await writeFile(keyPath(selected), await safeStorage.encryptStringAsync(decrypted.result))
    }
    return decrypted.result
  }
  catch { throw new Error(`请先在设置中保存 ${selected === 'openai' ? 'OpenAI' : 'DeepSeek'} API 密钥`) }
}

async function aiConfig(): Promise<AiConfig> {
  const selected = provider
  return { provider: selected, key: await getKey(selected), model: models[selected] }
}

function validSource(value: unknown): value is CodeSource {
  if (typeof value !== 'object' || value === null) return false
  const source = value as CodeSource
  if (typeof source.text !== 'string') return false
  const lines = source.text.split(/\r\n|\n|\r/)
  return typeof source.id === 'string' && source.id.length > 0 &&
    source.text.length <= 30_000 && Array.isArray(source.lines) &&
    source.lines.length === lines.length && source.lines.every((line, index) => line === lines[index]) &&
    source.lineCount === lines.length && source.lineNumberKind === 'snippet' &&
    ['auto', 'c', 'cpp', 'python', 'stm32'].includes(source.language)
}

function requireMain(event: Electron.IpcMainInvokeEvent): void {
  if (event.sender !== mainWindow?.webContents) throw new Error('无权调用该操作')
}

function registerIpc(): void {
  ipcMain.handle('settings:get', async (event) => { requireMain(event); return settings() })
  ipcMain.handle('settings:provider', async (event, selected: unknown) => {
    requireMain(event)
    if (!validProvider(selected)) throw new Error('AI 服务商无效')
    await writeFile(providerPath(), selected, 'utf8')
    provider = selected
  })
  ipcMain.handle('settings:key', async (event, selected: unknown, key: unknown) => {
    requireMain(event)
    if (!validProvider(selected)) throw new Error('AI 服务商无效')
    if (typeof key !== 'string' || key.length > 300 || !key.trim()) throw new Error('API 密钥不能为空')
    if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('当前系统无法安全保存 API 密钥')
    await writeFile(keyPath(selected), await safeStorage.encryptStringAsync(key.trim()))
  })
  ipcMain.handle('settings:model', async (event, selected: unknown, value: unknown) => {
    requireMain(event)
    if (!validProvider(selected)) throw new Error('AI 服务商无效')
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_.-]{2,80}$/.test(value)) throw new Error('模型名称无效')
    await writeFile(modelPath(selected), value, 'utf8')
    models[selected] = value
  })
  ipcMain.handle('clipboard:read', (event) => { requireMain(event); return clipboard.readText() })
  ipcMain.handle('ai:analyze', async (event, source: unknown, depth: Depth) => {
    requireMain(event)
    if (!validSource(source) || !['beginner', 'deep'].includes(depth)) throw new Error('代码输入无效')
    const config = await aiConfig()
    const analysis = await analyzeCode(config, source, depth)
    let historyId: string | null = null
    try { historyId = (await historyStore.add(config.provider, config.model, source, analysis)).id }
    catch (error) { console.error('Failed to save analysis history', error) }
    return { analysis, historyId }
  })
  ipcMain.handle('ai:extract', async (event, image: unknown) => {
    requireMain(event)
    if (typeof image !== 'string' || image.length > 20_000_000) throw new Error('图片无效或过大')
    return extractCodeFromImage(await aiConfig(), image)
  })
  ipcMain.handle('ai:ask', async (event, source: unknown, question: unknown, history: unknown, historyId: unknown) => {
    requireMain(event)
    if (!validSource(source) || typeof question !== 'string' || !question.trim() || question.length > 2000 ||
        (historyId !== null && typeof historyId !== 'string') ||
        !Array.isArray(history) || history.length > 20 || history.some((item) =>
          typeof item?.question !== 'string' || typeof item?.answer !== 'string')) throw new Error('提问无效')
    const answer = await askFollowup(await aiConfig(), source, question, history)
    let historySaved = false
    if (historyId) {
      try { await historyStore.appendTurn(historyId, source.id, question, answer); historySaved = true }
      catch (error) { console.error('Failed to save follow-up history', error) }
    }
    return { answer, historySaved }
  })
  ipcMain.handle('history:list', (event) => { requireMain(event); return historyStore.list() })
  ipcMain.handle('history:get', (event, id: unknown) => {
    requireMain(event)
    if (typeof id !== 'string') throw new Error('历史记录 ID 无效')
    return historyStore.get(id)
  })
  ipcMain.handle('history:delete', (event, id: unknown) => {
    requireMain(event)
    if (typeof id !== 'string') throw new Error('历史记录 ID 无效')
    return historyStore.delete(id)
  })
  ipcMain.handle('history:clear', (event) => { requireMain(event); return historyStore.clear() })
  ipcMain.handle('window:collapse', (event) => { requireMain(event); collapse() })
  ipcMain.handle('window:expand', (event) => {
    if (event.sender !== bubbleWindow?.webContents) throw new Error('无权调用该操作')
    showMain()
  })
  ipcMain.handle('window:quit', (event) => { requireMain(event); quitting = true; app.quit() })
  ipcMain.handle('capture:start', async (event) => { requireMain(event); await startCapture() })
  ipcMain.handle('capture:done', (event, image: unknown) => {
    if (event.sender !== captureWindow?.webContents) throw new Error('无权完成截图')
    if (typeof image !== 'string' || image.length > 20_000_000 ||
        !image.startsWith('data:image/png;base64,')) throw new Error('截图无效或过大')
    finishCapture()
    mainWindow?.webContents.send('capture:image', image)
  })
  ipcMain.handle('capture:cancel', (event) => {
    if (event.sender !== captureWindow?.webContents) throw new Error('无权取消截图')
    finishCapture()
  })
}

function finishCapture(): void {
  captureWindow?.close()
  captureWindow = null
  showMain()
}

async function startCapture(): Promise<void> {
  if (captureWindow) return
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  mainWindow?.hide()
  bubbleWindow?.hide()
  try {
    await new Promise((resolve) => setTimeout(resolve, 180))
    const sources = await desktopCapturer.getSources({ types: ['screen'],
      thumbnailSize: { width: Math.round(display.bounds.width * display.scaleFactor),
        height: Math.round(display.bounds.height * display.scaleFactor) } })
    const source = sources.find((item) => item.display_id === String(display.id))
    if (!source || source.thumbnail.isEmpty()) throw new Error('无法获取屏幕画面')
    const image = source.thumbnail.toDataURL()
    captureWindow = new BrowserWindow({
      x: display.bounds.x, y: display.bounds.y, width: display.bounds.width,
      height: display.bounds.height, frame: false, transparent: false,
      alwaysOnTop: true, skipTaskbar: true, backgroundColor: '#000000',
      webPreferences: { preload, nodeIntegration: false, contextIsolation: true,
        sandbox: true, webSecurity: true },
    })
    lockWindow(captureWindow)
    captureWindow.on('closed', () => {
      captureWindow = null
      showMain()
    })
    captureWindow.webContents.once('did-finish-load', () => captureWindow?.webContents.send('capture:init', image))
    await captureWindow.loadFile(html, { query: { view: 'capture' } })
  } catch (error) {
    finishCapture()
    throw error
  }
}

app.whenReady().then(async () => {
  historyStore = new HistoryStore(path.join(app.getPath('userData'), 'history'), {
    encode: (text) => safeStorage.encryptStringAsync(text),
    decode: async (data) => (await safeStorage.decryptStringAsync(data)).result,
  })
  for (const selected of ['openai', 'deepseek'] as const) {
    try { models[selected] = (await readFile(modelPath(selected), 'utf8')).trim() || models[selected] }
    catch { /* default model */ }
  }
  try {
    const saved = (await readFile(providerPath(), 'utf8')).trim()
    if (validProvider(saved)) provider = saved
  } catch { /* OpenAI remains the default for existing installations */ }
  mainWindow = createWindow()
  mainWindow.on('close', (event) => { if (!quitting) { event.preventDefault(); collapse() } })
  mainWindow.once('ready-to-show', showMain)
  bubbleWindow = createWindow('bubble')
  bubbleWindow.setBounds(bubbleBounds())
  bubbleWindow.on('moved', () => {
    if (!bubbleWindow || !bubbleWindow.isVisible()) return
    const b = bubbleWindow.getBounds()
    const w = screen.getDisplayMatching(b).workArea
    const x = b.x + b.width / 2 < w.x + w.width / 2 ? w.x + 8 : w.x + w.width - b.width - 8
    const y = Math.max(w.y + 8, Math.min(b.y, w.y + w.height - b.height - 8))
    if (x !== b.x || y !== b.y) bubbleWindow.setBounds({ ...b, x, y })
  })
  registerIpc()
  shortcuts.open = globalShortcut.register('Control+Alt+E', async () => {
    showMain()
    const code = await clipboard.readText()
    if (code.trim()) mainWindow?.webContents.send('clipboard:code', code)
  })
  shortcuts.capture = globalShortcut.register('Control+Alt+S', () => { void startCapture().catch(() => showMain()) })
})

app.on('will-quit', () => globalShortcut.unregisterAll())
