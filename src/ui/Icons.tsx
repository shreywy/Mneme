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
      <symbol id="i-page" viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5" /><path d="M9 17l1-3 5-5 2 2-5 5z" /></symbol>
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
      <symbol id="i-undo" viewBox="0 0 24 24"><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></symbol>
      <symbol id="i-redo" viewBox="0 0 24 24"><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></symbol>
      <symbol id="i-quote" viewBox="0 0 24 24"><path d="M6 17h4v-5H6.5c0-2 1-3.5 3-4M14 17h4v-5h-3.5c0-2 1-3.5 3-4" /></symbol>
      <symbol id="i-code" viewBox="0 0 24 24"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5" /></symbol>
      <symbol id="i-ol" viewBox="0 0 24 24"><path d="M10 6h10M10 12h10M10 18h10M4 5h1.5v4M4 9h3M4 15.5a1.5 1.5 0 0 1 3 0c0 1.5-3 2-3 3.5h3" /></symbol>
      <symbol id="i-task" viewBox="0 0 24 24"><rect x="3" y="4" width="6" height="6" rx="1" /><path d="M4.5 7l1.2 1.2L8 5.8M12 7h9M3 15h6v6H3zM12 18h9" /></symbol>
      <symbol id="i-hand" viewBox="0 0 24 24"><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V12M17 9.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-2a6 6 0 0 1-5-2.7L4.3 14a1.6 1.6 0 0 1 2.6-1.8L8 14" /></symbol>
      <symbol id="i-cursor" viewBox="0 0 24 24"><path d="M5 3l14 7.5-6 1.8-2.7 6.2z" /></symbol>
      <symbol id="i-text" viewBox="0 0 24 24"><path d="M5 6V4h14v2M12 4v16M9 20h6" /></symbol>
      <symbol id="i-flag" viewBox="0 0 24 24"><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></symbol>
      <symbol id="i-contents" viewBox="0 0 24 24"><path d="M4 6h16M8 12h12M8 18h12M4 12h.01M4 18h.01" /></symbol>
      <symbol id="i-color" viewBox="0 0 24 24"><path d="M6 18L12 4l6 14M8.5 13h7" /></symbol>
      <symbol id="i-star" viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8-4.2-4.1 5.9-.9z" /></symbol>
      <symbol id="i-table" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M10 4v16" /></symbol>
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
      <symbol id="i-pen" viewBox="0 0 24 24"><path d="M15.5 4.5l4 4L9 19l-5 1 1-5z" /><path d="M13.5 6.5l4 4" /></symbol>
      <symbol id="i-eraser" viewBox="0 0 24 24"><path d="M8.5 19.5L4 15l9.5-9.5 6.5 6.5-8 7.5z" /><path d="M9 10l5.5 5.5M8.5 19.5H20" /></symbol>
      <symbol id="i-lasso" viewBox="0 0 24 24"><ellipse cx="12.5" cy="9" rx="8" ry="5" strokeDasharray="2.6 2.4" /><path d="M7.5 13c-1.6 1.6-1.2 3.6.4 4.4 1.7.8 1.2 2.6-.4 3.1" /></symbol>
      <symbol id="i-image" viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4" /></symbol>
      <symbol id="i-print" viewBox="0 0 24 24"><path d="M7 9V4h10v5" /><rect x="3.5" y="9" width="17" height="7" rx="1.5" /><path d="M7 14h10v6H7z" /></symbol>
      <symbol id="i-sheets" viewBox="0 0 24 24"><rect x="5" y="3.5" width="11" height="14" rx="1" /><path d="M8 20.5h11v-14" /></symbol>
      <symbol id="i-shape" viewBox="0 0 24 24"><rect x="3.5" y="10" width="9" height="9" rx="1" /><circle cx="16" cy="8" r="4.5" /></symbol>
      <symbol id="i-spark2" viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></symbol>
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
