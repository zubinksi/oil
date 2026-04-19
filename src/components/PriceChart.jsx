import { useEffect, useRef, useState } from 'react'
import { Liveline } from 'liveline'

const COIN = 'xyz:CL'
const INTERVAL = '1m'
const HL_REST = 'https://api.hyperliquid.xyz/info'
const HL_WS = 'wss://api.hyperliquid.xyz/ws'
const CANDLE_LOOKBACK_MS = 200 * 60 * 1000
const MAX_POINTS = 200

export default function PriceChart() {
  const wsRef = useRef(null)
  const openPriceRef = useRef(null)
  const containerRef = useRef(null)

  const [points, setPoints] = useState([])
  const [dims, setDims] = useState({ w: 0, h: 0 })
  const [price, setPrice] = useState(null)
  const [change, setChange] = useState(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setDims({ w: Math.floor(width), h: Math.floor(height) })
    })
    ro.observe(el)
    setDims({ w: Math.floor(el.offsetWidth), h: Math.floor(el.offsetHeight) })
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const fetchCandles = async () => {
      try {
        const res = await fetch(HL_REST, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'candleSnapshot',
            req: { coin: COIN, interval: INTERVAL, startTime: Date.now() - CANDLE_LOOKBACK_MS, endTime: Date.now() },
          }),
        })
        const candles = await res.json()
        if (!Array.isArray(candles) || candles.length === 0) { setStatus('no-data'); return }
        // liveline expects time in seconds
        const pts = candles.map(c => ({ time: Math.floor(c.t / 1000), value: parseFloat(c.c) }))
        setPoints(pts)
        const latest = pts[pts.length - 1].value
        const dayOpen = parseFloat(candles[0].o)
        openPriceRef.current = dayOpen
        setPrice(latest)
        setChange(((latest - dayOpen) / dayOpen) * 100)
        setStatus('live')
      } catch { setStatus('error') }
    }
    fetchCandles()

    const connectWS = () => {
      const ws = new WebSocket(HL_WS)
      wsRef.current = ws
      ws.onopen = () => ws.send(JSON.stringify({
        method: 'subscribe',
        subscription: { type: 'candle', coin: COIN, interval: INTERVAL },
      }))
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.channel === 'candle' && msg.data) {
            const c = msg.data
            const closePrice = parseFloat(c.c)
            const t = Math.floor(c.t / 1000)
            setPoints(prev => {
              const last = prev[prev.length - 1]
              if (last && last.time === t) return [...prev.slice(0, -1), { time: t, value: closePrice }]
              return [...prev.slice(-MAX_POINTS + 1), { time: t, value: closePrice }]
            })
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

  const up = change === null || change >= 0
  const color = up ? '#00d084' : '#f85149'
  const changeSign = change !== null && change >= 0 ? '+' : ''

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

      <div className="chart-container" ref={containerRef}>
        {points.length > 0 && dims.w > 0 && dims.h > 0 && (
          <Liveline
            data={points}
            value={price}
            color={color}
            theme="dark"
            width={dims.w}
            height={dims.h}
            fill
            pulse
            grid
          />
        )}
      </div>

      <div className="chart-footer">
        <span className={`status-dot ${status === 'live' ? 'live' : status === 'loading' ? 'loading' : 'error'}`} />
        <span>{status === 'loading' ? 'Loading…' : status === 'live' ? 'Live' : status === 'no-data' ? 'No data' : 'Error'}</span>
        <span className="chart-footer-right">1m · Hyperliquid</span>
      </div>
    </div>
  )
}
