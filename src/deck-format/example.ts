/** Pull the complete example deck (section 5) out of the prompt markdown. */
export function extractPromptExample(promptMd: string): string {
  const at = promptMd.indexOf('## 5. Complete example')
  const tail = at >= 0 ? promptMd.slice(at) : promptMd
  const m = tail.match(/```json\r?\n([\s\S]*?)\r?\n```/)
  if (!m) throw new Error('No example JSON block found in the prompt')
  return m[1]
}
