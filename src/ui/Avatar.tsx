import { Icon } from './Icons'
import { avatarUrl, type Avatar as AvatarData } from '../sync/profile'

/** A round profile picture: an uploaded image, an icon on a colour, or an initial on a colour. */
export function Avatar({ avatar, name, size = 26, className = '' }: { avatar?: AvatarData | null; name: string; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.44) } as React.CSSProperties
  const url = avatar ? avatarUrl(avatar) : null
  if (url) return <span className={`avatar img ${className}`} style={style}><img src={url} alt="" /></span>
  const color = avatar && avatar.kind !== 'image' ? avatar.color : undefined
  const tinted = color ? { ...style, background: color, color: '#FBFAF6', borderColor: 'transparent' } : style
  if (avatar?.kind === 'icon') return <span className={`avatar ${className}`} style={tinted}><Icon name={avatar.icon} size={Math.round(size * 0.55)} /></span>
  return <span className={`avatar ${className}`} style={tinted}>{(name.trim()[0] ?? '?').toUpperCase()}</span>
}
