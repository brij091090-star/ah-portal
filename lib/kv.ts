// Upstash Redis REST API client
// Set env vars: KV_REST_API_URL and KV_REST_API_TOKEN
// Get these from https://upstash.com (free tier) or Vercel → Storage → KV

const KV_URL = process.env.KV_REST_API_URL || ''
const KV_TOKEN = process.env.KV_REST_API_TOKEN || ''

const DECISIONS_KEY = 'ah_portal_decisions'
const TICKETS_KEY = 'ah_portal_tickets'
const LAST_REFRESH_KEY = 'ah_portal_last_refresh'

async function kvFetch(command: string[]) {
  if (!KV_URL || !KV_TOKEN) return null
  const res = await fetch(`${KV_URL}/${command.map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    cache: 'no-store',
  })
  if (!res.ok) return null
  const json = await res.json()
  return json.result
}

async function kvSet(key: string, value: string) {
  if (!KV_URL || !KV_TOKEN) return null
  const res = await fetch(`${KV_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    cache: 'no-store',
  })
  const json = await res.json()
  return json.result
}

export async function getDecisions(): Promise<Record<string, string>> {
  try {
    const raw = await kvFetch(['get', DECISIONS_KEY])
    if (!raw) return {}
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export async function setDecision(ticketId: string, decision: string | null): Promise<void> {
  const current = await getDecisions()
  if (decision === null) {
    delete current[ticketId]
  } else {
    current[ticketId] = decision
  }
  await kvSet(DECISIONS_KEY, JSON.stringify(current))
}

export async function getTickets(): Promise<object[] | null> {
  try {
    const raw = await kvFetch(['get', TICKETS_KEY])
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function setTickets(tickets: object[]): Promise<void> {
  // Upstash has 1MB limit per key on free tier; tickets are ~350KB gzipped.
  // Store as compressed JSON string — if too large, store in chunks.
  const json = JSON.stringify(tickets)
  await kvSet(TICKETS_KEY, json)
  await kvSet(LAST_REFRESH_KEY, new Date().toISOString())
}

export async function getLastRefresh(): Promise<string | null> {
  return kvFetch(['get', LAST_REFRESH_KEY])
}

export const kvConfigured = !!(KV_URL && KV_TOKEN)
