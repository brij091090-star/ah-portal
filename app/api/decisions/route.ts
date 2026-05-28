import { NextRequest, NextResponse } from 'next/server'
import { getDecisions, setDecision, kvConfigured } from '@/lib/kv'

export const dynamic = 'force-dynamic'

// GET all decisions
export async function GET() {
  if (!kvConfigured) {
    return NextResponse.json({ decisions: {}, kvConfigured: false })
  }
  const decisions = await getDecisions()
  return NextResponse.json({ decisions, kvConfigured: true })
}

// POST a single decision
export async function POST(req: NextRequest) {
  if (!kvConfigured) {
    return NextResponse.json({ error: 'KV not configured' }, { status: 503 })
  }
  const body = await req.json()
  const { ticketId, decision } = body // decision: 'approved' | 'rejected' | null

  if (!ticketId) {
    return NextResponse.json({ error: 'ticketId required' }, { status: 400 })
  }

  await setDecision(ticketId, decision)
  return NextResponse.json({ ok: true })
}

// PATCH bulk decisions
export async function PATCH(req: NextRequest) {
  if (!kvConfigured) {
    return NextResponse.json({ error: 'KV not configured' }, { status: 503 })
  }
  const body = await req.json()
  const { ticketIds, decision } = body

  if (!Array.isArray(ticketIds) || !decision) {
    return NextResponse.json({ error: 'ticketIds[] and decision required' }, { status: 400 })
  }

  // Update all in parallel
  await Promise.all(ticketIds.map((id: string) => setDecision(id, decision)))
  return NextResponse.json({ ok: true, updated: ticketIds.length })
}
