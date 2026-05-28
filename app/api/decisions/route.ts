import { NextRequest, NextResponse } from 'next/server'
import { getDecisions, setDecision, kvConfigured } from '@/lib/kv'
import { rejectInFrappe, approveInFrappe, frappeConfigured } from '@/lib/frappe'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!kvConfigured) {
    return NextResponse.json({ decisions: {}, kvConfigured: false })
  }
  const decisions = await getDecisions()
  return NextResponse.json({ decisions, kvConfigured: true })
}

// POST: single decision
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { ticketId, decision } = body

  if (!ticketId) {
    return NextResponse.json({ error: 'ticketId required' }, { status: 400 })
  }

  // Write to KV
  if (kvConfigured) {
    await setDecision(ticketId, decision)
  }

  // Write back to WizRep via Frappe API
  if (frappeConfigured && decision) {
    if (decision === 'rejected') {
      rejectInFrappe(ticketId).catch(e => console.error('Frappe reject error:', e))
    } else if (decision === 'approved') {
      approveInFrappe(ticketId).catch(e => console.error('Frappe approve error:', e))
    }
  }

  return NextResponse.json({ ok: true, wizrepUpdated: frappeConfigured && !!decision })
}

// PATCH: bulk decisions
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { ticketIds, decision } = body

  if (!Array.isArray(ticketIds) || !decision) {
    return NextResponse.json({ error: 'ticketIds[] and decision required' }, { status: 400 })
  }

  // Write all to KV
  if (kvConfigured) {
    await Promise.all(ticketIds.map((id: string) => setDecision(id, decision)))
  }

  // Write all back to WizRep (fire and forget — don't block the response)
  if (frappeConfigured) {
    const fn = decision === 'rejected' ? rejectInFrappe : approveInFrappe
    Promise.all(ticketIds.map((id: string) => fn(id)))
      .catch(e => console.error('Bulk Frappe update error:', e))
  }

  return NextResponse.json({
    ok: true,
    updated: ticketIds.length,
    wizrepUpdated: frappeConfigured,
  })
}
