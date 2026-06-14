'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import * as turf from '@turf/turf'
import 'mapbox-gl/dist/mapbox-gl.css'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import type { FieldRow } from '@/lib/fields'
import type { CaneState, Ditch } from '@/lib/types'
import { RATOON_COLORS, UNSET_RATOON_COLOR } from '@/lib/ratoon-colors'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
const SELECTED_COLOR = '#E8A33D'
const UNSET_COLOR = UNSET_RATOON_COLOR

const SATELLITE_STYLE = 'mapbox://styles/mapbox/satellite-streets-v12'
const CROP_STYLE = 'mapbox://styles/mapbox/light-v11'

// Centroids for default map center if user has no fields yet.
const STATE_CENTERS: Record<CaneState, [number, number]> = {
  LA: [-91.5, 30.0],
  FL: [-80.7, 26.6],
}

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

// Rigidly shift a polygon by a lng/lat delta (used while dragging a reposition
// group). For the small, local moves this feature is for, a flat lng/lat shift
// tracks the cursor exactly — which is what the grower expects when sliding a
// block onto the satellite.
function translatePolygon(geom: GeoJSON.Polygon, dLng: number, dLat: number): GeoJSON.Polygon {
  return {
    type: 'Polygon',
    coordinates: geom.coordinates.map((ring) =>
      ring.map(([lng, lat]) => [lng + dLng, lat + dLat]),
    ),
  }
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
  ditches: Ditch[]
  state: CaneState | null
  selectedFieldId: string | null
  onSelectField: (id: string | null) => void
  onCreateField: (geometry: GeoJSON.Polygon) => Promise<void>
  onUpdateField: (id: string, geometry: GeoJSON.Polygon) => Promise<void>
  onCreateDitch: (geometry: GeoJSON.LineString) => Promise<void>
  onDeleteDitch: (id: string) => Promise<void>
  onDrawingChange?: (drawing: boolean) => void
  onShowFields?: () => void
  // Reposition mode: the ids of blocks to move/rotate as a rigid group, or null.
  repositionIds: Set<string> | null
  onSaveReposition: (features: { id: string; geometry: GeoJSON.Polygon }[]) => Promise<void>
  onCancelReposition: () => void
}

