import { NextRequest, NextResponse } from 'next/server'
import { setTickets, getLastRefresh, kvConfigured } from '@/lib/kv'
import { processWizRepCSV } from '@/lib/process-csv'

export const dynamic = 'force-dynamic'

// GET - returns last refresh timestamp
export async function GET() {
  if (!kvConfigured) {
    return NextResponse.json({ lastRefresh: null, kvConfigured: false })
  }
  const lastRefresh = await getLastRefresh()
  return NextResponse.json({ lastRefresh, kvConfigured: true })
}

// POST - accepts CSV text and refreshes tickets in KV
export async function POST(req: NextRequest) {
  if (!kvConfigured) {
    return NextResponse.json({ error: 'KV storage not configured. Add KV_REST_API_URL and KV_REST_API_TOKEN env vars.' }, { status: 503 })
  }

  try {
    const body = await req.json()
    const { csv } = body

    if (!csv || typeof csv !== 'string') {
      return NextResponse.json({ error: 'csv field required' }, { status: 400 })
    }

    const tickets = processWizRepCSV(csv)

    if (tickets.length === 0) {
      return NextResponse.json({ error: 'No Quote Submitted AH Group tickets found in CSV' }, { status: 400 })
    }

    await setTickets(tickets)

    const cats: Record<string, number> = {}
    tickets.forEach(t => { cats[t.category] = (cats[t.category] || 0) + 1 })

    return NextResponse.json({
      ok: true,
      count: tickets.length,
      categories: cats,
      refreshedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Refresh error:', error)
    return NextResponse.json({ error: 'Failed to process CSV' }, { status: 500 })
  }
}
