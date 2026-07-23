'use client'

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import type { FieldRow } from '@/lib/fields'
import type { AnnotationRow } from '@/lib/annotations'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''
const SAT_TILES = `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${MAPBOX_TOKEN}`
const SELECTED_COLOR = '#E8A33D'

// No-WebGL map for old computers, built on Leaflet — image tiles + DOM/SVG
// rendering, the architecture that ran on 2005 hardware. Full feature parity
// is the contract: view (both styles), select, DRAW blocks, reshape a block,
// reference lines (point-to-point AND freehand), text labels, delete
// annotations, GPS. Same lat/lng in, same lat/lng out as the Mapbox map —
// only the renderer differs.
export default function LiteMap({
  fields,
  selectedFieldId,
  onSelectField,
  stageColorMap,
  onCreateField,
  onUpdateField,
  annotations = [],
  onCreateAnnotation,
  onDeleteAnnotation,
  colorBy = 'stage',
  varietyColors = {},
  highlightColor = null,
  filterIds = null,
  visibleIds = null,
  whiteMap = false,
  readOnly = false,
}: {
  fields: FieldRow[]
  selectedFieldId: string | null
  onSelectField: (id: string | null) => void
  stageColorMap: Record<string, string>
  onCreateField?: (geometry: GeoJSON.Polygon) => Promise<void>
  onUpdateField?: (id: string, geometry: GeoJSON.Polygon) => Promise<void>
  annotations?: AnnotationRow[]
  onCreateAnnotation?: (
    kind: 'line' | 'text',
    geometry: GeoJSON.LineString | GeoJSON.Point,
    text?: string,
    style?: { size?: number; rotation?: number; width?: number },
  ) => Promise<void>
  onDeleteAnnotation?: (id: string) => Promise<void>
  colorBy?: 'stage' | 'variety'
  varietyColors?: Record<string, string>
  highlightColor?: string | null
  filterIds?: Set<string> | null
  visibleIds?: Set<string> | null
  whiteMap?: boolean
  readOnly?: boolean
}) {
  const holderRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const blocksRef = useRef<L.LayerGroup | null>(null)
  const annosRef = useRef<L.LayerGroup | null>(null)
  const satLayerRef = useRef<L.TileLayer | null>(null)
  const gpsRef = useRef<{ marker: L.CircleMarker; ring: L.Circle } | null>(null)
  const editTargetRef = useRef<L.Polygon | null>(null)
  const [mode, setMode] = useState<'crop' | 'satellite'>('crop')
  const [tool, setTool] = useState<'none' | 'block' | 'line' | 'freehand' | 'text'>('none')
  const [editingShape, setEditingShape] = useState(false)
  const [textDraft, setTextDraft] = useState<{ lng: number; lat: number; value: string } | null>(null)
  const [gpsOn, setGpsOn] = useState(false)
  const [zoomTick, setZoomTick] = useState(0)

  // Refs mirror the props/state the imperative Leaflet handlers need — the
  // map is created once; handlers must read current values.
  const live = useRef({ tool, onSelectField, onCreateField, onCreateAnnotation })
  live.current = { tool, onSelectField, onCreateField, onCreateAnnotation }

  // ── map lifecycle ──────────────────────────────────────────────────
  useEffect(() => {
    if (!holderRef.current || mapRef.current) return
    const map = L.map(holderRef.current, {
      zoomControl: true,
      attributionControl: false,
      // canvas renderer: fastest non-GPU path for hundreds of polygons
      preferCanvas: true,
    })
    mapRef.current = map
    blocksRef.current = L.layerGroup().addTo(map)
    annosRef.current = L.layerGroup().addTo(map)

    // fit the farm (or south Louisiana for an empty one)
    const pts: [number, number][] = []
    for (const f of fields)
      for (const ring of f.geometry?.coordinates ?? [])
        for (const [lng, lat] of ring) pts.push([lat, lng])
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.06))
    else map.setView([29.9, -90.8], 12)

    map.pm.setGlobalOptions({ allowSelfIntersection: false })

    // geoman draw finishes → same pipelines as the full map
    map.on('pm:create', (e: { layer: L.Layer }) => {
      const t = live.current.tool
      const layer = e.layer as L.Polygon | L.Polyline
      const gj = layer.toGeoJSON() as GeoJSON.Feature
      map.removeLayer(layer) // the authoritative copy comes back via refresh
      if (t === 'block' && gj.geometry.type === 'Polygon' && live.current.onCreateField) {
        void live.current.onCreateField(gj.geometry as GeoJSON.Polygon)
      } else if (t === 'line' && gj.geometry.type === 'LineString' && live.current.onCreateAnnotation) {
        void live.current.onCreateAnnotation('line', gj.geometry as GeoJSON.LineString)
      }
      setTool('none')
    })

    const onZoomEnd = () => setZoomTick((n) => n + 1)
    map.on('zoomend', onZoomEnd)

    return () => {
      map.off('zoomend', onZoomEnd)
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── basemap mode ───────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (mode === 'satellite' && MAPBOX_TOKEN) {
      if (!satLayerRef.current)
        satLayerRef.current = L.tileLayer(SAT_TILES, { maxZoom: 20, tileSize: 512, zoomOffset: -1 })
      satLayerRef.current.addTo(map)
      map.getContainer().style.background = '#0b1220'
    } else {
      satLayerRef.current?.remove()
      map.getContainer().style.background = '#FFFFFF'
    }
  }, [mode])

  // ── blocks layer (rebuilt on input change — cheap without a GPU) ───
  useEffect(() => {
    const map = mapRef.current
    const group = blocksRef.current
    if (!map || !group) return
    group.clearLayers()
    editTargetRef.current = null
    const sat = mode === 'satellite'
    const shown = visibleIds ? fields.filter((f) => visibleIds.has(f.id)) : fields
    const showLabels = map.getZoom() >= 14
    for (const f of shown) {
      const sel = f.id === selectedFieldId
      // Mirrors the full map's fillColorExpression: selected > plain/white >
      // fly-plan color > variety palette > stage palette.
      const fill = sel
        ? SELECTED_COLOR
        : whiteMap || (filterIds && !filterIds.has(f.id))
          ? '#FFFFFF'
          : highlightColor
            ? highlightColor
            : colorBy === 'variety'
              ? (varietyColors[f.variety ?? ''] ?? '#e5e7eb')
              : ((f.current_ratoon && stageColorMap[f.current_ratoon]) || '#e5e7eb')
      const latlngs = (f.geometry?.coordinates ?? []).map((ring) =>
        ring.map(([lng, lat]) => [lat, lng] as [number, number]),
      )
      const poly = L.polygon(latlngs, {
        color: sel ? '#111827' : sat ? '#facc15' : '#374151',
        weight: sel ? 3 : sat ? 1.5 : 1,
        fillColor: fill,
        fillOpacity: sat ? (sel ? 0.35 : 0.08) : 0.9,
      })
      poly.on('click', (ev) => {
        if (live.current.tool !== 'none') return
        L.DomEvent.stopPropagation(ev)
        live.current.onSelectField(f.id)
      })
      if (showLabels) {
        poly.bindTooltip(f.name, {
          permanent: true,
          direction: 'center',
          className: sat ? 'lite-label lite-label-sat' : 'lite-label',
        })
      }
      poly.addTo(group)
      // reshape mode for the selected block — geoman vertex editing
      if (sel && editingShape && onUpdateField && !readOnly) {
        poly.pm.enable({ allowSelfIntersection: false })
        editTargetRef.current = poly
      }
    }
  }, [fields, selectedFieldId, mode, colorBy, varietyColors, highlightColor, filterIds, visibleIds, whiteMap, stageColorMap, editingShape, onUpdateField, readOnly, zoomTick])

  // ── annotations layer ──────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    const group = annosRef.current
    if (!map || !group) return
    group.clearLayers()
    // Ground-true scaling, matching the full map: annotations double per zoom
    // level, anchored at z15.
    const groundScale = Math.pow(2, map.getZoom() - 15)
    for (const a of annotations) {
      if (a.kind === 'line' && a.geometry.type === 'LineString') {
        const line = L.polyline(
          a.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
          { color: a.color, weight: Math.max(0.5, (a.width ?? 3) * groundScale) },
        )
        if (!readOnly && onDeleteAnnotation) {
          line.on('click', (ev) => {
            if (live.current.tool !== 'none') return
            L.DomEvent.stopPropagation(ev)
            const p = L.popup()
              .setLatLng(ev.latlng)
              .setContent(
                deleteButton(() => {
                  void onDeleteAnnotation(a.id)
                  map.closePopup(p)
                }),
              )
              .openOn(map)
          })
        }
        line.addTo(group)
      } else if (a.kind === 'text' && a.geometry.type === 'Point') {
        const [lng, lat] = a.geometry.coordinates
        const marker = L.marker([lat, lng], {
          icon: L.divIcon({
            className: 'lite-text-anno',
            html: `<span style="color:${a.color};font-size:${Math.max(2, a.size * groundScale)}px;font-weight:700;transform:rotate(${a.rotation}deg);display:inline-block;white-space:nowrap;text-shadow:0 0 3px #fff,0 0 3px #fff">${escapeHtml(a.text ?? '')}</span>`,
          }),
          interactive: !readOnly && !!onDeleteAnnotation,
        })
        if (!readOnly && onDeleteAnnotation) {
          marker.on('click', () => {
            const p = L.popup()
              .setLatLng([lat, lng])
              .setContent(
                deleteButton(() => {
                  void onDeleteAnnotation(a.id)
                  map.closePopup(p)
                }),
              )
              .openOn(map)
          })
        }
        marker.addTo(group)
      }
    }
  }, [annotations, readOnly, onDeleteAnnotation, zoomTick])

  // ── drawing tools ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.pm.disableDraw()
    if (tool === 'block') map.pm.enableDraw('Polygon', { snappable: true })
    else if (tool === 'line') map.pm.enableDraw('Line', { snappable: false })

    // freehand line: press-and-drag capture
    if (tool === 'freehand') {
      map.dragging.disable()
      let pts: [number, number][] = []
      let down = false
      const onDown = (e: L.LeafletMouseEvent) => {
        down = true
        pts = [[e.latlng.lng, e.latlng.lat]]
      }
      const onMove = (e: L.LeafletMouseEvent) => {
        if (down) pts.push([e.latlng.lng, e.latlng.lat])
      }
      const onUp = () => {
        if (down && pts.length > 2 && live.current.onCreateAnnotation) {
          void live.current.onCreateAnnotation('line', { type: 'LineString', coordinates: pts })
        }
        down = false
        setTool('none')
      }
      map.on('mousedown', onDown)
      map.on('mousemove', onMove)
      map.on('mouseup', onUp)
      return () => {
        map.off('mousedown', onDown)
        map.off('mousemove', onMove)
        map.off('mouseup', onUp)
        map.dragging.enable()
      }
    }

    // text label: click to place, then type in the draft panel
    if (tool === 'text') {
      const onClick = (e: L.LeafletMouseEvent) => {
        setTextDraft({ lng: e.latlng.lng, lat: e.latlng.lat, value: '' })
        setTool('none')
      }
      map.on('click', onClick)
      return () => {
        map.off('click', onClick)
      }
    }
  }, [tool])

  // ── GPS ────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!gpsOn) {
      gpsRef.current?.marker.remove()
      gpsRef.current?.ring.remove()
      gpsRef.current = null
      return
    }
    const watch = navigator.geolocation?.watchPosition(
      (pos) => {
        const ll: [number, number] = [pos.coords.latitude, pos.coords.longitude]
        if (!gpsRef.current) {
          gpsRef.current = {
            marker: L.circleMarker(ll, {
              radius: 7,
              color: '#fff',
              weight: 2,
              fillColor: '#2563eb',
              fillOpacity: 1,
            }).addTo(map),
            ring: L.circle(ll, {
              radius: pos.coords.accuracy,
              color: '#2563eb',
              weight: 1,
              fillOpacity: 0.08,
            }).addTo(map),
          }
          map.setView(ll, Math.max(map.getZoom(), 15))
        } else {
          gpsRef.current.marker.setLatLng(ll)
          gpsRef.current.ring.setLatLng(ll).setRadius(pos.coords.accuracy)
        }
      },
      () => setGpsOn(false),
      { enableHighAccuracy: true },
    )
    return () => {
      if (watch !== undefined) navigator.geolocation?.clearWatch(watch)
    }
  }, [gpsOn])

  const finishReshape = async () => {
    const target = editTargetRef.current
    if (target && selectedFieldId && onUpdateField) {
      const gj = target.toGeoJSON() as GeoJSON.Feature
      if (gj.geometry.type === 'Polygon') await onUpdateField(selectedFieldId, gj.geometry)
    }
    setEditingShape(false)
  }

  const toolButton = (t: typeof tool, label: string) => (
    <button
      key={t}
      type="button"
      onClick={() => setTool(tool === t ? 'none' : t)}
      className={`rounded-md shadow-md border px-3 py-2 text-sm font-semibold text-left ${
        tool === t
          ? 'bg-primary text-white border-primary'
          : 'bg-white text-primary border-gray-200 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="relative flex-1 h-full">
      <div ref={holderRef} className="absolute inset-0 z-0" />
      <style>{`
        .lite-label { background: transparent; border: none; box-shadow: none; font-weight: 700; font-size: 11px; color: #111827; }
        .lite-label-sat { color: #fff; text-shadow: 0 0 3px #000, 0 0 3px #000; }
        .lite-label::before { display: none; }
      `}</style>

      {/* tools — hidden in read-only history views */}
      {!readOnly && (
        <div className="absolute left-3 top-3 z-[1000] flex flex-col gap-1.5">
          {onCreateField && toolButton('block', '✏️ Draw block')}
          {onCreateAnnotation && toolButton('line', '📏 Line (points)')}
          {onCreateAnnotation && toolButton('freehand', '〰️ Line (freehand)')}
          {onCreateAnnotation && toolButton('text', '🔤 Text label')}
          {selectedFieldId && onUpdateField && !editingShape && (
            <button
              type="button"
              onClick={() => setEditingShape(true)}
              className="rounded-md shadow-md border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-primary text-left hover:bg-gray-50"
            >
              🔧 Edit shape
            </button>
          )}
          {editingShape && (
            <div className="rounded-md bg-white shadow-md border border-gray-200 p-2 space-y-1.5 max-w-[190px]">
              <p className="text-xs text-gray-600">Drag the corners into place.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void finishReshape()}
                  className="btn-primary text-xs px-2.5 py-1.5"
                >
                  Save shape
                </button>
                <button
                  type="button"
                  onClick={() => setEditingShape(false)}
                  className="text-xs text-gray-600 hover:text-primary"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {tool !== 'none' && (
            <p className="rounded-md bg-white/95 shadow border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 max-w-[190px]">
              {tool === 'block' && 'Tap the field corners, then tap the first corner to close it.'}
              {tool === 'line' && 'Tap points along the road or ditch; tap the last point again to finish.'}
              {tool === 'freehand' && 'Press and drag to draw the line.'}
              {tool === 'text' && 'Tap the map where the label goes.'}
            </p>
          )}
        </div>
      )}

      {/* text-label draft */}
      {textDraft && (
        <div className="absolute left-1/2 -translate-x-1/2 top-16 z-[1000] rounded-md bg-white shadow-lg border border-gray-200 p-2 flex gap-2">
          <input
            autoFocus
            type="text"
            value={textDraft.value}
            maxLength={60}
            placeholder="Label (e.g. Hwy 308)"
            className="input text-sm py-1.5 w-48"
            onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
          />
          <button
            type="button"
            disabled={!textDraft.value.trim()}
            className="btn-primary text-xs px-3 disabled:opacity-50"
            onClick={() => {
              if (onCreateAnnotation && textDraft.value.trim()) {
                void onCreateAnnotation(
                  'text',
                  { type: 'Point', coordinates: [textDraft.lng, textDraft.lat] },
                  textDraft.value.trim(),
                  { size: 16, rotation: 0 },
                )
              }
              setTextDraft(null)
            }}
          >
            Save
          </button>
          <button type="button" className="text-xs text-gray-500" onClick={() => setTextDraft(null)}>
            Cancel
          </button>
        </div>
      )}

      {/* view toggle */}
      <div className="absolute left-1/2 -translate-x-1/2 z-[1000] bottom-8 lg:bottom-auto lg:top-3">
        <div className="inline-flex rounded-md bg-white shadow-md border border-gray-200 overflow-hidden text-sm font-semibold">
          {(['crop', 'satellite'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-3 py-2 transition ${mode === m ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50'} ${m === 'satellite' ? 'border-l border-gray-200' : ''}`}
            >
              {m === 'crop' ? 'Crop map' : 'Satellite'}
            </button>
          ))}
        </div>
      </div>

      {/* GPS */}
      <button
        type="button"
        onClick={() => setGpsOn(!gpsOn)}
        className={`absolute right-3 top-24 z-[1000] w-9 h-9 rounded-md shadow-md border text-base ${gpsOn ? 'bg-primary text-white border-primary' : 'bg-white border-gray-200'}`}
        title="Find me"
      >
        📍
      </button>

      <div className="absolute left-1/2 -translate-x-1/2 bottom-20 lg:bottom-3 lg:left-auto lg:right-3 lg:translate-x-0 z-[1000] max-w-xs px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-900 shadow-sm text-center">
        Compatibility mode — full features, lightweight graphics for this computer.
      </div>
    </div>
  )
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] as string)
}

function deleteButton(onDelete: () => void): HTMLElement {
  const div = document.createElement('div')
  const btn = document.createElement('button')
  btn.textContent = 'Delete'
  btn.style.cssText = 'color:#dc2626;font-weight:600;font-size:13px'
  btn.onclick = onDelete
  div.appendChild(btn)
  return div
}
