import { useAiKey } from '../../ai/key'
import { NO_KEY } from '../../ai/panel'
import { toast } from '../../ui/toasts'

/** An AI action. Without a key it stays visible but muted, and says where to add one. */
export function AiButton({ onClick, className = 'ai', title, disabled, children }: { onClick: () => void; className?: string; title?: string; disabled?: boolean; children: React.ReactNode }) {
  const has = useAiKey((k) => k.has)
  if (!has) {
    return (
      <span className="tipwrap">
        <button className={className} aria-disabled="true" onClick={() => toast(NO_KEY, 'Settings → AI')}>{children}</button>
        <span className="tip">{NO_KEY}</span>
      </span>
    )
  }
  return <button className={className} onClick={onClick} title={title} disabled={disabled}>{children}</button>
}
