export interface Ticket {
  id: string        // RT######
  rr: string        // WizRep RR# (Customer Reference Number 1)
  part: string
  serial: string
  quote: number
  quote_submitted_date: string
  aging: number
  category: 'Over 120 Days' | '91-120 Days' | '61-90 Days' | '31-60 Days' | 'Current'
  commodity: string
  manufacturer: string
  location: string
  scraped: string
  status: string
}

export type DecisionValue = 'approved' | 'rejected'

export interface Decision {
  decision: DecisionValue
  timestamp: string
  by?: string
}

export type DecisionsMap = Record<string, Decision>
