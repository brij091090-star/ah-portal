import { NextResponse } from 'next/server'
import { getTickets, kvConfigured } from '@/lib/kv'
import seedData from '@/lib/tickets_seed.json'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Try KV first (live/refreshed data), fall back to seed
    if (kvConfigured) {
      const kvTickets = await getTickets()
      if (kvTickets && kvTickets.length > 0) {
        return NextResponse.json({ tickets: kvTickets, source: 'live' })
      }
    }
    // Fall back to seeded data
    return NextResponse.json({ tickets: seedData, source: 'seed' })
  } catch (error) {
    console.error('Tickets API error:', error)
    return NextResponse.json({ tickets: seedData, source: 'seed' })
  }
}
