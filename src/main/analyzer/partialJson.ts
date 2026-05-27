/**
 * Best-effort partial JSON parser. The streaming analyzer hands us the
 * accumulated SSE text whenever a delta arrives; the text is often a
 * half-written JSON object (open string, unbalanced braces, trailing comma).
 *
 * Strategy:
 *   1. Try closing the JSON as-is (balance braces, close any open string).
 *   2. If that fails, walk back through string-safe delimiter positions and
 *      retry with progressively shorter prefixes.
 *
 * Returns `null` if nothing remotely parseable is in there yet.
 */
export function tryPartialParse(text: string): unknown | null {
  const t = text.trimStart()
  if (!t.startsWith('{')) return null

  const fullCandidate = closeBalanced(t)
  if (fullCandidate) {
    try {
      return JSON.parse(fullCandidate)
    } catch {
      /* fall through to truncation attempts */
    }
  }

  const delims = findSafeDelimiters(t)
  // Bound iterations to keep parsing cheap on long responses.
  const MAX_ATTEMPTS = 30
  const start = Math.max(0, delims.length - MAX_ATTEMPTS)
  for (let i = delims.length - 1; i >= start; i--) {
    const { pos, kind } = delims[i]
    const cut = kind === 'comma' ? pos : pos + 1
    const sub = t.slice(0, cut).trimEnd()
    const candidate = closeBalanced(sub)
    if (!candidate) continue
    try {
      return JSON.parse(candidate)
    } catch {
      /* try the next earlier delimiter */
    }
  }
  return null
}

function findSafeDelimiters(text: string): Array<{ pos: number; kind: 'comma' | 'open' }> {
  const out: Array<{ pos: number; kind: 'comma' | 'open' }> = []
  let inString = false
  let escape = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (escape) {
      escape = false
      continue
    }
    if (inString) {
      if (c === '\\') escape = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === ',') out.push({ pos: i, kind: 'comma' })
    else if (c === '{' || c === '[') out.push({ pos: i, kind: 'open' })
  }
  return out
}

function closeBalanced(text: string): string | null {
  let inString = false
  let escape = false
  const stack: string[] = []
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (escape) {
      escape = false
      continue
    }
    if (inString) {
      if (c === '\\') escape = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{') stack.push('}')
    else if (c === '[') stack.push(']')
    else if (c === '}' || c === ']') {
      if (stack.length === 0) return null
      stack.pop()
    }
  }
  let body = text
  if (inString) body += '"'
  body = body.trimEnd()
  if (body.endsWith(':')) body += ' null'
  body += stack.slice().reverse().join('')
  // Remove trailing comma right before a closing brace/bracket.
  body = body.replace(/,(\s*[}\]])/g, '$1')
  return body
}
