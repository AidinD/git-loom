export type LineType = 'add' | 'del' | 'context' | 'hunk' | 'meta' | 'file'

export type FileStatus = 'added' | 'deleted' | 'renamed' | 'modified'

export interface DiffLine {
  type: LineType
  oldNo?: number
  newNo?: number
  text: string
  status?: FileStatus
}

export interface SplitCell {
  no?: number
  text: string
}

export interface SplitRow {
  kind: 'context' | 'change' | 'hunk' | 'meta'
  left?: SplitCell
  right?: SplitCell
  text?: string
}

export interface FileSection {
  file: string
  status: FileStatus
  lines: DiffLine[]
}

const SKIP_PREFIXES = [
  'index ',
  '--- ',
  '+++ ',
  'old mode',
  'new mode',
  'new file',
  'deleted file',
  'similarity ',
  'rename ',
  'copy ',
  'dissimilarity '
]

export function parseDiff(text: string): DiffLine[] {
  const out: DiffLine[] = []
  let oldNo = 0
  let newNo = 0
  let currentFile: DiffLine | null = null

  for (const line of text.split('\n')) {
    const fileMatch = line.match(/^diff --git a\/.+ b\/(.+)$/)
    if (fileMatch) {
      currentFile = { type: 'file', text: fileMatch[1], status: 'modified' }
      out.push(currentFile)
      continue
    }
    // Infer file status from the git header lines before they are skipped.
    if (currentFile) {
      if (line.startsWith('new file')) {
        currentFile.status = 'added'
      } else if (line.startsWith('deleted file')) {
        currentFile.status = 'deleted'
      } else if (line.startsWith('rename ') || line.startsWith('copy ')) {
        currentFile.status = 'renamed'
      } else if (line === '--- /dev/null') {
        currentFile.status = 'added'
      } else if (line === '+++ /dev/null') {
        currentFile.status = 'deleted'
      }
    }
    if (SKIP_PREFIXES.some((prefix) => line.startsWith(prefix))) {
      continue
    }
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (match) {
        oldNo = Number(match[1])
        newNo = Number(match[2])
      }
      out.push({ type: 'hunk', text: line })
      continue
    }
    if (line.startsWith('+')) {
      out.push({ type: 'add', newNo, text: line.slice(1) })
      newNo += 1
      continue
    }
    if (line.startsWith('-')) {
      out.push({ type: 'del', oldNo, text: line.slice(1) })
      oldNo += 1
      continue
    }
    if (line.startsWith(' ')) {
      out.push({ type: 'context', oldNo, newNo, text: line.slice(1) })
      oldNo += 1
      newNo += 1
      continue
    }
    out.push({ type: 'meta', text: line })
  }

  return out
}

export function groupByFile(lines: DiffLine[]): FileSection[] {
  const sections: FileSection[] = []
  let current: FileSection | null = null
  for (const line of lines) {
    if (line.type === 'file') {
      current = { file: line.text, status: line.status ?? 'modified', lines: [] }
      sections.push(current)
    } else if (current) {
      current.lines.push(line)
    }
  }
  return sections
}

export function countChanges(lines: DiffLine[]): { add: number; del: number } {
  let add = 0
  let del = 0
  for (const line of lines) {
    if (line.type === 'add') {
      add += 1
    } else if (line.type === 'del') {
      del += 1
    }
  }
  return { add, del }
}

export function toSplit(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.type === 'context') {
      rows.push({
        kind: 'context',
        left: { no: line.oldNo, text: line.text },
        right: { no: line.newNo, text: line.text }
      })
      i += 1
      continue
    }
    if (line.type === 'del' || line.type === 'add') {
      const dels: DiffLine[] = []
      const adds: DiffLine[] = []
      while (i < lines.length && lines[i].type === 'del') {
        dels.push(lines[i])
        i += 1
      }
      while (i < lines.length && lines[i].type === 'add') {
        adds.push(lines[i])
        i += 1
      }
      const count = Math.max(dels.length, adds.length)
      for (let k = 0; k < count; k++) {
        const del = dels[k]
        const add = adds[k]
        rows.push({
          kind: 'change',
          left: del ? { no: del.oldNo, text: del.text } : undefined,
          right: add ? { no: add.newNo, text: add.text } : undefined
        })
      }
      continue
    }
    rows.push({ kind: line.type === 'hunk' ? 'hunk' : 'meta', text: line.text })
    i += 1
  }
  return rows
}
