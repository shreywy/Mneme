import { useUI } from './ui'
import { ImportDialog } from '../features/import/ImportDialog'
import { PromptDialog } from '../features/prompt/PromptDialog'
import { SettingsDialog } from '../features/settings/SettingsDialog'

export function Dialogs() {
  const { dialog, close } = useUI()
  if (dialog === 'import') return <ImportDialog onClose={close} />
  if (dialog === 'prompt') return <PromptDialog onClose={close} />
  if (dialog === 'settings') return <SettingsDialog onClose={close} />
  return null
}
