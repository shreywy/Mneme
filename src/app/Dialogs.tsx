import { useUI } from './ui'
import { ImportDialog } from '../features/import/ImportDialog'
import { PromptDialog } from '../features/prompt/PromptDialog'
import { DriveImport } from '../features/import/DriveImport'
import { FeedbackDialog } from '../features/feedback/FeedbackDialog'

export function Dialogs() {
  const { dialog, close, drivePage } = useUI()
  if (dialog === 'import') return <ImportDialog onClose={close} />
  if (dialog === 'drive') return <DriveImport onClose={close} page={drivePage} />
  if (dialog === 'prompt') return <PromptDialog onClose={close} />
  if (dialog === 'feedback') return <FeedbackDialog onClose={close} />
  return null
}
