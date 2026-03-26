import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Button } from '../components/ui'
import { Layers, RefreshCw } from 'lucide-react'
import type * as L from 'leaflet'

interface LayerToggle {
  id: string
  label: string
  color: string
  enabled: boolean
}

export default function IntelligenceMap() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const markersLayerRef = useRef<L.LayerGroup | null>(null)

  const [layers, setLayers] = useState<LayerToggle[]>([
    { id: 'prospect', label: 'Prospects', color: '#3b82f6', enabled: true },
    { id: 'competitor', label: 'Competitors', color: '#ef4444', enabled: true },
    { id: 'tender', label: 'Tenders', color: '#f59e0b', enabled: true },
  ])

  const [selectedFeature, setSelectedFeature] = useState<Record<string, string | number | null> | null>(null)

  const { data: mapData, refetch, isFetching } = useQuery({
    queryKey: ['map-all'],
    queryFn: () => api.mapAll({ prospect_limit: 300, competitor_limit: 200 }),
    refetchInterval: 120_000,
  })

  // Init map
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
        zoom: 11,
        zoomControl: true,
      })

      Lmod.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      const markersLayer = Lmod.layerGroup().addTo(map)
      markersLayerRef.current = markersLayer
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

  // Update markers when data or layers change
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current || !mapData?.features) return

    const updateMarkers = async () => {
      const leaflet = await import('leaflet')
      const Lmod = leaflet.default ?? leaflet
      const markersLayer = markersLayerRef.current!
      markersLayer.clearLayers()

      const enabledTypes = new Set(layers.filter(l => l.enabled).map(l => l.id))

      mapData.features.forEach(feature => {
        if (!feature.geometry?.coordinates) return
        const [lng, lat] = feature.geometry.coordinates
        const props = feature.properties
        const markerType = String(props.marker_type || '')

        if (!enabledTypes.has(markerType)) return

        const color = String(props.marker_color || '#3b82f6')
        const size = markerType === 'tender' ? 12 : 8

        const icon = Lmod.divIcon({
          className: '',
          html: `<div style="
            width:${size}px;height:${size}px;
            border-radius:${markerType === 'competitor' ? '2px' : '50%'};
            background:${color};
            border:1.5px solid rgba(255,255,255,0.4);
            box-shadow:0 0 6px ${color}60;
            transform:${markerType === 'competitor' ? 'rotate(45deg)' : 'none'}
          "></div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        })

        const name = String(props.name || props.title || props.buyer || 'Unknown')
        const subtitle = String(props.company_type || props.classification || props.marker_type || '')

        Lmod.marker([lat, lng], { icon })
          .on('click', () => {
            const safeProps: Record<string, string | number | null> = {}
            Object.entries(props).forEach(([k, v]) => {
              if (v === null || v === undefined) safeProps[k] = null
              else if (typeof v === 'string' || typeof v === 'number') safeProps[k] = v
              else safeProps[k] = String(v)
            })
            setSelectedFeature({ ...safeProps, name, subtitle })
          })
          .bindTooltip(name, {
            direction: 'top',
            offset: [0, -size / 2],
          })
          .addTo(markersLayer)
      })
    }

    updateMarkers()
  }, [mapData, layers])

  const toggleLayer = (id: string) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, enabled: !l.enabled } : l))
  }

  const enabledCount = layers.filter(l => l.enabled).reduce((sum, l) => {
    if (!mapData?.features) return sum
    return sum + mapData.features.filter(f => f.properties.marker_type === l.id).length
  }, 0)

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
        style={{ background: '#0d1117', borderColor: '#1f2937' }}
      >
        <div>
          <h1 className="text-sm font-bold tracking-wide" style={{ color: '#f9fafb' }}>INTELLIGENCE MAP</h1>
          <p className="text-xs" style={{ color: '#6b7280' }}>{enabledCount} features visible · London</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Layers size={12} style={{ color: '#6b7280' }} />
            {layers.map(layer => (
              <button
                key={layer.id}
                onClick={() => toggleLayer(layer.id)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-all"
                style={{
                  background: layer.enabled ? `${layer.color}20` : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${layer.enabled ? layer.color + '40' : '#374151'}`,
                  color: layer.enabled ? layer.color : '#6b7280',
                }}
              >
                <div
                  className="rounded-full"
                  style={{ width: 6, height: 6, background: layer.enabled ? layer.color : '#374151' }}
                />
                {layer.label}
              </button>
            ))}
          </div>
          <Button size="sm" variant="ghost" onClick={() => refetch()} loading={isFetching}>
            <RefreshCw size={12} />
          </Button>
        </div>
      </div>

      {/* Map container */}
      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        <div
          ref={mapRef}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />

        {/* Feature detail panel */}
        {selectedFeature && (
          <div
            className="absolute top-4 right-4 rounded-xl border p-4 shadow-2xl"
            style={{ background: '#111827', borderColor: '#374151', width: 280, zIndex: 1000 }}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-sm font-semibold" style={{ color: '#f9fafb' }}>
                  {String(selectedFeature.name ?? '')}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>
                  {String(selectedFeature.subtitle ?? selectedFeature.marker_type ?? '')}
                </p>
              </div>
              <button onClick={() => setSelectedFeature(null)} style={{ color: '#6b7280' }}>✕</button>
            </div>
            <div className="space-y-1.5">
              {selectedFeature.score != null && (
                <div className="flex justify-between text-xs">
                  <span style={{ color: '#6b7280' }}>Score</span>
                  <span style={{ color: '#f9fafb' }}>{selectedFeature.score}</span>
                </div>
              )}
              {selectedFeature.region && (
                <div className="flex justify-between text-xs">
                  <span style={{ color: '#6b7280' }}>Region</span>
                  <span style={{ color: '#f9fafb' }}>{selectedFeature.region}</span>
                </div>
              )}
              {selectedFeature.classification && (
                <div className="flex justify-between text-xs">
                  <span style={{ color: '#6b7280' }}>Classification</span>
                  <span style={{ color: '#f9fafb' }}>{selectedFeature.classification}</span>
                </div>
              )}
              {selectedFeature.deadline && (
                <div className="flex justify-between text-xs">
                  <span style={{ color: '#6b7280' }}>Deadline</span>
                  <span style={{ color: '#f9fafb' }}>{selectedFeature.deadline}</span>
                </div>
              )}
              {selectedFeature.address && (
                <div className="flex justify-between text-xs">
                  <span style={{ color: '#6b7280' }}>Address</span>
                  <span className="text-right" style={{ color: '#f9fafb', maxWidth: 160 }}>{selectedFeature.address}</span>
                </div>
              )}
              {selectedFeature.link && (
                <a
                  href={String(selectedFeature.link)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mt-2 text-xs text-center py-1.5 rounded"
                  style={{ background: 'rgba(59,130,246,0.2)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}
                >
                  View Details →
                </a>
              )}
            </div>
          </div>
        )}

        {/* Legend */}
        <div
          className="absolute bottom-4 left-4 rounded-xl border p-3"
          style={{ background: 'rgba(13,17,23,0.9)', borderColor: '#374151', zIndex: 1000 }}
        >
          <p className="text-xs font-semibold mb-2" style={{ color: '#6b7280' }}>LEGEND</p>
          {layers.map(l => (
            <div key={l.id} className="flex items-center gap-2 mb-1">
              <div style={{
                width: 8, height: 8,
                borderRadius: l.id === 'competitor' ? 2 : '50%',
                background: l.color,
                transform: l.id === 'competitor' ? 'rotate(45deg)' : 'none',
              }} />
              <span className="text-xs" style={{ color: '#9ca3af' }}>{l.label}</span>
            </div>
          ))}
        </div>

        {/* Stats overlay */}
        {mapData?.metadata && (
          <div
            className="absolute bottom-4 right-4 rounded-xl border p-3"
            style={{ background: 'rgba(13,17,23,0.9)', borderColor: '#374151', zIndex: 1000 }}
          >
            <p className="text-xs font-semibold mb-2" style={{ color: '#6b7280' }}>COVERAGE</p>
            <div className="space-y-1">
              {Object.entries(mapData.metadata.layers).map(([type, count]) => (
                <div key={type} className="flex justify-between gap-4 text-xs">
                  <span style={{ color: '#6b7280' }}>{type}</span>
                  <span className="font-mono" style={{ color: '#f9fafb' }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
