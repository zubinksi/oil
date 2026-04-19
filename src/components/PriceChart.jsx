import { useEffect, useRef, useState } from 'react'
import { Liveline } from 'liveline'

const COIN = 'xyz:CL'
const HL_REST = 'https://api.hyperliquid.xyz/info'
const HL_WS = 'wss://api.hyperliquid.xyz/ws'

const WINDOWS = [
  { label: '3h', secs: 3 * 60 * 60,      interval: '1m', lookbackMs: 3 * 60 * 60 * 1000 },
  { label: '1d', secs: 24 * 60 * 60,     interval: '5m', lookbackMs: 24 * 60 * 60 * 1000 },
  { label: '1w', secs: 7 * 24 * 60 * 60, interval: '1h', lookbackMs: 7 * 24 * 60 * 60 * 1000 },
]

export default function PriceChart() {
  const wsRef = useRef(null)
  const openPriceRef = useRef(null)
  const activeWindowRef = useRef(WINDOWS[0])

  const [points, setPoints] = useState([])
  const [price, setPrice] = useState(null)
  const [change, setChange] = useState(null)
  const [status, setStatus] = useState('loading')
  const [activeWindow, setActiveWindow] = useState(WINDOWS[0])

  const fetchCandles = async (cfg) => {
    setStatus('loading')
    try {
      const res = await fetch(HL_REST, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'candleSnapshot',
          req: { coin: COIN, interval: cfg.interval, startTime: Date.now() - cfg.lookbackMs, endTime: Date.now() },
        }),
      })
      const candles = await res.json()
      if (!Array.isArray(candles) || candles.length === 0) { setStatus('no-data'); return }
      const pts = candles.map(c => ({ time: Math.floor(c.t / 1000), value: parseFloat(c.c) }))
      setPoints(pts)
      const latest = pts[pts.length - 1].value
      const periodOpen = parseFloat(candles[0].o)
      openPriceRef.current = periodOpen
      setPrice(latest)
      setChange(((latest - periodOpen) / periodOpen) * 100)
      setStatus('live')
    } catch { setStatus('error') }
  }

  // Initial load + 1m WebSocket for live price
  useEffect(() => {
    fetchCandles(WINDOWS[0])

    const connectWS = () => {
      const ws = new WebSocket(HL_WS)
      wsRef.current = ws
      ws.onopen = () => ws.send(JSON.stringify({
        method: 'subscribe',
        subscription: { type: 'candle', coin: COIN, interval: '1m' },
      }))
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.channel === 'candle' && msg.data) {
            const c = msg.data
            const closePrice = parseFloat(c.c)
            const t = Math.floor(c.t / 1000)
            // Update chart points only when on 1m view
            if (activeWindowRef.current.interval === '1m') {
              setPoints(prev => {
                const last = prev[prev.length - 1]
                if (last && last.time === t) return [...prev.slice(0, -1), { time: t, value: closePrice }]
                return [...prev.slice(-200 + 1), { time: t, value: closePrice }]
              })
            }
            setPrice(closePrice)
            if (openPriceRef.current) setChange(((closePrice - openPriceRef.current) / openPriceRef.current) * 100)
          }
        } catch {}
      }
      ws.onclose = () => setTimeout(connectWS, 3000)
      ws.onerror = () => ws.close()
    }
    connectWS()
    return () => wsRef.current?.close()
  }, [])

  const handleWindowChange = (secs) => {
    const cfg = WINDOWS.find(w => w.secs === secs)
    if (!cfg) return
    activeWindowRef.current = cfg
    setActiveWindow(cfg)
    fetchCandles(cfg)
  }

  const up = change === null || change >= 0
  const color = up ? '#00d084' : '#f85149'
  const changeSign = change !== null && change >= 0 ? '+' : ''

  const windowSecs = points.length >= 2
    ? points[points.length - 1].time - points[0].time
    : activeWindow.secs

  return (
    <div className="chart-panel">
      <div className="chart-header">
        <div className="chart-title">
          WTIOIL
          <span className="chart-subtitle">WTI Crude Oil · Hyperliquid</span>
        </div>
        <div className="chart-price" style={{ color }}>
          {price !== null ? `$${price.toFixed(2)}` : '—'}
          {change !== null && (
            <span className="chart-change">{changeSign}{change.toFixed(2)}%</span>
          )}
        </div>
      </div>

      <div className="chart-container">
        <Liveline
          data={points}
          value={price ?? 0}
          color={color}
          theme="dark"
          window={windowSecs}
          windows={WINDOWS.map(w => ({ label: w.label, secs: w.secs }))}
          onWindowChange={handleWindowChange}
          loading={status === 'loading'}
          fill
          pulse
          grid
          exaggerate
          formatValue={v => `$${v.toFixed(2)}`}
        />
      </div>

      <div className="chart-footer">
        <span className={`status-dot ${status === 'live' ? 'live' : status === 'loading' ? 'loading' : 'error'}`} />
        <span>{status === 'loading' ? 'Loading…' : status === 'live' ? 'Live' : status === 'no-data' ? 'No data' : 'Error'}</span>
        <span className="chart-footer-right">{activeWindow.interval} · Hyperliquid</span>
      </div>
    </div>
  )
}
