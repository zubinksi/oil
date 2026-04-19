// AISStream is blocked pending their domain-allowlist configuration.
// Using VesselFinder free embed (live data, same coverage area) until resolved.
// To switch back to AISStream: restore the Leaflet + WebSocket implementation.

const EMBED_URL =
  'https://www.vesselfinder.com/aismap' +
  '?lat=26.3&lon=57.2&zoom=7' +
  '&names=true&fleet=false&show_layers=false'

export default function VesselMap() {
  return (
    <div className="map-panel">
      <iframe
        src={EMBED_URL}
        className="map-container"
        frameBorder="0"
        title="Vessel traffic – Strait of Hormuz"
        allowFullScreen
      />
      <div className="map-statusbar">
        <span className="map-region">Strait of Hormuz · Gulf of Oman</span>
        <span className="map-stats">
          <span className="status-dot live" />
          Live · VesselFinder
        </span>
      </div>
    </div>
  )
}
