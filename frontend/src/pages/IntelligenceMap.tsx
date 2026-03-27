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

// Prospect company type → color (must match server.py _type_to_color)
const PROSPECT_TYPE_COLORS: { label: string; color: string; shape: 'circle' }[] = [
  { label: 'Facilities Management', color: '#3b82f6', shape: 'circle' },
  { label: 'Venue / Events',        color: '#8b5cf6', shape: 'circle' },
  { label: 'Corporate',             color: '#06b6d4', shape: 'circle' },
  { label: 'Prime Contractor',      color: '#f97316', shape: 'circle' },
  { label: 'Local Authority',       color: '#10b981', shape: 'circle' },
  { label: 'Other Prospect',        color: '#6b7280', shape: 'circle' },
]

// Score-based classification colours (from server.py _score_to_color)
const SCORE_COLORS: { label: string; color: string }[] = [
  { label: 'HOT (score ≥ 60)',    color: '#ef4444' },
  { label: 'WARM (score ≥ 40)',   color: '#f59e0b' },
  { label: 'MONITOR (score ≥ 20)', color: '#22c55e' },
  { label: 'LOW (score < 20)',    color: '#94a3b8' },
]

export default function IntelligenceMap() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const markersLayerRef = useRef<L.LayerGroup | null>(null)

  const [layers, setLayers] = useState<LayerToggle[]>([
    { id: 'prospect',   label: 'Prospects',   color: '#3b82f6', enabled: true },
    { id: 'competitor', label: 'Competitors', color: '#ef4444', enabled: true },
    { id: 'tender',     label: 'Tenders',     color: '#f59e0b', enabled: true },
  ])

  const [selectedFeature, setSelectedFeature] = useState<Record<string, string | number | null> | null>(null)
  const [showLegend, setShowLegend] = useState(true)

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
          .bindTooltip(`<b>${name}</b><br/><span style="color:#9ca3af">${subtitle}</span>`, {
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
          <button
            onClick={() => setShowLegend(v => !v)}
            className="px-2.5 py-1 rounded-full text-xs transition-all"
            style={{
              background: showLegend ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
              border: '1px solid #374151',
              color: '#9ca3af',
            }}
          >
            Legend
          </button>
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
              {selectedFeature.company_type && (
                <div className="flex justify-between text-xs">
                  <span style={{ color: '#6b7280' }}>Type</span>
                  <span style={{ color: '#f9fafb' }}>{selectedFeature.company_type}</span>
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
              {selectedFeature.sic_codes && (
                <div className="flex justify-between text-xs">
                  <span style={{ color: '#6b7280' }}>SIC</span>
                  <span className="font-mono" style={{ color: '#9ca3af' }}>{selectedFeature.sic_codes}</span>
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

        {/* Comprehensive Legend */}
        {showLegend && (
          <div
            className="absolute bottom-4 left-4 rounded-xl border p-4"
            style={{ background: 'rgba(13,17,23,0.95)', borderColor: '#374151', zIndex: 1000, minWidth: 220 }}
          >
            <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#6b7280' }}>Map Legend</p>

            {/* Layer types */}
            <p className="text-xs font-semibold mb-1.5" style={{ color: '#4b5563' }}>LAYER TYPES</p>
            <div className="space-y-1.5 mb-3">
              <div className="flex items-center gap-2">
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />
                <span className="text-xs" style={{ color: '#9ca3af' }}>Prospect (circle)</span>
              </div>
              <div className="flex items-center gap-2">
                <div style={{ width: 8, height: 8, borderRadius: 2, background: '#ef4444', transform: 'rotate(45deg)', flexShrink: 0 }} />
                <span className="text-xs" style={{ color: '#9ca3af' }}>Competitor (diamond)</span>
              </div>
              <div className="flex items-center gap-2">
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
                <span className="text-xs" style={{ color: '#9ca3af' }}>Tender (large circle)</span>
              </div>
            </div>

            {/* Prospect colours by company type */}
            <p className="text-xs font-semibold mb-1.5" style={{ color: '#4b5563' }}>PROSPECT COLOURS</p>
            <div className="space-y-1.5 mb-3">
              {PROSPECT_TYPE_COLORS.map(({ label, color }) => (
                <div key={label} className="flex items-center gap-2">
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <span className="text-xs" style={{ color: '#9ca3af' }}>{label}</span>
                </div>
              ))}
            </div>

            {/* Tender score colours */}
            <p className="text-xs font-semibold mb-1.5" style={{ color: '#4b5563' }}>TENDER SCORE</p>
            <div className="space-y-1.5">
              {SCORE_COLORS.map(({ label, color }) => (
                <div key={label} className="flex items-center gap-2">
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <span className="text-xs" style={{ color: '#9ca3af' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Coverage stats overlay */}
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
