import type { Provider } from './desktop'
import type { Language } from './source'

export interface KeywordTranslation {
  translation: string
  explanation: string
  example: string
}

export interface KeywordRecord extends KeywordTranslation {
  id: string
  createdAt: string
  provider: Provider
  model: string
  language: Language
  term: string
}

export interface KeywordResult {
  translation: KeywordTranslation
  historySaved: boolean
}
