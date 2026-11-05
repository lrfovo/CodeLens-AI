import type { Analysis, CodeSource, Depth, ImageExtraction, Language } from './source'

export type Provider = 'openai' | 'deepseek'
export const defaultModels: Record<Provider, string> = {
  openai: 'gpt-4.1-mini', deepseek: 'deepseek-flash',
}

export interface DesktopSettings {
  provider: Provider
  providers: Record<Provider, { hasApiKey: boolean; model: string }>
  shortcuts: { open: boolean; capture: boolean }
}

export interface DesktopBridge {
  settings(): Promise<DesktopSettings>
  setProvider(provider: Provider): Promise<void>
  setApiKey(provider: Provider, key: string): Promise<void>
  setModel(provider: Provider, model: string): Promise<void>
  readClipboard(): Promise<string>
  analyze(source: CodeSource, depth: Depth): Promise<Analysis>
  extractImage(image: string): Promise<ImageExtraction>
  ask(source: CodeSource, question: string, history: { question: string; answer: string }[]): Promise<string>
  startCapture(): Promise<void>
  captureDone(image: string): Promise<void>
  captureCancel(): Promise<void>
  collapse(): Promise<void>
  expand(): Promise<void>
  quit(): Promise<void>
  onClipboard(callback: (text: string) => void): () => void
  onImage(callback: (image: string) => void): () => void
  onCaptureInit(callback: (image: string) => void): () => void
}

export const languages: { value: Language; label: string }[] = [
  { value: 'auto', label: '自动识别' }, { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' }, { value: 'python', label: 'Python' },
  { value: 'stm32', label: 'STM32' },
]
