import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { CaptureView } from './CaptureView'
import './styles.css'

const view = new URLSearchParams(location.search).get('view')
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{view === 'capture' ? <CaptureView /> : <App bubble={view === 'bubble'} />}</React.StrictMode>,
)
