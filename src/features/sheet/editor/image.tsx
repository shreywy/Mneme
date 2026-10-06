import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Node } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import { NodeViewWrapper, ReactNodeViewRenderer, type Editor, type NodeViewProps } from '@tiptap/react'
import { addImage, forgetLater, imgurReady, localUrl, uploadImage, useUploads } from '../../../data/images'
import { imageFiles, isPicturePath } from '../../../sheets/image'
import { useAccount } from '../../../sync/account'
import { useSettings } from '../../../settings/store'
import { askName, confirmAction } from '../../../ui/confirm'
import { toast } from '../../../ui/toasts'
import { Icon } from '../../../ui/Icons'
import { useSheetUI } from '../store'

/**
 * Signed out with Imgur set up, the first picture asks first: pictures would be hosted on Imgur, where
 * anyone with the exact link can open them. Nothing uploads until that's agreed. Signed in, pictures go to
 * your own private folder and nothing needs agreeing. Returns whether to go ahead.
 */
export async function agreeToImgur(): Promise<boolean> {
  if (!imgurReady() || useSettings.getState().imgurConsent || useAccount.getState().user) return true
  const ok = await confirmAction({
    title: 'Pictures are hosted on Imgur',
    body: 'Mneme doesn’t keep pictures on its own servers. Each one is uploaded to Imgur without an account, and your page keeps the link. The links are long and unlisted, but anyone who has the exact link can open the picture. Deleting a picture from your page deletes it from Imgur too.',
    check: 'I understand that anyone with the link can see my pictures',
    confirm: 'Add picture',
  })
  if (ok) useSettings.getState().set({ imgurConsent: true })
  return ok
}

/** Image nodes for picture files: shrunk, kept on this device, and stored in your account in the background. */
export async function imageNodes(files: File[], sheetId: string): Promise<object[]> {
  const pics = imageFiles(files)
  if (!pics.length) { toast('That isn’t a picture Mneme can use', 'PNG, JPEG, GIF, WebP and AVIF work', 'image'); return [] }
  if (!(await agreeToImgur())) return []
  const out: object[] = []
  for (const f of pics) {
    try {
      const img = await addImage(sheetId, f)
      void uploadImage(img.id)
      out.push({ type: 'image', attrs: { local: img.id, ratio: img.h / img.w } })
    } catch { toast('Couldn’t read that picture', f.name, 'image') }
  }
  return out
}

/** The file picker for Insert → Picture. Resolves to the chosen files (none if cancelled). */
export function pickFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/gif,image/webp,image/avif'
    input.multiple = true
    input.onchange = () => resolve(Array.from(input.files ?? []))
    input.oncancel = () => resolve([])
    input.click()
  })
}

export async function insertImages(editor: Editor, files: File[], sheetId: string) {
  const nodes = await imageNodes(files, sheetId)
  if (nodes.length && !editor.isDestroyed) editor.chain().focus().insertContent(nodes).run()
}

const currentSheet = () => useSheetUI.getState().sheetId ?? ''