export default function FieldMap({
  fields,
  ditches,
  state,
  selectedFieldId,
  onSelectField,
  onCreateField,
  onUpdateField,
  onCreateDitch,
  onDeleteDitch,
  onDrawingChange,
  onShowFields,
  repositionIds,
  onSaveReposition,
  onCancelReposition,
}: FieldMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const drawRef = useRef<MapboxDraw | null>(null)
  const popupRef = useRef<mapboxgl.Popup | null>(null)
  const geolocateRef = useRef<mapboxgl.GeolocateControl | null>(null)
  const meMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const watchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Reposition mode: live working geometries (id → polygon) the Save button reads,
  // a guard so the tap handler ignores taps while repositioning, and the camera's
  // current view mode (read in the effect cleanup to restore base-layer opacity).
  const repositionWorkingRef = useRef<Map<string, GeoJSON.Polygon>>(new Map())
  const repositioningRef = useRef(false)
  const rotateMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const viewModeRef = useRef<ViewMode>('satellite')
  const [savingReposition, setSavingReposition] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [drawKind, setDrawKind] = useState<'block' | 'ditch' | null>(null)
  // Default the legend closed on phones AND tablets so it doesn't cover the map
  // or collide with the bottom-center view toggle on the narrower sidebar-open
  // layout; open by default only on desktop (lg) where there's room.
  const [legendOpen, setLegendOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth >= 1024,
  )
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
    let tapCleanup: (() => void) | null = null
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
        // Touch taps wander a few px; the 3px default makes Mapbox treat a tap as
        // a drag and fire no click, so tapping a block did nothing on mobile.
        clickTolerance: 8,
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
      const kind =
        e.mode === 'draw_polygon' ? 'block' : e.mode === 'draw_line_string' ? 'ditch' : null
      setDrawing(kind !== null)
      setDrawKind(kind)
      onDrawingChange?.(kind !== null)
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

      // Tapping a block needs to DO something visible — on mobile the sidebar is
      // closed, so selection alone gave no feedback. Pop a quick card with the
      // basics + a link to open the full block.
      const openFieldInfo = (
        props: Record<string, unknown> | null | undefined,
        lngLat: mapboxgl.LngLat,
      ) => {
        const featureId = props?.id
        if (typeof featureId !== 'string') return
        onSelectField(featureId)
        popupRef.current?.remove()
        const esc = (s: string) =>
          s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] as string)
        const cutLabels: Record<string, string> = {
          plant_cane: 'Plant cane', first_stubble: '1st stubble', second_stubble: '2nd stubble',
          third_stubble: '3rd stubble', fourth_stubble: '4th stubble', fifth_stubble_plus: '5th stubble',
          sixth_stubble_plus: '6th+ stubble', fallow: 'Fallow',
        }
        const name = esc(String(props?.name ?? 'Block'))
        const meta = [
          `${Number(props?.acreage || 0).toFixed(2)} ac`,
          cutLabels[String(props?.ratoon ?? '')] ?? '',
          props?.variety ? esc(String(props.variety)) : '',
        ].filter(Boolean).join(' · ')
        popupRef.current = new mapboxgl.Popup({ closeButton: true, offset: 10, maxWidth: '260px' })
          .setLngLat(lngLat)
          .setHTML(
            `<div style="font-family:system-ui,sans-serif;min-width:150px">` +
              `<div style="font-weight:700;color:#1A3D2E;font-size:15px">${name}</div>` +
              `<div style="color:#4b5563;font-size:12px;margin-top:2px">${meta}</div>` +
              `<a href="/app/fields/${featureId}" style="display:inline-block;margin-top:10px;font-weight:600;font-size:14px;color:#1A3D2E">Open block →</a>` +
              `</div>`,
          )
          .addTo(map)
      }

      map.on('click', 'fields-fill', (e) => openFieldInfo(e.features?.[0]?.properties, e.lngLat))

      // mapbox-gl-draw is added full-time in simple_select and swallows the
      // synthesized click on touch, so tapping a block did nothing on mobile.
      // Detect the tap on the canvas directly and query the field underneath.
      const canvasEl = map.getCanvas()
      let tapStart: { x: number; y: number; t: number } | null = null
      const onTapStart = (ev: TouchEvent) => {
        tapStart =
          ev.touches.length === 1
            ? { x: ev.touches[0].clientX, y: ev.touches[0].clientY, t: Date.now() }
            : null
      }
      const onTapEnd = (ev: TouchEvent) => {
        const start = tapStart
        tapStart = null
        // Ignore taps while repositioning — the move/rotate handlers own the canvas.
        if (repositioningRef.current) return
        if (!start || ev.changedTouches.length !== 1) return
        const tch = ev.changedTouches[0]
        const moved = Math.hypot(tch.clientX - start.x, tch.clientY - start.y)
        // A real tap, not a pan or long-press, and only when not mid-draw.
        if (moved > 12 || Date.now() - start.t > 600) return
        if (drawRef.current?.getMode?.() && drawRef.current.getMode() !== 'simple_select') return
        const rect = canvasEl.getBoundingClientRect()
        const pt: [number, number] = [tch.clientX - rect.left, tch.clientY - rect.top]
        const feats = map.queryRenderedFeatures(pt, { layers: ['fields-fill'] })
        if (feats.length) openFieldInfo(feats[0].properties, map.unproject(pt))
      }
      canvasEl.addEventListener('touchstart', onTapStart, { passive: true })
      canvasEl.addEventListener('touchend', onTapEnd, { passive: true })
      tapCleanup = () => {
        canvasEl.removeEventListener('touchstart', onTapStart)
        canvasEl.removeEventListener('touchend', onTapEnd)
      }
      map.on('mouseenter', 'fields-fill', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'fields-fill', () => {
        map.getCanvas().style.cursor = ''
      })

      // Ditches — drawn black lines. Rendered above fills so they read like the
      // thin lines on the paper crop maps. Click one to delete it.
      map.addSource('ditches', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'ditches-line',
        type: 'line',
        source: 'ditches',
        paint: { 'line-color': '#111827', 'line-width': 2 },
      })
      map.on('click', 'ditches-line', (e) => {
        const id = e.features?.[0]?.properties?.id
        if (typeof id === 'string' && window.confirm('Delete this ditch?')) {
          void onDeleteDitch(id)
        }
      })
      map.on('mouseenter', 'ditches-line', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'ditches-line', () => {
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
      } else if (feature?.geometry?.type === 'LineString') {
        await onCreateDitch(feature.geometry as GeoJSON.LineString)
      }
      draw.deleteAll()
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
      tapCleanup?.()
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
      popupRef.current?.remove()
      popupRef.current = null
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

  // Update ditches source when ditches change.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const src = map.getSource('ditches') as mapboxgl.GeoJSONSource | undefined
    if (!src) return
    src.setData({
      type: 'FeatureCollection',
      features: ditches.map((d) => ({
        type: 'Feature',
        geometry: d.geometry,
        properties: { id: d.id },
      })),
    })
  }, [ditches, ready])

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

  // Mirror viewMode into a ref so the reposition effect's cleanup can restore the
  // correct base-layer opacity without taking viewMode as a dependency (which
  // would tear down an in-progress move when the user flips the basemap).
  useEffect(() => {
    viewModeRef.current = viewMode
  }, [viewMode])

  // ── Reposition mode ────────────────────────────────────────────────
  // Lift the chosen blocks into a bright, draggable working copy and let the
  // grower slide (drag) + rotate (corner handle) the whole group as a rigid
  // unit onto the satellite. Fixes imported GPS drift without redrawing. Save
  // writes every new geometry in one round-trip; Cancel discards the working copy.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !repositionIds || repositionIds.size === 0) return

    // Snapshot the chosen blocks' geometries at entry (deep-cloned working copy).
    const workingMap = new Map<string, GeoJSON.Polygon>()
    for (const f of fields) {
      if (repositionIds.has(f.id)) {
        workingMap.set(f.id, JSON.parse(JSON.stringify(f.geometry)) as GeoJSON.Polygon)
      }
    }
    if (workingMap.size === 0) return
    repositionWorkingRef.current = workingMap
    repositioningRef.current = true

    const fc = (): GeoJSON.FeatureCollection => ({
      type: 'FeatureCollection',
      features: Array.from(workingMap.entries()).map(([id, geometry]) => ({
        type: 'Feature',
        properties: { id },
        geometry,
      })),
    })
    const cloneWorking = () => {
      const m = new Map<string, GeoJSON.Polygon>()
      for (const [id, g] of workingMap) m.set(id, JSON.parse(JSON.stringify(g)) as GeoJSON.Polygon)
      return m
    }
    const pushData = () => {
      const src = map.getSource('reposition') as mapboxgl.GeoJSONSource | undefined
      src?.setData(fc())
    }

    // Bright working-copy layers on top; dim the base fields so the group pops.
    // Defensively clear any leftovers (React strict-mode double-invoke in dev).
    try {
      if (map.getLayer('reposition-fill')) map.removeLayer('reposition-fill')
      if (map.getLayer('reposition-outline')) map.removeLayer('reposition-outline')
      if (map.getSource('reposition')) map.removeSource('reposition')
    } catch {
      /* ignore */
    }
    map.addSource('reposition', { type: 'geojson', data: fc() })
    map.addLayer({
      id: 'reposition-fill',
      type: 'fill',
      source: 'reposition',
      paint: { 'fill-color': SELECTED_COLOR, 'fill-opacity': 0.55 },
    })
    map.addLayer({
      id: 'reposition-outline',
      type: 'line',
      source: 'reposition',
      paint: { 'line-color': SELECTED_COLOR, 'line-width': 3 },
    })
    map.setPaintProperty('fields-fill', 'fill-opacity', viewMode === 'crop' ? 0.3 : 0.12)
    try {
      map.setLayoutProperty('fields-label', 'visibility', 'none')
    } catch {
      /* label layer may not be ready — ignore */
    }

    // Frame the group with room to drag.
    const groupBounds = new mapboxgl.LngLatBounds()
    for (const g of workingMap.values()) {
      for (const ring of g.coordinates) for (const [lng, lat] of ring) groupBounds.extend([lng, lat])
    }
    if (!groupBounds.isEmpty()) {
      map.fitBounds(groupBounds, { padding: 110, animate: true, maxZoom: 16, duration: 500 })
    }

    // ── Rotate handle ── a draggable marker above the group; spins the group
    // around its centroid by the change in bearing from centroid → handle.
    const handleEl = document.createElement('div')
    handleEl.style.cssText =
      'width:36px;height:36px;border-radius:9999px;background:#fff;border:2px solid ' +
      SELECTED_COLOR +
      ';box-shadow:0 1px 5px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;cursor:grab;touch-action:none;'
    handleEl.innerHTML =
      '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#1A3D2E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/></svg>'
    const rotateMarker = new mapboxgl.Marker({ element: handleEl, draggable: true })
    rotateMarkerRef.current = rotateMarker

    const handleAnchor = (): [number, number] => {
      const b = turf.bbox(fc()) // [minLng, minLat, maxLng, maxLat]
      const pad = (b[3] - b[1]) * 0.18 || 0.0005
      return [(b[0] + b[2]) / 2, b[3] + pad]
    }
    const placeHandle = () => rotateMarker.setLngLat(handleAnchor())
    placeHandle()
    rotateMarker.addTo(map)

    let rotateBase: Map<string, GeoJSON.Polygon> | null = null
    let rotatePivot: [number, number] | null = null
    let startBearing = 0
    rotateMarker.on('dragstart', () => {
      rotateBase = cloneWorking()
      const c = turf.centroid(fc()).geometry.coordinates as [number, number]
      rotatePivot = c
      const ll = rotateMarker.getLngLat()
      startBearing = turf.bearing(c, [ll.lng, ll.lat])
    })
    rotateMarker.on('drag', () => {
      if (!rotateBase || !rotatePivot) return
      const ll = rotateMarker.getLngLat()
      const delta = turf.bearing(rotatePivot, [ll.lng, ll.lat]) - startBearing
      const baseFC: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: Array.from(rotateBase.entries()).map(([id, geometry]) => ({
          type: 'Feature',
          properties: { id },
          geometry,
        })),
      }
      const rotated = turf.transformRotate(baseFC, delta, { pivot: rotatePivot })
      workingMap.clear()
      for (const feat of rotated.features) {
        workingMap.set(feat.properties!.id as string, feat.geometry as GeoJSON.Polygon)
      }
      pushData()
    })
    rotateMarker.on('dragend', () => {
      rotateBase = null
      rotatePivot = null
      placeHandle() // snap the handle back above the rotated group
    })

    // ── Move ── a drag that STARTS on the group slides it; a drag on empty map
    // still pans. Hit-test the working layer on pointer-down.
    let moveBase: Map<string, GeoJSON.Polygon> | null = null
    let moveStart: mapboxgl.LngLat | null = null
    const onDown = (e: mapboxgl.MapMouseEvent | mapboxgl.MapTouchEvent) => {
      const hit = map.queryRenderedFeatures(e.point, { layers: ['reposition-fill'] })
      if (hit.length === 0) return // empty map → let Mapbox pan
      e.preventDefault()
      map.dragPan.disable()
      handleEl.style.cursor = 'grabbing'
      moveBase = cloneWorking()
      moveStart = e.lngLat
    }
    const onMove = (e: mapboxgl.MapMouseEvent | mapboxgl.MapTouchEvent) => {
      if (!moveBase || !moveStart) return
      const dLng = e.lngLat.lng - moveStart.lng
      const dLat = e.lngLat.lat - moveStart.lat
      workingMap.clear()
      for (const [id, g] of moveBase) workingMap.set(id, translatePolygon(g, dLng, dLat))
      pushData()
      placeHandle()
    }
    const onUp = () => {
      if (!moveBase) return
      moveBase = null
      moveStart = null
      map.dragPan.enable()
      handleEl.style.cursor = 'grab'
      placeHandle()
    }
    map.on('mousedown', onDown)
    map.on('touchstart', onDown)
    map.on('mousemove', onMove)
    map.on('touchmove', onMove)
    map.on('mouseup', onUp)
    map.on('touchend', onUp)

    return () => {
      repositioningRef.current = false
      map.off('mousedown', onDown)
      map.off('touchstart', onDown)
      map.off('mousemove', onMove)
      map.off('touchmove', onMove)
      map.off('mouseup', onUp)
      map.off('touchend', onUp)
      try {
        rotateMarkerRef.current?.remove()
      } catch {
        /* ignore */
      }
      rotateMarkerRef.current = null
      try {
        if (map.getLayer('reposition-fill')) map.removeLayer('reposition-fill')
        if (map.getLayer('reposition-outline')) map.removeLayer('reposition-outline')
        if (map.getSource('reposition')) map.removeSource('reposition')
      } catch {
        /* map may be tearing down — ignore */
      }
      try {
        map.dragPan.enable()
        const vm = viewModeRef.current
        map.setPaintProperty('fields-fill', 'fill-opacity', vm === 'crop' ? 0.92 : 0.4)
        map.setLayoutProperty('fields-label', 'visibility', 'visible')
      } catch {
        /* ignore */
      }
    }
    // viewMode intentionally omitted — flipping the basemap mustn't reset the move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repositionIds, ready, fields])

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
      setDrawKind(null)
    } else {
      draw.changeMode('draw_polygon')
      setDrawing(true)
      setDrawKind('block')
    }
  }

  function toggleDitch() {
    const draw = drawRef.current
    if (!draw) return
    if (drawing) {
      draw.changeMode('simple_select')
      draw.deleteAll()
      setDrawing(false)
      setDrawKind(null)
    } else {
      draw.changeMode('draw_line_string')
      setDrawing(true)
      setDrawKind('ditch')
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
      // Fill the map shell, which is locked to the dynamic viewport height.
      // h-full (not a static 100vh calc) keeps the map exactly its container's
      // size, so nothing overflows and the on-map controls can't scroll out of
      // view on mobile.
      className="relative flex-1 h-full"
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
      <div className="absolute left-1/2 -translate-x-1/2 z-10 bottom-8 lg:bottom-auto lg:top-3">
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

      {/* Labeled action buttons — overlay the map at top-left. Hidden while
          repositioning so the move/rotate gesture owns the map. */}
      {!repositionIds && (
      <div className="absolute top-3 left-3 right-14 md:right-auto z-10 flex flex-col gap-2 pointer-events-none items-start">
        {/* Cap the row width below lg so the buttons wrap into a tidy block at
            top-left instead of stretching across the tablet toward the zoom
            controls. Full single row on desktop. */}
        <div className="flex flex-wrap gap-2 pointer-events-none max-w-[21rem] lg:max-w-none">
          {onShowFields && (
            <button
              type="button"
              onClick={onShowFields}
              className="pointer-events-auto inline-flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold shadow-md transition bg-white text-primary border-2 border-primary hover:bg-primary/5"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
              Blocks ({fields.length})
            </button>
          )}
          <button
            type="button"
            onClick={toggleDraw}
            disabled={!ready || drawKind === 'ditch'}
            className={`pointer-events-auto inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold shadow-md transition disabled:opacity-50 ${
              drawKind === 'block'
                ? 'bg-white text-primary border-2 border-primary hover:bg-gray-50'
                : 'bg-accent text-primary-dark hover:bg-accent-dark'
            }`}
          >
            {drawKind === 'block' ? (
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
                Draw a block
              </>
            )}
          </button>

          <button
            type="button"
            onClick={toggleDitch}
            disabled={!ready || drawKind === 'block'}
            className={`pointer-events-auto inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold shadow-md transition disabled:opacity-50 ${
              drawKind === 'ditch'
                ? 'bg-white text-primary border-2 border-primary hover:bg-gray-50'
                : 'bg-white text-primary border-2 border-primary hover:bg-primary/5'
            }`}
          >
            {drawKind === 'ditch' ? (
              <>
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                Finish ditch
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" d="M3 15 L8 8 L12 12 L17 4" />
                </svg>
                Draw ditch
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
            {drawKind === 'ditch'
              ? 'Click along the ditch line. Double-click the last point to finish. Press Esc to cancel.'
              : 'Click each corner of the block. Double-click the last corner to finish. Press Esc to cancel.'}
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
      )}

      {/* Reposition bar — drag the highlighted group to slide it, use the corner
          handle to rotate, then Save. Shapes/acreage never change. */}
      {repositionIds && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 w-[calc(100%-1.5rem)] max-w-md">
          <div className="rounded-lg bg-white shadow-lg border border-gray-200 px-4 py-3">
            <p className="text-sm font-semibold text-primary">
              Repositioning {repositionIds.size} block{repositionIds.size === 1 ? '' : 's'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5 leading-snug">
              Drag the highlighted blocks to slide them. Use the round handle above
              them to rotate. Shapes and acreage stay the same.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                disabled={savingReposition}
                onClick={async () => {
                  setSavingReposition(true)
                  const features = Array.from(repositionWorkingRef.current.entries()).map(
                    ([id, geometry]) => ({ id, geometry }),
                  )
                  try {
                    await onSaveReposition(features)
                  } finally {
                    setSavingReposition(false)
                  }
                }}
                className="btn-primary flex-1 text-sm disabled:opacity-50"
              >
                {savingReposition ? 'Saving…' : 'Save new position'}
              </button>
              <button
                type="button"
                disabled={savingReposition}
                onClick={onCancelReposition}
                className="flex-1 text-sm font-semibold rounded-md border-2 border-gray-300 text-gray-600 px-3 py-2 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
                      className="inline-block w-3.5 h-3.5 rounded border border-gray-300 shadow-sm"
                      style={{ backgroundColor: r.color }}
                      aria-hidden="true"
                    />
                    <span>{r.label}</span>
                  </li>
                ))}
                <li className="flex items-center gap-2 text-xs text-gray-500 pt-1 mt-1 border-t border-gray-100">
                  <span
                    className="inline-block w-3.5 h-3.5 rounded border border-gray-300 shadow-sm"
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
