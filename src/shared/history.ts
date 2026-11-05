import type { Provider } from './desktop'
import type { Analysis, CodeSource } from './source'

export interface HistoryTurn { question: string; answer: string }

export interface HistoryRecord {
  id: string
  createdAt: string
  provider: Provider
  model: string
  source: CodeSource
  analysis: Analysis
  turns: HistoryTurn[]
}

export interface HistorySummary {
  id: string
  createdAt: string
  provider: Provider
  language: CodeSource['language']
  lineCount: number
  preview: string
  overview: string
}

export interface AnalysisResult { analysis: Analysis; historyId: string | null }
export interface QuestionResult { answer: string; historySaved: boolean }
