/**
 * Parses RFC 4180 CSV: quoted fields may hold commas, line breaks and doubled quotes.
 * The first row is the header, and each later row becomes an object keyed by it.
 */
export const parseCsv = (text: string): Record<string, string>[] => {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  const endField = () => {
    row.push(field)
    field = ''
  }

  const endRow = () => {
    endField()
    // A blank line is a single empty field.
    if (row.length > 1 || row[0] !== '') {
      rows.push(row)
    }
    row = []
  }

  // Strip the byte order mark that spreadsheet exports add.
  const input = text.replace(/^﻿/, '')

  for (let i = 0; i < input.length; i++) {
    const char = input[i]

    if (quoted) {
      if (char !== '"') {
        field += char
      } else if (input[i + 1] === '"') {
        field += '"'
        i++
      } else {
        quoted = false
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      endField()
    } else if (char === '\n') {
      endRow()
    } else if (char !== '\r') {
      field += char
    }
  }

  if (field !== '' || row.length > 0) {
    endRow()
  }

  const [header, ...records] = rows

  if (!header) {
    return []
  }

  return records.map((record) =>
    Object.fromEntries(header.map((name, index) => [name.trim(), record[index] ?? ''])),
  )
}
