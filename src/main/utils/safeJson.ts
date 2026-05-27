// Type-narrowing helpers for hand-walking JSON shapes that may be partial,
// malformed, or missing fields entirely. The streaming analyzer parses
// in-flight JSON whose schema-required fields may not have arrived yet, so
// the rendering layer needs a guarantee that every field has the expected
// shape — not `undefined` from a "completed" parse of half a payload.

export function asString(v: unknown, fb = ''): string {
  return typeof v === 'string' ? v : fb
}

export function asStringOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

export function asBoolean(v: unknown, fb = false): boolean {
  return typeof v === 'boolean' ? v : fb
}

export function asUnknownArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

export function asStringArray(v: unknown): string[] {
  return asUnknownArray(v).filter((x): x is string => typeof x === 'string')
}

export function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}
