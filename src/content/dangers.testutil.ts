// Test helper: anything in rendered HTML that could run script, navigate, or fetch from elsewhere.
// Parses the HTML the way a browser would, so text inside quoted attributes doesn't count.

const TAGS = ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'style', 'link', 'meta', 'base', 'img', 'a', 'details', 'noscript', 'image', 'use', 'foreignobject']
const URL_ATTRS = ['href', 'src', 'srcdoc', 'action', 'data', 'formaction', 'xlink:href', 'background', 'poster']

/** `allow` lists tags that may appear (say `a` with a safe href); their URL attributes are still checked. */
export function dangers(html: string, allow: string[] = []): string[] {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const found: string[] = []
  for (const el of [doc.body, ...Array.from(doc.body.querySelectorAll('*'))]) {
    const tag = el.tagName.toLowerCase()
    if (TAGS.includes(tag) && !allow.includes(tag)) found.push(`<${tag}>`)
    for (const { name, value } of Array.from(el.attributes)) {
      const n = name.toLowerCase()
      if (n.startsWith('on')) found.push(`${tag}[${n}]`)
      if (URL_ATTRS.includes(n) && !(allow.includes(tag) && (value === '' || /^https:\/\//.test(value)))) found.push(`${tag}[${n}=${value}]`)
      if (!n.startsWith('data-') && /javascript:|vbscript:|data:text\/html|url\(\s*['"]?\s*(https?:|javascript:|\/\/)/i.test(value)) found.push(`${tag}[${n}=${value}]`)
    }
  }
  return found
}
