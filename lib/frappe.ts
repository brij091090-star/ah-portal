import type { Ticket } from './types'

const BASE = (process.env.FRAPPE_URL ?? 'https://wizrep.com').replace(/\/$/, '')
const USR = process.env.FRAPPE_USERNAME ?? ''
const PWD = process.env.FRAPPE_PASSWORD ?? ''

export const frappeConfigured = !!(USR && PWD)

interface LoginResult {
  sid: string
  csrfToken: string
}

// Login and return session cookies
export async function frappeLogin(): Promise<LoginResult | null> {
  try {
    const res = await fetch(`${BASE}/api/method/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({ usr: USR, pwd: PWD }).toString(),
    })

    if (!res.ok) {
      console.error('Frappe login failed:', res.status, await res.text())
      return null
    }

    const setCookie = res.headers.get('set-cookie') ?? ''

    const sid = setCookie.match(/\bsid=([^;,\s]+)/)?.[1] ?? ''
    const csrfToken = setCookie.match(/\bcsrf_token=([^;,\s]+)/)?.[1] ?? ''

    if (!sid || sid === 'Guest') {
      console.error('Login returned Guest session — check credentials')
      return null
    }

    return { sid, csrfToken }
  } catch (e) {
    console.error('Frappe login error:', e)
    return null
  }
}

// Fetch all Quote Submitted tickets for AH Group
export async function fetchFrappeTickets(): Promise<Ticket[] | null> {
  const auth = await frappeLogin()
  if (!auth) return null

  try {
    const filters = JSON.stringify([
      ['customer', '=', 'AH Group'],
      ['status', '=', 'Quote Submitted'],
    ])

    const fields = JSON.stringify([
      'name',
      'customer',
      'product_number',
      'serial_number',
      'status',
      'quote_amount',
      'quote_submitted_date',
      'customer_reference_number_1',
      'scraped',
      'commodity',
      'manufacturer',
      'service_location',
    ])

    const params = new URLSearchParams({
      filters,
      fields,
      limit_page_length: '0',
      order_by: 'quote_submitted_date asc',
    })

    const res = await fetch(`${BASE}/api/resource/Ticket?${params}`, {
      headers: {
        Cookie: `sid=${auth.sid}; csrf_token=${auth.csrfToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    })

    if (!res.ok) {
      console.error('Frappe fetch tickets failed:', res.status)
      return null
    }

    const data = await res.json()
    const raw: Record<string, unknown>[] = data.data ?? []
    return processRaw(raw)
  } catch (e) {
    console.error('Frappe fetch error:', e)
    return null
  }
}

// Write rejection back to WizRep (Quote Rejected + Scraped = Yes)
export async function rejectInFrappe(ticketId: string): Promise<boolean> {
  const auth = await frappeLogin()
  if (!auth) return false

  try {
    const res = await fetch(`${BASE}/api/resource/Ticket/${encodeURIComponent(ticketId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `sid=${auth.sid}; csrf_token=${auth.csrfToken}`,
        'X-Frappe-CSRF-Token': auth.csrfToken,
        Accept: 'application/json',
      },
      body: JSON.stringify({
        status: 'Quote Rejected',
        scraped: 'Yes',
      }),
    })

    if (!res.ok) {
      console.error(`Reject ${ticketId} failed:`, res.status, await res.text())
    }
    return res.ok
  } catch (e) {
    console.error('Frappe reject error:', e)
    return false
  }
}

// Write approval back to WizRep (Quote Approved)
export async function approveInFrappe(ticketId: string): Promise<boolean> {
  const auth = await frappeLogin()
  if (!auth) return false

  try {
    const res = await fetch(`${BASE}/api/resource/Ticket/${encodeURIComponent(ticketId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `sid=${auth.sid}; csrf_token=${auth.csrfToken}`,
        'X-Frappe-CSRF-Token': auth.csrfToken,
        Accept: 'application/json',
      },
      body: JSON.stringify({
        status: 'Quote Approved',
      }),
    })

    if (!res.ok) {
      console.error(`Approve ${ticketId} failed:`, res.status)
    }
    return res.ok
  } catch (e) {
    console.error('Frappe approve error:', e)
    return false
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function processRaw(raw: Record<string, unknown>[]): Ticket[] {
  const now = new Date()
  return raw
    .map(r => {
      const dateStr = String(r.quote_submitted_date ?? '')
      const qsDate = dateStr ? new Date(dateStr) : null
      const aging = qsDate && !isNaN(qsDate.getTime())
        ? Math.max(0, Math.floor((now.getTime() - qsDate.getTime()) / 86400000))
        : 0

      return {
        id: String(r.name ?? ''),
        rr: String(r.customer_reference_number_1 ?? ''),
        part: String(r.product_number ?? ''),
        serial: String(r.serial_number ?? ''),
        quote: parseFloat(String(r.quote_amount ?? '0')) || 0,
        quote_submitted_date: qsDate && !isNaN(qsDate.getTime())
          ? qsDate.toISOString().split('T')[0]
          : '',
        aging,
        category: agingCat(aging),
        commodity: String(r.commodity ?? ''),
        manufacturer: String(r.manufacturer ?? ''),
        location: String(r.service_location ?? ''),
        scraped: String(r.scraped ?? ''),
        status: 'Quote Submitted',
      } satisfies Ticket
    })
    .sort((a, b) => b.aging - a.aging)
}

function agingCat(days: number): Ticket['category'] {
  if (days > 120) return 'Over 120 Days'
  if (days > 90)  return '91-120 Days'
  if (days > 60)  return '61-90 Days'
  if (days > 30)  return '31-60 Days'
  return 'Current'
}
