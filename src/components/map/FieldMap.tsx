'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import * as turf from '@turf/turf'
import 'mapbox-gl/dist/mapbox-gl.css'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import type { FieldRow } from '@/lib/fields'
import type { CaneState } from '@/lib/types'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
const SELECTED_COLOR = '#E8A33D'
// Unset / no cut entered yet — light grey, reads as "no crop" like fallow.
const UNSET_COLOR = '#D1D5DB'

const SATELLITE_STYLE = 'mapbox://styles/mapbox/satellite-streets-v12'
const CROP_STYLE = 'mapbox://styles/mapbox/light-v11'

// Centroids for default map center if user has no fields yet.
const STATE_CENTERS: Record<CaneState, [number, number]> = {
  LA: [-91.5, 30.0],
  FL: [-80.7, 26.6],
}

// Map ratoon stage → fill color. This is the grower's established convention
// from his printed crop maps (see memory: crop-color-convention) — plant cane
// red, climbing through the stubble years, fallow/open grey. Matching it makes
// the crop-map view read instantly to someone used to the paper version.
const RATOON_COLORS: { key: string; label: string; color: string }[] = [
  { key: 'plant_cane', label: 'Plant cane', color: '#DC2626' }, // red
  { key: 'first_stubble', label: '1st stubble', color: '#2563EB' }, // blue
  { key: 'second_stubble', label: '2nd stubble', color: '#EAB308' }, // yellow
  { key: 'third_stubble', label: '3rd stubble', color: '#16A34A' }, // green
  { key: 'fourth_stubble', label: '4th stubble', color: '#92400E' }, // brown
  { key: 'fifth_stubble_plus', label: '5th+ stubble', color: '#EC4899' }, // pink
  { key: 'fallow', label: 'Fallow / open', color: '#9CA3AF' }, // grey
]

function fillColorExpression(selectedFieldId: string | null): mapboxgl.ExpressionSpecification {
  return [
    'case',
    ['==', ['get', 'id'], ['literal', selectedFieldId ?? '']],
    SELECTED_COLOR,
    [
      'match',
      ['coalesce', ['get', 'ratoon'], 'unset'],
      ...RATOON_COLORS.flatMap((r) => [r.key, r.color]),
      UNSET_COLOR,
    ],
  ] as unknown as mapboxgl.ExpressionSpecification
}

// Map a field's acreage to how many notes characters fit inside its drawn
// polygon at a typical zoom. Anything over the budget gets clipped at the last
// word boundary and trailed with an ellipsis.
function truncateNotesForLabel(notes: string | null, acres: number): string {
  if (!notes) return ''
  let maxChars: number
  if (acres < 2) maxChars = 14
  else if (acres < 5) maxChars = 22
  else if (acres < 15) maxChars = 38
  else if (acres < 50) maxChars = 60
  else maxChars = 90

  if (notes.length <= maxChars) return notes
  const head = notes.slice(0, maxChars - 1)
  const lastSpace = head.lastIndexOf(' ')
  const cut = lastSpace > maxChars / 2 ? head.slice(0, lastSpace) : head
  return cut.trimEnd() + '…'
}

// Outline color depends on basemap: white reads on satellite, dark grey on the
// light crop-map background (white would vanish there).
function lineColorExpression(
  selectedFieldId: string | null,
  viewMode: ViewMode,
): mapboxgl.ExpressionSpecification {
  return [
    'case',
    ['==', ['get', 'id'], ['literal', selectedFieldId ?? '']],
    SELECTED_COLOR,
    viewMode === 'crop' ? '#374151' : '#FFFFFF',
  ] as unknown as mapboxgl.ExpressionSpecification
}

type ViewMode = 'satellite' | 'crop'

// Satellite label: name + variety + truncated note (ground-truth context while
// drawing / scouting). Each optional line gets a conditional newline so empty
// values don't leave blank gaps.
function satelliteLabelExpression(): mapboxgl.ExpressionSpecification {
  return [
    'format',
    ['get', 'name'],
    { 'font-scale': 1 },
    ['case', ['!=', ['get', 'variety'], ''], '\n', ''],
    {},
    ['get', 'variety'],
    { 'font-scale': 0.75 },
    ['case', ['!=', ['get', 'notes_short'], ''], '\n', ''],
    {},
    ['get', 'notes_short'],
    { 'font-scale': 0.65 },
  ] as unknown as mapboxgl.ExpressionSpecification
}

