import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'

const AISSTREAM_KEY = 'cbddefbb079f6976839f9afc28408b984ab0309f'
// Strait of Hormuz through Gulf of Oman entrance
const BOUNDING_BOX = [[[22.0, 55.0], [28.0, 62.0]]]
const MAP_CENTER = [26.0, 57.5]
const MAP_ZOOM = 7

// AIS ship type code → colour
function shipColor(shipType) {
  if (shipType >= 80 && shipType <= 89) return '#e05c5c' // tanker
  if (shipType >= 70 && shipType <= 79) return '#4ecdc4' // cargo
  if (shipType >= 60 && shipType <= 69) return '#6b9fff' // passenger
  if (shipType >= 30 && shipType <= 32) return '#f6c90e' // fishing
  return '#94a3b8'                                        // other
}

function vesselIcon(heading, shipType) {
  const color = shipColor(shipType ?? 0)
  const h = Number.isFinite(heading) && heading < 360 ? heading : 0
  return L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14">
      <polygon points="7,1 12,13 7,10 2,13"
        fill="${color}" stroke="#0a0e1a" stroke-width="0.8"
        transform="rotate(${h},7,7)"/>
    </svg>`,
    className: '',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  })
}

export default function VesselMap() {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const markers = useRef(new Map())   // mmsi → { marker, shipType }
  const wsRef = useRef(null)

  const [count, setCount] = useState(0)
  const [wsStatus, setWsStatus] = useState('loading')
  const [lastUpdate, setLastUpdate] = useState(null)

  useEffect(() => {
    const map = L.map(mapRef.current, {
      center: MAP_CENTER,
      zoom: MAP_ZOOM,
      zoomControl: true,
      attributionControl: true,
    })

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
        '© <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map)

    mapInstance.current = map

    const connect = () => {
      const ws = new WebSocket('wss://stream.aisstream.io/v0/stream')
      wsRef.current = ws

      ws.onopen = () => {
        ws.send(JSON.stringify({
          Apikey: AISSTREAM_KEY,
          BoundingBoxes: BOUNDING_BOX,
          FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
        }))
        setWsStatus('live')
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)

          if (msg.MessageType === 'ShipStaticData') {
            const mmsi = String(msg.Message.ShipStaticData.UserID)
            const entry = markers.current.get(mmsi)
            if (entry) {
              entry.shipType = msg.Message.ShipStaticData.Type
              // refresh icon colour
              const { lat, lon, heading } = entry
              if (lat !== undefined) {
                entry.marker.setIcon(vesselIcon(heading, entry.shipType))
              }
            }
            return
          }

          if (msg.MessageType !== 'PositionReport') return

          const pos = msg.Message.PositionReport
          const meta = msg.MetaData ?? {}
          const mmsi = String(pos.UserID)
          const lat = pos.Latitude
          const lon = pos.Longitude

          if (!lat || !lon || lat === 0 || lon === 0) return
          // Filter out obviously invalid coords
          if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return

          const heading = (pos.TrueHeading >= 0 && pos.TrueHeading < 360)
            ? pos.TrueHeading
            : (pos.Cog ?? 0)
          const name = (meta.ShipName ?? '').trim() || mmsi

          const existing = markers.current.get(mmsi)
          const shipType = existing?.shipType ?? undefined
          const icon = vesselIcon(heading, shipType)

          if (existing) {
            existing.marker.setLatLng([lat, lon])
            existing.marker.setIcon(icon)
            existing.lat = lat
            existing.lon = lon
            existing.heading = heading
          } else {
            const marker = L.marker([lat, lon], { icon })
              .bindTooltip(name, {
                permanent: true,
                className: 'vessel-label',
                direction: 'right',
                offset: [9, 0],
              })
            marker.addTo(map)
            markers.current.set(mmsi, { marker, shipType: undefined, lat, lon, heading })
            setCount(markers.current.size)
          }

          setLastUpdate(new Date())
        } catch {}
      }

      ws.onclose = () => {
        setWsStatus('loading')
        setTimeout(connect, 4000)
      }

      ws.onerror = () => {
        setWsStatus('error')
        ws.close()
      }
    }

    connect()

    return () => {
      wsRef.current?.close()
      map.remove()
    }
  }, [])

  const timeStr = lastUpdate
    ? lastUpdate.toUTCString().replace(/ GMT$/, ' UTC')
    : 'Connecting…'

  return (
    <div className="map-panel">
      <div ref={mapRef} className="map-container" />
      <div className="map-statusbar">
        <span className="map-region">Strait of Hormuz · Gulf of Oman</span>
        <span className="map-stats">
          <span className={`status-dot ${wsStatus}`} />
          {count > 0 ? `${count} vessels · ` : ''}{timeStr}
        </span>
      </div>
    </div>
  )
}
