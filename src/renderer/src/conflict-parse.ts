export type Choice = 'none' | 'ours' | 'theirs' | 'both' | 'both-rev'

export interface ContextSegment {
  kind: 'context'
  lines: string[]
}

export interface ConflictSegment {
  kind: 'conflict'
  index: number
  oursLabel: string
  theirsLabel: string
  ours: string[]
  theirs: string[]
  base: string[]
}

export type Segment = ContextSegment | ConflictSegment

// Tolerant of a trailing \r so CRLF files parse correctly after split('\n').
const OURS_MARKER = /^<{7}(?: (.*?))?\r?$/
const BASE_MARKER = /^\|{7}(?: (.*?))?\r?$/
const SEP_MARKER = /^={7}\r?$/
const THEIRS_MARKER = /^>{7}(?: (.*?))?\r?$/

/**
 * Splits a conflicted file's content into ordered context and conflict
 * segments. Handles both 2-way and diff3 (with a base section) markers.
 */
export function parseConflicts(content: string): Segment[] {
  const lines = content.split('\n')
  const segments: Segment[] = []
  let context: string[] = []
  let conflictIndex = 0

  let mode: 'normal' | 'ours' | 'base' | 'theirs' = 'normal'
  let current: ConflictSegment | null = null

  function flushContext(): void {
    if (context.length > 0) {
      segments.push({ kind: 'context', lines: context })
      context = []
    }
  }

  for (const line of lines) {
    if (mode === 'normal') {
      const oursMatch = line.match(OURS_MARKER)
      if (oursMatch) {
        flushContext()
        current = {
          kind: 'conflict',
          index: conflictIndex,
          oursLabel: oursMatch[1] ?? 'Current',
          theirsLabel: 'Incoming',
          ours: [],
          theirs: [],
          base: []
        }
        conflictIndex += 1
        mode = 'ours'
        continue
      }
      context.push(line)
      continue
    }

    if (!current) {
      continue
    }

    if (mode === 'ours') {
      if (BASE_MARKER.test(line)) {
        mode = 'base'
        continue
      }
      if (SEP_MARKER.test(line)) {
        mode = 'theirs'
        continue
      }
      current.ours.push(line)
      continue
    }

    if (mode === 'base') {
      if (SEP_MARKER.test(line)) {
        mode = 'theirs'
        continue
      }
      current.base.push(line)
      continue
    }

    // mode === 'theirs'
    const theirsMatch = line.match(THEIRS_MARKER)
    if (theirsMatch) {
      current.theirsLabel = theirsMatch[1] ?? 'Incoming'
      segments.push(current)
      current = null
      mode = 'normal'
      continue
    }
    current.theirs.push(line)
  }

  flushContext()
  return segments
}

/** Renders a single conflict block back to its chosen resolution lines. */
function resolveLines(segment: ConflictSegment, choice: Choice): string[] {
  if (choice === 'ours') {
    return segment.ours
  }
  if (choice === 'theirs') {
    return segment.theirs
  }
  if (choice === 'both') {
    return [...segment.ours, ...segment.theirs]
  }
  if (choice === 'both-rev') {
    return [...segment.theirs, ...segment.ours]
  }
  // 'none' — keep the original markers so the block stays unresolved.
  const out = [`<<<<<<< ${segment.oursLabel}`, ...segment.ours]
  if (segment.base.length > 0) {
    out.push('||||||| base', ...segment.base)
  }
  out.push('=======', ...segment.theirs, `>>>>>>> ${segment.theirsLabel}`)
  return out
}

/** Rebuilds the full file from segments and the per-block choices. */
export function buildMerged(segments: Segment[], choices: Record<number, Choice>): string {
  const out: string[] = []
  for (const segment of segments) {
    if (segment.kind === 'context') {
      out.push(...segment.lines)
    } else {
      out.push(...resolveLines(segment, choices[segment.index] ?? 'none'))
    }
  }
  return out.join('\n')
}

/** True when no conflict markers remain in the text. */
export function isFullyResolved(text: string): boolean {
  return !text
    .split('\n')
    .some(
      (line) =>
        OURS_MARKER.test(line) || SEP_MARKER.test(line) || THEIRS_MARKER.test(line)
    )
}
