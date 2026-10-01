import { useUI } from './ui'
import { ImportDialog } from '../features/import/ImportDialog'
import { PromptDialog } from '../features/prompt/PromptDialog'

export function Dialogs() {
  const { dialog, close } = useUI()
  if (dialog === 'import') return <ImportDialog onClose={close} />
  if (dialog === 'prompt') return <PromptDialog onClose={close} />
  return null
}
