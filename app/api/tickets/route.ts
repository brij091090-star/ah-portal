import { NextResponse } from 'next/server'
import { getTickets, setTickets, kvConfigured } from '@/lib/kv'
import { fetchFrappeTickets, frappeConfigured } from '@/lib/frappe'
import seedData from '@/lib/tickets_seed.json'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // 1. Try live Frappe fetch first
    if (frappeConfigured) {
      const liveTickets = await fetchFrappeTickets()
      if (liveTickets && liveTickets.length > 0) {
        // Cache in KV for fast subsequent loads
        if (kvConfigured) {
          setTickets(liveTickets).catch(() => {})
        }
        return NextResponse.json({ tickets: liveTickets, source: 'live' })
      }
    }

    // 2. Fall back to KV cache
    if (kvConfigured) {
      const cached = await getTickets()
      if (cached && cached.length > 0) {
        return NextResponse.json({ tickets: cached, source: 'cached' })
      }
    }

    // 3. Fall back to seed data
    return NextResponse.json({ tickets: seedData, source: 'seed' })
  } catch (error) {
    console.error('Tickets API error:', error)
    return NextResponse.json({ tickets: seedData, source: 'seed' })
  }
}
