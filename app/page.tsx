'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Ticket } from '@/lib/types'

const CATS = ['Over 120 Days', '91-120 Days', '61-90 Days', '31-60 Days', 'Current'] as const
const CAT_LABELS: Record<string, string> = {
  'Over 120 Days': 'Over 120d',
  '91-120 Days': '91–120d',
  '61-90 Days': '61–90d',
  '31-60 Days': '31–60d',
  'Current': 'Current',
}
const PAGE_SIZE = 60

function agingChip(category: string) {
  if (category === 'Over 120 Days') return 'chip chip-120'
  if (category === '91-120 Days') return 'chip chip-91'
  if (category === '61-90 Days') return 'chip chip-61'
  if (category === '31-60 Days') return 'chip chip-31'
  return 'chip chip-0'
}

type SyncState = 'idle' | 'saving' | 'saved' | 'error' | 'no-kv'

export default function Portal() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [decisions, setDecisions] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [kvEnabled, setKvEnabled] = useState(false)
  const [activeTab, setActiveTab] = useState<string>('Over 120 Days')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [showRefresh, setShowRefresh] = useState(false)
  const [refreshStatus, setRefreshStatus] = useState('')
  const [lastRefresh, setLastRefresh] = useState<string | null>(null)
  const [dataSource, setDataSource] = useState<'live' | 'seed'>('seed')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const syncTimer = useRef<ReturnType<typeof setTimeout>>()

  // Load tickets + decisions
  useEffect(() => {
    async function init() {
      setLoading(true)
      try {
        const [tRes, dRes, rRes] = await Promise.all([
          fetch('/api/tickets'),
          fetch('/api/decisions'),
          fetch('/api/refresh'),
        ])
        const tData = await tRes.json()
        const dData = await dRes.json()
        const rData = await rRes.json()

        setTickets(tData.tickets || [])
        setDataSource(tData.source || 'seed')
        setDecisions(dData.decisions || {})
        setKvEnabled(dData.kvConfigured || false)
        if (rData.lastRefresh) setLastRefresh(rData.lastRefresh)
      } catch (err) {
        console.error(err)
      }
      setLoading(false)
    }
    init()
  }, [])

  // Save a decision to server (or localStorage fallback)
  const saveDecision = useCallback(async (ticketId: string, decision: string | null) => {
    setSyncState('saving')
    clearTimeout(syncTimer.current)

    // Optimistic update
    setDecisions(prev => {
      const next = { ...prev }
      if (decision === null) delete next[ticketId]
      else next[ticketId] = decision
      return next
    })

    if (kvEnabled) {
      try {
        await fetch('/api/decisions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketId, decision }),
        })
        setSyncState('saved')
      } catch {
        setSyncState('error')
      }
    } else {
      // Save to localStorage as fallback
      setSyncState('no-kv')
    }

    syncTimer.current = setTimeout(() => setSyncState('idle'), 2500)
  }, [kvEnabled])

  const bulkDecide = useCallback(async (dec: string) => {
    const ids = Array.from(selected)
    setSyncState('saving')

    setDecisions(prev => {
      const next = { ...prev }
      ids.forEach(id => { next[id] = dec })
      return next
    })
    setSelected(new Set())

    if (kvEnabled) {
      try {
        await fetch('/api/decisions', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketIds: ids, decision: dec }),
        })
        setSyncState('saved')
      } catch {
        setSyncState('error')
      }
    } else {
      setSyncState('no-kv')
    }
    clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => setSyncState('idle'), 2500)
  }, [selected, kvEnabled])

  function decide(ticketId: string, dec: string) {
    const current = decisions[ticketId]
    saveDecision(ticketId, current === dec ? null : dec)
  }

  // Filtering
  const filtered = tickets.filter(t => {
    if (activeTab !== 'All' && t.category !== activeTab) return false
    if (search) {
      const s = search.toLowerCase()
      return t.id.toLowerCase().includes(s) ||
        t.rr.toLowerCase().includes(s) ||
        t.part.toLowerCase().includes(s) ||
        t.serial.toLowerCase().includes(s)
    }
    return true
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const currentPage = Math.min(page, Math.max(0, totalPages - 1))
  const paged = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
  const allPageSelected = paged.length > 0 && paged.every(t => selected.has(t.id))

  // Counts
  const catCounts: Record<string, number> = { All: tickets.length }
  CATS.forEach(c => { catCounts[c] = tickets.filter(t => t.category === c).length })
  const totalDecided = Object.keys(decisions).length
  const totalApproved = Object.values(decisions).filter(d => d === 'approved').length
  const totalRejected = Object.values(decisions).filter(d => d === 'rejected').length
  const pctReviewed = tickets.length ? Math.round((totalDecided / tickets.length) * 100) : 0

  // CSV export for WizRep
  function exportRejected() {
    const rejected = tickets.filter(t => decisions[t.id] === 'rejected')
    if (!rejected.length) { alert('No rejected tickets yet.'); return }
    const rows = [
      'Ticket ID,WizRep RR#,Part Number,Serial Number,Quote Amount,Quote Submitted Date,Aging Days,Category,Action Required',
      ...rejected.map(t =>
        `${t.id},${t.rr},${t.part},${t.serial},$${t.quote},${t.quote_submitted_date},${t.aging},${t.category},"Set Quote Rejected + Scraped=Yes"`
      ),
    ].join('\n')
    const blob = new Blob([rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `GearX_WizRep_Actions_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  // CSV refresh
  async function handleRefreshFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setRefreshStatus('Reading file…')
    const text = await file.text()
    setRefreshStatus('Processing…')
    try {
      const res = await fetch('/api/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: text }),
      })
      const data = await res.json()
      if (data.ok) {
        setRefreshStatus(`✓ Refreshed — ${data.count} tickets loaded`)
        // Reload tickets
        const tRes = await fetch('/api/tickets')
        const tData = await tRes.json()
        setTickets(tData.tickets || [])
        setDataSource('live')
        setLastRefresh(data.refreshedAt)
        setTimeout(() => { setShowRefresh(false); setRefreshStatus('') }, 1800)
      } else {
        setRefreshStatus(`Error: ${data.error}`)
      }
    } catch {
      setRefreshStatus('Failed to upload')
    }
  }

  function toggleRow(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allPageSelected) {
      setSelected(prev => { const n = new Set(prev); paged.forEach(t => n.delete(t.id)); return n })
    } else {
      setSelected(prev => { const n = new Set(prev); paged.forEach(t => n.add(t.id)); return n })
    }
  }

  function switchTab(tab: string) {
    setActiveTab(tab)
    setPage(0)
    setSelected(new Set())
  }

  function doSearch(val: string) {
    setSearch(val)
    setPage(0)
    setSelected(new Set())
  }

  if (loading) {
    return (
      <div className="page" style={{ paddingTop: 80, textAlign: 'center', color: 'var(--text2)' }}>
        <i className="ti ti-refresh" style={{ fontSize: 32, marginBottom: 12, display: 'block', animation: 'spin 1s linear infinite' }} />
        Loading repair requests…
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  return (
    <div className="page">

      {/* Header */}
      <div className="header">
        <div className="header-left">
          <div className="logo"><i className="ti ti-clipboard-check" /></div>
          <div>
            <h1>GearX Repair Quote Review</h1>
            <div className="sub">
              AH Group · {tickets.length.toLocaleString()} awaiting disposition
              {dataSource === 'seed' && <span style={{ marginLeft: 6, color: 'var(--amber-text)' }}>· Seed data</span>}
              {lastRefresh && <span style={{ marginLeft: 6 }}>· Refreshed {new Date(lastRefresh).toLocaleDateString()}</span>}
            </div>
          </div>
        </div>
        <div className="header-right">
          {/* Sync status */}
          <span className={`sync ${syncState === 'saving' ? 'saving' : syncState === 'saved' ? 'saved' : syncState === 'error' ? 'error' : syncState === 'no-kv' ? 'no-kv' : ''}`}>
            {syncState === 'saving' && <><i className="ti ti-refresh" /> Saving…</>}
            {syncState === 'saved' && <><i className="ti ti-cloud-check" /> Saved</>}
            {syncState === 'error' && <><i className="ti ti-alert-circle" /> Error saving</>}
            {syncState === 'no-kv' && <><i className="ti ti-database-off" /> Local only</>}
          </span>
          <button className="btn btn-default" onClick={() => setShowRefresh(true)}>
            <i className="ti ti-refresh" /> Refresh data
          </button>
          <button className="btn btn-red" onClick={exportRejected}>
            <i className="ti ti-download" /> Export rejected for WizRep
          </button>
        </div>
      </div>

      {/* No KV notice */}
      {!kvEnabled && (
        <div className="kv-notice">
          <i className="ti ti-info-circle" />
          <span>Decisions are <strong>local to your browser</strong> until KV storage is configured (add <code>KV_REST_API_URL</code> + <code>KV_REST_API_TOKEN</code> env vars on Vercel). Multiple users won&apos;t see each other&apos;s decisions yet.</span>
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total RRs</div>
          <div className="stat-value">{tickets.length.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Reviewed</div>
          <div className="stat-value">{totalDecided.toLocaleString()} <span style={{ fontSize: 14, color: 'var(--text3)', fontWeight: 400 }}>({pctReviewed}%)</span></div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Approved</div>
          <div className="stat-value green">{totalApproved.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Reject / Scrap</div>
          <div className="stat-value red">{totalRejected.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending</div>
          <div className="stat-value amber">{(tickets.length - totalDecided).toLocaleString()}</div>
        </div>
      </div>

      {/* Progress */}
      <div className="progress-wrap">
        <div className="progress-label">
          <span>Review progress</span>
          <span>{pctReviewed}% complete</span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${pctReviewed}%` }} />
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {(['All', ...CATS] as string[]).map(cat => (
          <button key={cat} className={`tab ${activeTab === cat ? 'active' : ''}`} onClick={() => switchTab(cat)}>
            {CAT_LABELS[cat] || cat}
            <span className="badge">{catCounts[cat] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Over 120 banner */}
      {activeTab === 'Over 120 Days' && (
        <div className="banner">
          <i className="ti ti-alert-triangle" />
          <span>
            <strong>Scrap authorization confirmed</strong> — Ethan Flack (AH Group, VP Global Operations, Mar 6 2026) confirmed the Over 120 Days segment can be scrapped. Rejecting these will add them to the WizRep export.
          </span>
        </div>
      )}

      {/* Toolbar */}
      <div className="toolbar">
        <input
          type="text"
          placeholder="Search ticket ID, RR#, part, serial…"
          value={search}
          onChange={e => doSearch(e.target.value)}
        />
        <span className="sel-count">
          {selected.size > 0 ? `${selected.size} selected` : `${filtered.length.toLocaleString()} shown`}
        </span>
        {selected.size > 0 && (
          <>
            <button className="btn btn-sm btn-green" onClick={() => bulkDecide('approved')}>
              <i className="ti ti-check" /> Approve {selected.size}
            </button>
            <button className="btn btn-sm btn-red" onClick={() => bulkDecide('rejected')}>
              <i className="ti ti-trash" /> Reject/Scrap {selected.size}
            </button>
            <button className="btn btn-sm btn-default" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </>
        )}
        <div className="spacer" />
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>
          {filtered.filter(t => decisions[t.id] === 'rejected').length > 0 &&
            `${filtered.filter(t => decisions[t.id] === 'rejected').length} rejected in view`}
        </span>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="col-cb">
                <input type="checkbox" checked={allPageSelected} onChange={toggleAll} />
              </th>
              <th className="col-id">Ticket ID</th>
              <th className="col-rr">WizRep RR#</th>
              <th className="col-part">Part Number</th>
              <th className="col-serial">Serial</th>
              <th className="col-type">Type</th>
              <th className="col-quote" style={{ textAlign: 'right' }}>Quote</th>
              <th className="col-date">Submitted</th>
              <th className="col-aging" style={{ textAlign: 'center' }}>Aging</th>
              <th className="col-dec" style={{ textAlign: 'center' }}>Decision</th>
            </tr>
          </thead>
          <tbody>
            {paged.map(t => {
              const dec = decisions[t.id]
              return (
                <tr key={t.id}>
                  <td className="col-cb">
                    <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleRow(t.id)} />
                  </td>
                  <td className="col-id mono">{t.id}</td>
                  <td className="col-rr mono truncate" title={t.rr}>{t.rr || '—'}</td>
                  <td className="col-part truncate" title={t.part} style={{ fontSize: 11 }}>{t.part}</td>
                  <td className="col-serial mono truncate" title={t.serial} style={{ fontSize: 10 }}>{t.serial}</td>
                  <td className="col-type" style={{ fontSize: 11, color: 'var(--text2)' }}>{t.commodity}</td>
                  <td className="col-quote mono" style={{ textAlign: 'right' }}>${t.quote.toLocaleString()}</td>
                  <td className="col-date" style={{ fontSize: 11 }}>{t.quote_submitted_date}</td>
                  <td className="col-aging" style={{ textAlign: 'center' }}>
                    <span className={agingChip(t.category)}>{t.aging}d</span>
                  </td>
                  <td className="col-dec">
                    {dec === 'approved' ? (
                      <button className="dec-badge dec-approved" onClick={() => decide(t.id, 'approved')} title="Click to undo">
                        <i className="ti ti-check" /> Approved
                      </button>
                    ) : dec === 'rejected' ? (
                      <button className="dec-badge dec-rejected" onClick={() => decide(t.id, 'rejected')} title="Click to undo">
                        <i className="ti ti-trash" /> Reject/Scrap
                      </button>
                    ) : (
                      <div className="dec-btns">
                        <button className="btn btn-sm btn-green" onClick={() => decide(t.id, 'approved')} title="Approve repair">
                          <i className="ti ti-check" />
                        </button>
                        <button className="btn btn-sm btn-red" onClick={() => decide(t.id, 'rejected')} title="Reject / Scrap">
                          <i className="ti ti-trash" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
            {paged.length === 0 && (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '32px', color: 'var(--text3)' }}>
                  No tickets found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="pagination">
        <span className="page-info">
          Page {currentPage + 1} of {Math.max(1, totalPages)} · {filtered.length} tickets · {filtered.filter(t => !decisions[t.id]).length} pending
        </span>
        <div className="page-btns">
          <button className="btn btn-sm btn-default" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={currentPage === 0}>
            ← Prev
          </button>
          <button className="btn btn-sm btn-default" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={currentPage >= totalPages - 1}>
            Next →
          </button>
        </div>
      </div>

      {/* Refresh Modal */}
      {showRefresh && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowRefresh(false) }}>
          <div className="modal">
            <h2>Refresh ticket data</h2>
            <p>
              Export the latest tickets from WizRep as a CSV and upload here. The portal will automatically filter to <strong>Quote Submitted</strong> tickets for <strong>AH Group</strong> and recalculate aging.
            </p>
            <div className="drop-zone" onClick={() => fileInputRef.current?.click()}>
              <i className="ti ti-file-upload" style={{ display: 'block', marginBottom: 8 }} />
              <p>{refreshStatus || 'Click to upload WizRep CSV export'}</p>
              <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Accepts the standard Ticket export from WizRep</p>
            </div>
            <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleRefreshFile} />
            <div className="modal-footer">
              <button className="btn btn-default" onClick={() => { setShowRefresh(false); setRefreshStatus('') }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