function ImageView({ node, updateAttributes, deleteNode, editor, selected }: NodeViewProps) {
  const a = node.attrs as { local: string | null; stored: string | null; src: string | null; hash: string | null; width: number | null; ratio: number; alt: string; caption: string }
  const [url, setUrl] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const status = useUploads((s) => (a.local ? s[a.local] : undefined))
  const consent = useSettings((s) => s.imgurConsent)
  const signedIn = useAccount((s) => !!s.user && !s.secondStep)
  const up = !!(a.src || a.stored)
  const editable = editor.isEditable
  const fig = useRef<HTMLDivElement>(null)
  const [boxW, setBoxW] = useState(0)
  const [ln, setLn] = useState(28)

  // This device's copy if it has one (it's instant), then your stored copy (downloaded once), then the link.
  useEffect(() => {
    let live = true
    if (!a.local) { setUrl(a.src); return }
    void localUrl(a.local, a.stored, currentSheet()).then((u) => { if (live) { setUrl(u ?? a.src); setMissing(!u && !a.src) } })
    return () => { live = false }
  }, [a.local, a.src, a.stored])
  // A picture added offline, signed out, or before agreeing to Imgur goes up as soon as it can.
  const upload = async () => {
    if (!a.local || up) return
    const r = await uploadImage(a.local)
    if (r && !editor.isDestroyed) updateAttributes(r)
  }
  useEffect(() => { if (editable && !up && a.local && (signedIn || consent)) void upload() }, [a.local, up, consent, signedIn, editable]) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = fig.current
    if (!el) return
    const fit = () => { setBoxW(el.offsetWidth); setLn(parseFloat(getComputedStyle(el).getPropertyValue('--ln')) || 28) }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const width = Math.min(a.width ?? boxW, boxW || a.width || 600)
  const imgH = width * (a.ratio || 0.75)

  // Drag the corner to resize. Heights round to whole lines, so the text below stays on the paper's lines.
  const resize = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const startX = e.clientX, startW = width
    const scale = fig.current ? fig.current.getBoundingClientRect().width / (fig.current.offsetWidth || 1) : 1
    const move = (ev: PointerEvent) => updateAttributes({ width: Math.round(Math.max(48, Math.min(boxW, startW + (ev.clientX - startX) / scale))) })
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up) }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }
  const remove = () => { deleteNode(); forgetLater(a.local, a.hash, a.stored) }
  const askImgur = !signedIn && imgurReady() && !consent
  const note = !up && a.local
    ? status === 'uploading' ? 'Uploading…' : status === 'failed' ? 'Upload failed' : status === 'full' ? 'Picture space is full'
      : signedIn ? 'Waiting to upload' : !imgurReady() ? 'On this device only' : !consent ? 'Not uploaded' : 'Waiting to upload'
    : null
  const noteTip = status === 'full' ? 'Each account has 50 MB for pictures. Delete some to make room.'
    : !signedIn && !imgurReady() ? 'Sign in to keep pictures with your account, on all your devices.' : ''

  return (
    <NodeViewWrapper className={`nv nv-img ${selected ? 'is-sel' : ''}`} data-drag-handle="">
      <div ref={fig} className="nv-img-box" contentEditable={false}>
        <div className="nv-img-frame" style={{ width: width || undefined, height: Math.max(ln, Math.ceil(imgH / ln - 0.01) * ln) }}>
          {url && !missing
            ? <img src={url} alt={a.alt} draggable={false} style={{ width: '100%', height: imgH }} onError={() => setMissing(true)} />
            : <div className="nv-img-missing" style={{ height: imgH }}><Icon name="image" size={20} /><span>{up ? 'The picture couldn’t be loaded' : 'This picture is on the device it was added on. It shows here once it’s uploaded.'}</span></div>}
          {editable && <span className="nv-img-resize nv-ui" onPointerDown={resize} title="Drag to resize" aria-hidden="true" />}
          {editable && (
            <div className="nv-img-bar nv-ui">
              {note && (status === 'failed' || askImgur
                ? <button type="button" onClick={async () => { if (await agreeToImgur()) void upload() }}><Icon name="upload" size={13} />{status === 'failed' ? 'Retry upload' : 'Upload'}</button>
                : <span className="nv-img-note" title={noteTip}>{note}</span>)}
              <button type="button" onClick={async () => { const alt = await askName({ title: 'Describe this picture', value: a.alt, confirm: 'Save' }); if (alt !== null) updateAttributes({ alt }) }}><Icon name="edit" size={13} />{a.alt ? 'Alt text' : 'Add alt text'}</button>
              <button type="button" className="danger" onClick={remove} aria-label="Delete picture"><Icon name="trash" size={13} /></button>
            </div>
          )}
        </div>
        {editable
          ? (a.caption || selected) && <input className="nv-img-cap nv-ui" value={a.caption} placeholder="Add a caption" onChange={(e) => updateAttributes({ caption: e.target.value })} style={{ width: width || undefined }} />
          : a.caption && <div className="nv-img-cap" style={{ width: width || undefined }}>{a.caption}</div>}
      </div>
    </NodeViewWrapper>
  )
}

type Ref = { local: string | null; hash: string | null; stored: string | null }
const imagesOf = (doc: PMNode) => {
  const out: Ref[] = []
  doc.descendants((n) => { if (n.type.name === 'image') out.push({ local: n.attrs.local, hash: n.attrs.hash, stored: n.attrs.stored }); return n.isBlock })
  return out
}
const key = (i: Ref) => i.local ?? i.stored ?? i.hash ?? ''

/** A picture on a page (block-level). Only the link and a few settings are stored with the page. */
export const ImageNode = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({
    local: { default: null, parseHTML: (el) => el.getAttribute('data-local') },
    // Path in your private picture folder; only you can open it.
    stored: { default: null, parseHTML: (el) => { const s = el.getAttribute('data-stored'); return isPicturePath(s) ? s : null } },
    src: { default: null, parseHTML: (el) => { const s = el.getAttribute('data-src'); return s && /^https:\/\/i\.imgur\.com\//.test(s) ? s : null } },
    hash: { default: null, rendered: false },
    width: { default: null, parseHTML: (el) => Number(el.getAttribute('data-width')) || null },
    ratio: { default: 0.75, parseHTML: (el) => Number(el.getAttribute('data-ratio')) || 0.75 },
    alt: { default: '', parseHTML: (el) => el.getAttribute('data-alt') ?? '' },
    caption: { default: '', parseHTML: (el) => el.getAttribute('data-caption') ?? '' },
  }),
  parseHTML: () => [{ tag: 'figure[data-image]' }],
  // The Imgur delete code never goes onto the clipboard.
  renderHTML: ({ node }) => ['figure', { 'data-image': '', 'data-local': node.attrs.local ?? '', 'data-stored': node.attrs.stored ?? '', 'data-src': node.attrs.src ?? '', 'data-width': node.attrs.width ?? '', 'data-ratio': node.attrs.ratio, 'data-alt': node.attrs.alt, 'data-caption': node.attrs.caption },
    ['img', { src: node.attrs.src ?? '', alt: node.attrs.alt }]],
  addNodeView() {
    return ReactNodeViewRenderer(ImageView, { stopEvent: ({ event }) => !!(event.target as Element | null)?.closest?.('.nv-ui') })
  },
  addProseMirrorPlugins() {
    // However a picture leaves the text (Backspace, cut, typing over it), it goes for good once it's
    // clear it isn't coming back.
    return [new Plugin({
      key: new PluginKey('imageCleanup'),
      view: () => ({
        update: (view, prev) => {
          if (prev.doc === view.state.doc || !view.editable) return
          const now = new Set(imagesOf(view.state.doc).map(key))
          for (const i of imagesOf(prev.doc)) if (key(i) && !now.has(key(i))) forgetLater(i.local, i.hash, i.stored)
        },
      }),
    })]
  },
})
