import type { Ticket } from './types'

export function processWizRepCSV(csvText: string): Ticket[] {
  const lines = csvText.split('\n')
  if (lines.length < 2) return []

  // Parse header
  const headers = parseCSVLine(lines[0])

  const tickets: Ticket[] = []
  const now = new Date()

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const vals = parseCSVLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = vals[idx] || '' })

    // Only AH Group, Quote Submitted
    if (row['Customer'] !== 'AH Group') continue
    if (row['Status'] !== 'Quote Submitted') continue

    const qsDate = parseDate(row['Quote Submitted Date'])
    const agingDays = qsDate ? Math.max(0, Math.floor((now.getTime() - qsDate.getTime()) / 86400000)) : 0

    tickets.push({
      id: (row['ID'] || '').replace(/^"|"$/g, '').trim(),
      rr: (row['Customer Reference Number 1'] || '').trim(),
      part: (row['Product Number'] || '').trim(),
      serial: (row['Serial Number'] || '').trim(),
      quote: parseFloat(row['Quote Amount'] || '0') || 0,
      quote_submitted_date: qsDate ? qsDate.toISOString().split('T')[0] : '',
      aging: agingDays,
      category: agingCategory(agingDays),
      commodity: (row['Commodity.1'] || '').trim(),
      manufacturer: (row['Manufacturer.1'] || '').trim(),
      location: (row['Service Location.1'] || '').trim(),
      scraped: (row['Scraped'] || '').trim(),
      status: 'Quote Submitted',
    })
  }

  // Sort by aging descending
  tickets.sort((a, b) => b.aging - a.aging)
  return tickets
}

function agingCategory(days: number): Ticket['category'] {
  if (days > 120) return 'Over 120 Days'
  if (days > 90) return '91-120 Days'
  if (days > 60) return '61-90 Days'
  if (days > 30) return '31-60 Days'
  return 'Current'
}

function parseDate(s: string): Date | null {
  if (!s || s === 'NaT') return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}
