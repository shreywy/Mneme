/** Inline SVG sprite. Render <IconSprite/> once; use <Icon name="…"/> anywhere. */
export function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <symbol id="mark" viewBox="0 0 40 40">
        <g fill="currentColor">
          <rect x="5.2" y="3.6" width="5.8" height="3.2" rx="1.3" />
          <rect x="5.2" y="7.7" width="5.8" height="19.2" />
          <polygon points="11.4,6 16,6 23.4,30.6 22,34.2" />
          <polygon points="21.3,32.4 31,6.6 32.6,6.6 22.7,34.2" />
          <rect x="29.4" y="6" width="8.4" height="1.5" />
          <rect x="31.2" y="6.5" width="4.3" height="26.4" />
          <rect x="28.6" y="32.5" width="9.4" height="1.5" />
        </g>
        <path d="M7.15 8.2V26.5M9.05 8.2V26.5" stroke="var(--pencil-line)" strokeWidth=".55" />
        <path d="M5.2 27.7h5.8l-2.9 6.9z" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M7.3 32.3h1.6l-.8 2.3z" fill="currentColor" />
      </symbol>
      <symbol id="i-lib" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="5" rx="1" /><rect x="4" y="11" width="16" height="9" rx="1" /></symbol>
      <symbol id="i-notes" viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 12h7M9 16h5" /></symbol>
      <symbol id="i-gear" viewBox="-1.5 -1.5 27 27"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></symbol>
      <symbol id="i-folder" viewBox="0 0 24 24"><path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /></symbol>
      <symbol id="i-spark" viewBox="0 0 24 24"><path d="M12 4v4M12 16v4M4 12h4M16 12h4M7 7l2 2M15 15l2 2M7 17l2-2M15 9l2-2" /></symbol>
      <symbol id="i-loop" viewBox="0 0 24 24"><path d="M17 2l3 3-3 3" /><path d="M4 11V9a4 4 0 0 1 4-4h12" /><path d="M7 22l-3-3 3-3" /><path d="M20 13v2a4 4 0 0 1-4 4H4" /></symbol>
      <symbol id="i-cards" viewBox="0 0 24 24"><rect x="3" y="6" width="14" height="14" rx="1.5" /><path d="M7 3h12a2 2 0 0 1 2 2v12" /></symbol>
      <symbol id="i-match" viewBox="0 0 24 24"><rect x="3" y="4" width="7" height="6" rx="1" /><rect x="14" y="14" width="7" height="6" rx="1" /><path d="M10 7h3a2 2 0 0 1 2 2v5" /></symbol>
      <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></symbol>
      <symbol id="i-flame" viewBox="0 0 24 24"><path d="M12 21c-3.9 0-6.5-2.6-6.5-6.1 0-3.8 3.4-5.6 3.9-9.9 2.6 1.6 3.4 4 3.1 6 1.1-.6 1.9-1.8 2-3.1 2 1.7 4 4.3 4 7 0 3.5-2.6 6.1-6.5 6.1z" /></symbol>
      <symbol id="i-trophy" viewBox="0 0 24 24"><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6M10 17h4" /></symbol>
      <symbol id="i-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></symbol>
      <symbol id="i-reset" viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" /><path d="M4 4v4.5h4.5" /></symbol>
      <symbol id="i-chev" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></symbol>
      <symbol id="i-focus" viewBox="0 0 24 24"><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" /></symbol>
      <symbol id="i-vol" viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></symbol>
      <symbol id="i-volx" viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M16 9.5l5 5M21 9.5l-5 5" /></symbol>
      <symbol id="i-upload" viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></symbol>
      <symbol id="i-copy" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="1.5" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></symbol>
      <symbol id="i-down" viewBox="0 0 24 24"><path d="M12 4v12M7 11l5 5 5-5M4 20h16" /></symbol>
      <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></symbol>
      <symbol id="i-flip" viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" /><path d="M18 3v4h-4M6 21v-4h4" /></symbol>
      <symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></symbol>
      <symbol id="i-shuffle" viewBox="0 0 24 24"><path d="M16 4h4v4M4 20l16-16M20 16v4h-4M15 15l5 5M4 4l5 5" /></symbol>
      <symbol id="i-chart" viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></symbol>
      <symbol id="i-archive" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" /></symbol>
      <symbol id="i-edit" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" /></symbol>
      <symbol id="i-trash" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></symbol>
      <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></symbol>
      <symbol id="i-grid" viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></symbol>
      <symbol id="i-list" viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></symbol>
      <symbol id="i-more" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></symbol>
      <symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" /></symbol>
      <symbol id="i-down2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></symbol>
      <symbol id="i-pin" viewBox="0 0 24 24"><path d="M9 4h6l-1 5 3 3v2H7v-2l3-3z" /><path d="M12 14v6" /></symbol>
      <symbol id="i-pinoff" viewBox="0 0 24 24"><path d="M9 4h6l-1 5 3 3v2H7v-2l3-3z" /><path d="M12 14v6M4 4l16 16" /></symbol>
      <symbol id="i-cut" viewBox="0 0 24 24"><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M7.8 16.2L18 4M16.2 16.2L6 4" /></symbol>
      <symbol id="i-paste" viewBox="0 0 24 24"><path d="M9 4h6v3H9z" /><path d="M15 5h3v16H6V5h3" /></symbol>
      <symbol id="i-external" viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" /></symbol>
      <symbol id="i-link" viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></symbol>
      <symbol id="i-highlight" viewBox="0 0 24 24"><path d="M14 4l6 6-8 8H6v-6z" /><path d="M4 21h16" /></symbol>
      <symbol id="i-bookmark" viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z" /></symbol>
      <symbol id="i-comment" viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z" /></symbol>
      <symbol id="i-eye" viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></symbol>
      <symbol id="i-prompt" viewBox="0 0 24 24"><path d="M5 5h14v10H9l-4 4z" /><path d="M9 9h6M9 12h4" /></symbol>
    </svg>
  )
}

export function Icon({ name, size = 16, className = '' }: { name: string; size?: number; className?: string }) {
  return (
    <svg className={`i ${className}`} style={size === 16 ? undefined : { width: size, height: size }} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  )
}

export function Wordmark({ collapsedLabel = false }: { collapsedLabel?: boolean }) {
  return (
    <span className="wm" aria-label="Mneme">
      <svg aria-hidden="true"><use href="#mark" /></svg>
      <span className={collapsedLabel ? 'lbl' : undefined}>neme</span>
    </span>
  )
}
