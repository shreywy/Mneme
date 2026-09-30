import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/newsreader/400.css'
import '@fontsource/newsreader/500.css'
import '@fontsource/newsreader/400-italic.css'
import '@fontsource/hanken-grotesk/400.css'
import '@fontsource/hanken-grotesk/500.css'
import '@fontsource/hanken-grotesk/600.css'
import 'katex/dist/katex.min.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './styles/study.css'
import { applySettings, useSettings } from './settings/store'
import { App } from './app/App'

applySettings(useSettings.getState())
useSettings.subscribe(applySettings)
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applySettings(useSettings.getState()))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
