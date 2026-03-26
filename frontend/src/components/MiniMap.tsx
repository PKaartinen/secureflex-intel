import { useEffect, useRef } from 'react'
import type { GeoJSONCollection } from '../lib/api'
import type * as L from 'leaflet'

interface MiniMapProps {
  data?: GeoJSONCollection
}

export default function MiniMap({ data }: MiniMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!mapRef.current) return

    const init = async () => {
      const leaflet = await import('leaflet')
      const Lmod = leaflet.default ?? leaflet

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
      }

      const map = Lmod.map(mapRef.current!, {
        center: [51.5074, -0.1278],
        zoom: 10,
        zoomControl: false,
        attributionControl: false,
      })

      Lmod.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
      }).addTo(map)

      mapInstanceRef.current = map
    }

    init()

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!mapInstanceRef.current || !data?.features) return

    const addMarkers = async () => {
      const leaflet = await import('leaflet')
      const Lmod = leaflet.default ?? leaflet
      const m = mapInstanceRef.current!

      // Clear existing layers (except tile layer)
      m.eachLayer((layer) => {
        if (!(layer instanceof Lmod.TileLayer)) {
          m.removeLayer(layer)
        }
      })

      data.features.forEach(feature => {
        if (!feature.geometry?.coordinates) return
        const [lng, lat] = feature.geometry.coordinates
        const props = feature.properties
        const color = props.marker_color || '#3b82f6'

        const icon = Lmod.divIcon({
          className: '',
          html: `<div style="width:8px;height:8px;border-radius:50%;background:${color};border:1px solid rgba(255,255,255,0.3);box-shadow:0 0 4px ${color}80"></div>`,
          iconSize: [8, 8],
          iconAnchor: [4, 4],
        })

        const name = String(props.name || props.title || props.buyer || 'Unknown')
        const type = String(props.marker_type || 'unknown')

        Lmod.marker([lat, lng], { icon })
          .bindPopup(`<div style="font-size:12px"><strong>${name}</strong><br/><span style="color:#9ca3af">${type}</span></div>`)
          .addTo(m)
      })
    }

    addMarkers()
  }, [data])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={mapRef}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: '0 0 12px 12px', overflow: 'hidden' }}
      />
    </div>
  )
}
