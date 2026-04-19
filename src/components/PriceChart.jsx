import { useEffect, useRef, useState } from 'react'
import { createChart, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts'

// Hyperliquid tradfi coin name for WTI Crude Oil (HIP-3, listed by xyz)
const COIN = 'CL'
const INTERVAL = '1m'
const HL_REST = 'https://api.hyperliquid.xyz/info'
const HL_WS = 'wss://api.hyperliquid.xyz/ws'
// Fetch last ~3 hours of 1m candles
const CANDLE_LOOKBACK_MS = 200 * 60 * 1000

export default function PriceChart() {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef(null)
  const wsRef = useRef(null)
  const openPriceRef = useRef(null)

  const [price, setPrice] = useState(null)
  const [change, setChange] = useState(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#0a0e1a' },
        textColor: '#8b949e',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#161b22' },
        horzLines: { color: '#161b22' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#484f58', labelBackgroundColor: '#21262d' },
        horzLine: { color: '#484f58', labelBackgroundColor: '#21262d' },
      },
      rightPriceScale: { borderColor: '#21262d' },
      timeScale: {
        borderColor: '#21262d',
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: false,
        fixRightEdge: false,
      },
      width: container.offsetWidth,
      height: container.offsetHeight,
    })
    chartRef.current = chart

    const series = chart.addAreaSeries({
      lineColor: '#00d084',
      topColor: 'rgba(0, 208, 132, 0.12)',
      bottomColor: 'rgba(0, 208, 132, 0)',
      lineWidth: 2,
      priceLineVisible: true,
      priceLineColor: 'rgba(0, 208, 132, 0.4)',
      priceLineWidth: 1,
      priceLineStyle: LineStyle.Dashed,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: '#00d084',
      crosshairMarkerBackgroundColor: '#0a0e1a',
    })
    seriesRef.current = series

    const ro = new ResizeObserver(() => {
      chart.applyOptions({
        width: container.offsetWidth,
        height: container.offsetHeight,
      })
    })
    ro.observe(container)

    const fetchCandles = async () => {
      try {
        const res = await fetch(HL_REST, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'candleSnapshot',
            req: {
              coin: COIN,
              interval: INTERVAL,
              startTime: Date.now() - CANDLE_LOOKBACK_MS,
              endTime: Date.now(),
            },
          }),
        })
        const candles = await res.json()
        if (!Array.isArray(candles) || candles.length === 0) {
          setStatus('no-data')
          return
        }
        const data = candles.map(c => ({
          time: Math.floor(c.t / 1000),
          value: parseFloat(c.c),
        }))
        series.setData(data)
        chart.timeScale().scrollToRealTime()

        const latest = parseFloat(candles[candles.length - 1].c)
        const dayOpen = parseFloat(candles[0].o)
        openPriceRef.current = dayOpen
        setPrice(latest)
        setChange(((latest - dayOpen) / dayOpen) * 100)
        setStatus('live')
      } catch (err) {
        console.error('[PriceChart] candle fetch failed:', err)
        setStatus('error')
      }
    }

    fetchCandles()

    const connectWS = () => {
      const ws = new WebSocket(HL_WS)
      wsRef.current = ws

      ws.onopen = () => {
        ws.send(JSON.stringify({
          method: 'subscribe',
          subscription: { type: 'candle', coin: COIN, interval: INTERVAL },
        }))
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.channel === 'candle' && msg.data) {
            const c = msg.data
            const closePrice = parseFloat(c.c)
            seriesRef.current?.update({
              time: Math.floor(c.t / 1000),
              value: closePrice,
            })
            setPrice(closePrice)
            if (openPriceRef.current) {
              setChange(((closePrice - openPriceRef.current) / openPriceRef.current) * 100)
            }
          }
        } catch {}
      }

      ws.onclose = () => setTimeout(connectWS, 3000)
      ws.onerror = () => ws.close()
    }

    connectWS()

    return () => {
      ro.disconnect()
      wsRef.current?.close()
      chart.remove()
    }
  }, [])

  const up = change === null || change >= 0
  const priceColor = up ? '#00d084' : '#f85149'
  const changeSign = change !== null && change >= 0 ? '+' : ''

  const statusLabel = {
    loading: 'Loading…',
    live: 'Live',
    'no-data': 'No data',
    error: 'Error',
  }[status] ?? status

  return (
    <div className="chart-panel">
      <div className="chart-header">
        <div className="chart-title">
          WTIOIL
          <span className="chart-subtitle">WTI Crude Oil · Hyperliquid</span>
        </div>
        <div className="chart-price" style={{ color: priceColor }}>
          {price !== null ? `$${price.toFixed(2)}` : '—'}
          {change !== null && (
            <span className="chart-change">
              {changeSign}{change.toFixed(2)}%
            </span>
          )}
        </div>
      </div>

      <div className="chart-container" ref={containerRef} />

      <div className="chart-footer">
        <span className={`status-dot ${status === 'live' ? 'live' : status === 'loading' ? 'loading' : 'error'}`} />
        <span>{statusLabel}</span>
        <span className="chart-footer-right">1m · Hyperliquid</span>
      </div>
    </div>
  )
}