// Crop-map label: block name + acreage, matching the printed plat maps where
// the acreage number is the headline figure inside each block.
function cropLabelExpression(): mapboxgl.ExpressionSpecification {
  return [
    'format',
    ['get', 'name'],
    { 'font-scale': 0.85 },
    '\n',
    {},
    ['concat', ['number-format', ['get', 'acreage'], { 'max-fraction-digits': 2 }], ' ac'],
    { 'font-scale': 1 },
  ] as unknown as mapboxgl.ExpressionSpecification
}

export interface FieldMapProps {
  fields: FieldRow[]
  state: CaneState | null
  selectedFieldId: string | null
  onSelectField: (id: string | null) => void
  onCreateField: (geometry: GeoJSON.Polygon) => Promise<void>
  onUpdateField: (id: string, geometry: GeoJSON.Polygon) => Promise<void>
  onDrawingChange?: (drawing: boolean) => void
  onShowFields?: () => void
}

export default function FieldMap({
  fields,
  state,
  selectedFieldId,
  onSelectField,
  onCreateField,
  onUpdateField,
  onDrawingChange,
  onShowFields,
}: FieldMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const drawRef = useRef<MapboxDraw | null>(null)
  const geolocateRef = useRef<mapboxgl.GeolocateControl | null>(null)
  const meMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const watchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [legendOpen, setLegendOpen] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('satellite')
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)
  const [locateAccuracy, setLocateAccuracy] = useState<number | null>(null)

  // Initialize map once. Aggressive error reporting so silent failures surface
  // in the UI (without needing browser DevTools).
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    if (!MAPBOX_TOKEN) {
      setError(
        'NEXT_PUBLIC_MAPBOX_TOKEN is not set. Add it to .env.local and restart the dev server.',
      )
      return
    }

    let map: mapboxgl.Map
    let draw: MapboxDraw
    let onKey: ((ev: KeyboardEvent) => void) | null = null
    let readyTimer: ReturnType<typeof setTimeout> | null = null

    try {
      mapboxgl.accessToken = MAPBOX_TOKEN
      const center = state ? STATE_CENTERS[state] : STATE_CENTERS.LA
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center,
        zoom: 11,
        attributionControl: true,
      })
    } catch (e) {
      setError(
        `Mapbox failed to initialize: ${e instanceof Error ? e.message : String(e)}`,
      )
      return
    }

    // Surface ANY Mapbox runtime error visibly. Errors during dev are rare
    // enough that even noisy tile-fetch failures are worth showing.
    map.on('error', (e: { error?: { message?: string; status?: number; url?: string } }) => {
      const msg = e?.error?.message ?? 'Unknown Mapbox error'
      const status = e?.error?.status
      const url = e?.error?.url
      // eslint-disable-next-line no-console
      console.error('[mapbox error]', { msg, status, url, raw: e })
      setError(
        `Mapbox: ${msg}` +
          (status ? ` · HTTP ${status}` : '') +
          (url ? `\nURL: ${url}` : ''),
      )
    })

    // (WebGL context check was here — removed because calling getContext()
    // a second time after Mapbox grabbed it can return null and produce false
    // positives. Mapbox's own error event covers genuine context failures.)

    // If load doesn't fire within 25s, surface a diagnostic. (Slow mobile
    // cellular routinely takes 15–20s on first visit — keep the canary
    // generous to avoid false positives.)
    readyTimer = setTimeout(() => {
      if (!mapRef.current) return
      setError(
        'Map is taking unusually long to load. Likely a slow connection or ad-blocker. The map may still appear in a moment.',
      )
    }, 25_000)

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true, timeout: 10000 },
      trackUserLocation: true,
      showUserHeading: true,
      showAccuracyCircle: true,
    })
    map.addControl(geolocate, 'top-right')
    geolocateRef.current = geolocate
    map.addControl(new mapboxgl.ScaleControl({ unit: 'imperial' }), 'bottom-left')

    try {
      draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {},
        defaultMode: 'simple_select',
      })
      map.addControl(draw as unknown as mapboxgl.IControl, 'top-left')
    } catch (e) {
      setError(
        `Mapbox Draw failed to initialize: ${e instanceof Error ? e.message : String(e)}`,
      )
      return
    }

    map.on('draw.modechange', (e: { mode: string }) => {
      const isDrawing = e.mode === 'draw_polygon'
      setDrawing(isDrawing)
      onDrawingChange?.(isDrawing)
    })

    map.on('load', () => {
      map.addSource('fields', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'fields-fill',
        type: 'fill',
        source: 'fields',
        paint: {
          'fill-color': fillColorExpression(selectedFieldId),
          'fill-opacity': 0.4,
        },
      })
      map.addLayer({
        id: 'fields-outline',
        type: 'line',
        source: 'fields',
        paint: {
          // Initial paint assumes satellite (the default mode); the view-mode
          // effect re-applies the correct colors/opacity once ready flips true.
          'line-color': lineColorExpression(selectedFieldId, 'satellite'),
          'line-width': 2,
        },
      })
      map.addLayer({
        id: 'fields-label',
        type: 'symbol',
        source: 'fields',
        layout: {
          // Default to the satellite label; the view-mode effect swaps to the
          // acreage-forward crop label when needed.
          'text-field': satelliteLabelExpression(),
          'text-size': 13,
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-line-height': 1.15,
          // Wrap rather than overflow if Mapbox decides the line is too wide
          // for the polygon. 10 ems ≈ 130px at our text-size, a sensible cap.
          'text-max-width': 10,
        },
        paint: {
          'text-color': '#FFFFFF',
          'text-halo-color': '#0F2A1F',
          'text-halo-width': 1.5,
        },
      })

      map.on('click', 'fields-fill', (e) => {
        const featureId = e.features?.[0]?.properties?.id
        if (typeof featureId === 'string') onSelectField(featureId)
      })
      map.on('mouseenter', 'fields-fill', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'fields-fill', () => {
        map.getCanvas().style.cursor = ''
      })

      if (readyTimer) {
        clearTimeout(readyTimer)
        readyTimer = null
      }
      // Clear any "slow load" warning that may have been set before load arrived.
      setError(null)
      setReady(true)
    })

    map.on('draw.create', async (e: { features: GeoJSON.Feature[] }) => {
      const feature = e.features[0]
      if (feature?.geometry?.type === 'Polygon') {
        await onCreateField(feature.geometry as GeoJSON.Polygon)
        draw.deleteAll()
      }
      setDrawing(false)
    })
    map.on('draw.update', async (e: { features: GeoJSON.Feature[] }) => {
      const feature = e.features[0]
      const id = feature?.properties?.headlandFieldId
      if (typeof id === 'string' && feature?.geometry?.type === 'Polygon') {
        await onUpdateField(id, feature.geometry as GeoJSON.Polygon)
      }
    })

    onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        draw.changeMode('simple_select')
        draw.deleteAll()
        setDrawing(false)
      }
    }
    window.addEventListener('keydown', onKey)

    // Mapbox locks canvas dimensions at construction. The flex layout often
    // settles after init, leaving the map rendered short. Two safety nets:
    //  1. ResizeObserver on the container — handles all subsequent size changes.
    //  2. A few delayed resize() nudges to handle the post-mount layout settle.
    let resizeObserver: ResizeObserver | null = null
    const safeResize = () => {
      try {
        if (mapRef.current) mapRef.current.resize()
      } catch {
        // Ignore — map already removed during HMR.
      }
    }
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      resizeObserver = new ResizeObserver(safeResize)
      resizeObserver.observe(containerRef.current)
    }
    const t1 = setTimeout(safeResize, 100)
    const t2 = setTimeout(safeResize, 500)
    const t3 = setTimeout(safeResize, 1500)

    mapRef.current = map
    drawRef.current = draw

    return () => {
      if (readyTimer) clearTimeout(readyTimer)
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      if (onKey) window.removeEventListener('keydown', onKey)
      if (resizeObserver) resizeObserver.disconnect()
      stopWatching()
      try {
        meMarkerRef.current?.remove()
      } catch {
        /* ignore */
      }
      meMarkerRef.current = null
      try {
        map.remove()
      } catch {
        // Ignore — mapbox sometimes throws on double-remove during HMR.
      }
      mapRef.current = null
      drawRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update fields source when fields change. Now passes ratoon stage so the
  // fill-color match expression can color-code by cycle.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const src = map.getSource('fields') as mapboxgl.GeoJSONSource | undefined
    if (!src) return
    src.setData({
      type: 'FeatureCollection',
      features: fields.map((f) => ({
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          id: f.id,
          name: f.name,
          acreage: f.acreage_cached,
          ratoon: f.current_ratoon ?? 'unset',
          variety: f.variety ?? '',
          // Truncate notes based on field acreage — bigger field = more room
          // for the label, so we can show more characters before adding '…'.
          // Full notes still live on the sidebar card and the print sheet.
          notes_short: truncateNotesForLabel(
            f.notes,
            Number(f.acreage_cached || 0),
          ),
        },
      })),
    })

    if (fields.length > 0) {
      const bounds = new mapboxgl.LngLatBounds()
      for (const f of fields) {
        for (const ring of f.geometry.coordinates) {
          for (const [lng, lat] of ring) {
            bounds.extend([lng, lat])
          }
        }
      }
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 80, animate: false, maxZoom: 16 })
      }
    }
  }, [fields, ready])

  // Recolor selection + apply the active view mode. In crop mode we hide the
  // satellite raster, lighten the background, and crank fill opacity so blocks
  // read as solid plat-map colors (matching the grower's printed maps).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map.setPaintProperty('fields-fill', 'fill-color', fillColorExpression(selectedFieldId))
    map.setPaintProperty('fields-fill', 'fill-opacity', viewMode === 'crop' ? 0.92 : 0.4)
    map.setPaintProperty('fields-outline', 'line-color', lineColorExpression(selectedFieldId, viewMode))
    map.setPaintProperty('fields-outline', 'line-width', viewMode === 'crop' ? 1.5 : 2)
    map.setLayoutProperty(
      'fields-label',
      'text-field',
      viewMode === 'crop' ? cropLabelExpression() : satelliteLabelExpression(),
    )

    // Toggle the basemap by dimming the satellite raster rather than swapping
    // styles (setStyle wipes our layers + the draw control). Iterate so we
    // don't depend on Mapbox's internal raster layer id. Also lighten the
    // style's background layer so hiding the raster reveals a clean plat-map
    // backdrop (the satellite style's own background is dark).
    const style = map.getStyle()
    for (const layer of style?.layers ?? []) {
      try {
        if (layer.type === 'raster') {
          map.setPaintProperty(layer.id, 'raster-opacity', viewMode === 'crop' ? 0 : 1)
        } else if (layer.type === 'background') {
          map.setPaintProperty(layer.id, 'background-color', viewMode === 'crop' ? '#EAE7E1' : '#0B0B0B')
        }
      } catch {
        /* layer may not support the property — ignore */
      }
    }
  }, [selectedFieldId, ready, viewMode])

  // Fly to a field when it becomes the selected one (kept separate so toggling
  // the view mode doesn't yank the camera around).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !selectedFieldId) return
    const sel = fields.find((f) => f.id === selectedFieldId)
    if (sel) {
      map.flyTo({ center: [sel.centroid_lng, sel.centroid_lat], zoom: 15, speed: 1.4 })
    }
  }, [selectedFieldId, fields, ready])

  // Catch the "map renders blank after server-action navigation" case: any
  // time props change, nudge the canvas to redraw at its current container
  // size on the next frame.
  useEffect(() => {
    if (!mapRef.current) return
    const id = requestAnimationFrame(() => {
      try {
        mapRef.current?.resize()
      } catch {
        /* map already removed */
      }
    })
    return () => cancelAnimationFrame(id)
  })

  function stopWatching() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    if (watchTimeoutRef.current) {
      clearTimeout(watchTimeoutRef.current)
      watchTimeoutRef.current = null
    }
  }

  function applyFix(map: mapboxgl.Map, pos: GeolocationPosition) {
    const lngLat: [number, number] = [pos.coords.longitude, pos.coords.latitude]
    setLocateAccuracy(pos.coords.accuracy)

    if (meMarkerRef.current) {
      meMarkerRef.current.setLngLat(lngLat)
    } else {
      meMarkerRef.current = new mapboxgl.Marker({ color: '#E8A33D' })
        .setLngLat(lngLat)
        .addTo(map)
    }

    // Accuracy circle as a real geographic polygon — scales correctly with zoom.
    const circle = turf.circle(lngLat, pos.coords.accuracy / 1000, {
      steps: 64,
      units: 'kilometers',
    })
    const src = map.getSource('me-accuracy') as mapboxgl.GeoJSONSource | undefined
    if (src) {
      src.setData(circle)
    } else {
      map.addSource('me-accuracy', { type: 'geojson', data: circle })
      map.addLayer({
        id: 'me-accuracy-fill',
        type: 'fill',
        source: 'me-accuracy',
        paint: { 'fill-color': '#E8A33D', 'fill-opacity': 0.12 },
      })
      map.addLayer({
        id: 'me-accuracy-line',
        type: 'line',
        source: 'me-accuracy',
        paint: { 'line-color': '#E8A33D', 'line-width': 1, 'line-opacity': 0.5 },
      })
    }
  }

  function findMe() {
    const map = mapRef.current
    if (!map) return
    if (!navigator.geolocation) {
      setLocateError('Geolocation not supported in this browser.')
      return
    }

    stopWatching()
    setLocateError(null)
    setLocateAccuracy(null)
    setLocating(true)

    let bestFix: GeolocationPosition | null = null
    let flewTo = false

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const accBetter = !bestFix || pos.coords.accuracy < bestFix.coords.accuracy
        if (!accBetter) return
        bestFix = pos
        applyFix(map, pos)
        if (!flewTo) {
          flewTo = true
          map.flyTo({
            center: [pos.coords.longitude, pos.coords.latitude],
            zoom: 16,
            speed: 1.4,
          })
        }
        // Once we're under 15m, we're as good as desktop browser geolocation gets.
        if (pos.coords.accuracy < 15) {
          stopWatching()
          setLocating(false)
        }
      },
      (err) => {
        stopWatching()
        setLocating(false)
        const messages: Record<number, string> = {
          1: 'Location permission denied. Allow it in Safari → Settings → Websites → Location.',
          2: 'Location unavailable. Check your network or GPS.',
          3: 'Location request timed out. Try again.',
        }
        setLocateError(messages[err.code] ?? err.message)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )

    // Stop converging after 15s — accuracy plateaus quickly on desktop Wi-Fi.
    watchTimeoutRef.current = setTimeout(() => {
      stopWatching()
      setLocating(false)
    }, 15000)
  }

  function toggleDraw() {
    const draw = drawRef.current
    if (!draw) return
    if (drawing) {
      draw.changeMode('simple_select')
      draw.deleteAll()
      setDrawing(false)
    } else {
      draw.changeMode('draw_polygon')
      setDrawing(true)
    }
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-100 p-8">
        <div className="max-w-lg">
          <p className="text-primary font-semibold mb-2">Map can&apos;t load</p>
          <pre className="text-xs text-red-700 bg-red-50 border border-red-100 rounded p-3 whitespace-pre-wrap break-words">
            {error}
          </pre>
          <p className="text-xs text-gray-500 mt-4">
            If the error mentions a token, get a free public token at{' '}
            <a href="https://account.mapbox.com/" className="underline" target="_blank" rel="noreferrer">
              account.mapbox.com
            </a>
            , paste into <code className="bg-gray-100 px-1 rounded">.env.local</code>, and
            restart <code className="bg-gray-100 px-1 rounded">npm run dev</code>.
          </p>
        </div>
      </div>
    )
  }

  // Show legend only once the user actually has fields with a ratoon set —
  // avoids confusing a brand-new account with color rules they haven't used yet.
  const anyRatoonSet = fields.some((f) => f.current_ratoon)

  return (
    <div
      // Explicit height — flex-stretch was collapsing to 0 in this context
      // (only absolute children → no content height → some Tailwind/flex
      // combos collapse). Header is h-14 (3.5rem); pin map to viewport - that.
      // Both Tailwind arbitrary value AND inline style for max compatibility.
      className="relative flex-1 h-[calc(100vh-3.5rem)]"
      style={{ height: 'calc(100vh - 3.5rem)' }}
    >
      <div
        ref={containerRef}
        className="absolute inset-0"
        // Light backdrop shows through wherever the satellite raster is hidden
        // (crop-map mode), giving the plain plat-map look.
        style={{ width: '100%', height: '100%', backgroundColor: '#EAE7E1' }}
      />

      {/* View-mode toggle — top-center. Flip between satellite (for drawing /
          ground-truth) and the plain colored crop map (for reading / printing). */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
        <div className="inline-flex rounded-md bg-white shadow-md border border-gray-200 overflow-hidden text-sm font-semibold">
          <button
            type="button"
            onClick={() => setViewMode('satellite')}
            className={`px-3 py-2 transition ${
              viewMode === 'satellite' ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Satellite
          </button>
          <button
            type="button"
            onClick={() => setViewMode('crop')}
            className={`px-3 py-2 transition ${
              viewMode === 'crop' ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Crop map
          </button>
        </div>
      </div>

      {/* Labeled action buttons — overlay the map at top-left. */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-2 pointer-events-none items-start">
        <div className="flex flex-wrap gap-2 pointer-events-none">
          {onShowFields && (
            <button
              type="button"
              onClick={onShowFields}
              className="pointer-events-auto inline-flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold shadow-md transition bg-white text-primary border-2 border-primary hover:bg-primary/5"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
              Fields ({fields.length})
            </button>
          )}
          <button
            type="button"
            onClick={toggleDraw}
            disabled={!ready}
            className={`pointer-events-auto inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold shadow-md transition disabled:opacity-50 ${
              drawing
                ? 'bg-white text-primary border-2 border-primary hover:bg-gray-50'
                : 'bg-accent text-primary-dark hover:bg-accent-dark'
            }`}
          >
            {drawing ? (
              <>
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                Cancel
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M10 2a1 1 0 011 1v6h6a1 1 0 110 2h-6v6a1 1 0 11-2 0v-6H3a1 1 0 110-2h6V3a1 1 0 011-1z" />
                </svg>
                Draw a field
              </>
            )}
          </button>

          <button
            type="button"
            onClick={findMe}
            disabled={!ready || drawing}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold shadow-md transition bg-white text-primary border-2 border-primary hover:bg-primary/5 disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-3a5 5 0 100-10 5 5 0 000 10zm0-3a2 2 0 110-4 2 2 0 010 4z" clipRule="evenodd" />
            </svg>
            {locating ? 'Locating…' : 'Find me'}
          </button>

          {locateAccuracy !== null && !locating && (
            <div className="pointer-events-auto rounded-md bg-white border border-gray-100 shadow-md px-3 py-2 text-xs text-gray-700 leading-snug">
              <span className="font-semibold text-primary">±{Math.round(locateAccuracy * 3.281)} ft</span>
              <span className="text-gray-500 ml-1">
                (Wi-Fi triangulation — use phone for GPS)
              </span>
            </div>
          )}
        </div>

        {drawing && (
          <div className="pointer-events-none rounded-md bg-primary-dark/90 text-white px-3 py-2 text-xs leading-snug max-w-xs shadow-md">
            Click each corner of the field. Double-click the last corner to finish.
            Press Esc to cancel.
          </div>
        )}

        {locateError && (
          <div className="pointer-events-auto rounded-md bg-red-50 border border-red-100 text-red-800 px-3 py-2 text-xs leading-snug max-w-xs shadow-md flex items-start gap-2">
            <span>{locateError}</span>
            <button
              type="button"
              onClick={() => setLocateError(null)}
              className="text-red-600 hover:underline shrink-0"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

      </div>

      {/* Cycle legend — bottom-right. Collapsible. Always shown in crop mode
          since the colors are the entire point there. */}
      {(anyRatoonSet || viewMode === 'crop') && (
        <div className="absolute bottom-8 right-3 z-10 pointer-events-auto">
          {legendOpen ? (
            <div className="rounded-md bg-white/95 backdrop-blur shadow-md border border-gray-100 p-3 w-44">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
                  Cycle
                </span>
                <button
                  type="button"
                  onClick={() => setLegendOpen(false)}
                  aria-label="Hide legend"
                  className="text-gray-400 hover:text-gray-700"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
              <ul className="space-y-1">
                {RATOON_COLORS.map((r) => (
                  <li key={r.key} className="flex items-center gap-2 text-xs text-gray-700">
                    <span
                      className="inline-block w-3.5 h-3.5 rounded border border-white/80 shadow-sm"
                      style={{ backgroundColor: r.color }}
                      aria-hidden="true"
                    />
                    <span>{r.label}</span>
                  </li>
                ))}
                <li className="flex items-center gap-2 text-xs text-gray-500 pt-1 mt-1 border-t border-gray-100">
                  <span
                    className="inline-block w-3.5 h-3.5 rounded border border-white/80 shadow-sm"
                    style={{ backgroundColor: UNSET_COLOR }}
                    aria-hidden="true"
                  />
                  <span>Not set</span>
                </li>
              </ul>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setLegendOpen(true)}
              className="rounded-md bg-white/95 backdrop-blur shadow-md border border-gray-100 px-3 py-2 text-xs font-semibold text-primary hover:bg-white"
            >
              Cycle legend
            </button>
          )}
        </div>
      )}
    </div>
  )
}
