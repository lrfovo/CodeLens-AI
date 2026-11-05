import type { DesktopBridge } from '../shared/desktop'

declare global {
  interface Window { codelens: DesktopBridge }
}

export {}
