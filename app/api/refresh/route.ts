import { NextRequest, NextResponse } from 'next/server'
import { setTickets, getLastRefresh, kvConfigured } from '@/lib/kv'
import { fetchFrappeTickets, frappeConfigured } from '@/lib/frappe'
import { processWizRepCSV } from '@/lib/process-csv'

export const dynamic = 'force-dynamic'

export async function GET() {
  const lastRefresh = kvConfigured ? await getLastRefresh() : null
  return NextResponse.json({ lastRefresh, kvConfigured, frappeConfigured })
}

// POST: refresh from Frappe live OR from uploaded CSV
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Option A: Live refresh from WizRep via Frappe API
    if (!body.csv) {
      if (!frappeConfigured) {
        return NextResponse.json({ error: 'WizRep not configured. Add FRAPPE_URL, FRAPPE_USERNAME, FRAPPE_PASSWORD env vars.' }, { status: 503 })
      }

      const tickets = await fetchFrappeTickets()
      if (!tickets || tickets.length === 0) {
        return NextResponse.json({ error: 'Could not fetch from WizRep — check credentials or connection.' }, { status: 502 })
      }

      if (kvConfigured) await setTickets(tickets)

      const cats: Record<string, number> = {}
      tickets.forEach(t => { cats[t.category] = (cats[t.category] || 0) + 1 })

      return NextResponse.json({
        ok: true,
        count: tickets.length,
        categories: cats,
        source: 'live',
        refreshedAt: new Date().toISOString(),
      })
    }

    // Option B: CSV upload fallback
    const tickets = processWizRepCSV(body.csv)
    if (tickets.length === 0) {
      return NextResponse.json({ error: 'No Quote Submitted AH Group tickets found in CSV' }, { status: 400 })
    }

    if (kvConfigured) await setTickets(tickets)

    const cats: Record<string, number> = {}
    tickets.forEach(t => { cats[t.category] = (cats[t.category] || 0) + 1 })

    return NextResponse.json({
      ok: true,
      count: tickets.length,
      categories: cats,
      source: 'csv',
      refreshedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Refresh error:', error)
    return NextResponse.json({ error: 'Failed to refresh' }, { status: 500 })
  }
}
