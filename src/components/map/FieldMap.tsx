'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import * as turf from '@turf/turf'
import 'mapbox-gl/dist/mapbox-gl.css'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import type { FieldRow } from '@/lib/fields'
import type { CaneState } from '@/lib/types'
import { UNSET_RATOON_COLOR } from '@/lib/ratoon-colors'
import type { StageColor } from '@/lib/resolve-colors'
import * as Sentry from '@sentry/nextjs'
import dynamic from 'next/dynamic'

// Leaflet (the lite-mode engine) touches `window` at import time — load it
// only in the browser, and only when lite mode actually engages.
const LiteMap = dynamic(() => import('./LiteMap'), { ssr: false })
import type { AnnotationRow } from '@/lib/annotations'
import { cornerLabelAnchors } from './cornerLabels'
import { ALL_LABEL_FIELDS, type LabelField } from '@/lib/label-fields'
import MapLegend from './MapLegend'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
const SELECTED_COLOR = '#E8A33D'

// Where-you-were camera memory (Lance: "no matter what they're working on,
// when done they want to go back to where they were on the map"). Saved per
// org on every moveend; restored on the next map mount instead of the
// whole-farm fit. Layer changes still reframe (that's an explicit action).
function cameraStorageKey(orgId: string | undefined): string {
  return 'hl-cam:' + (orgId ?? 'org')
}
function loadSavedCamera(orgId: string | undefined): {
  lng: number
  lat: number
  zoom: number
  bearing: number
  pitch: number
} | null {
  try {
    const raw = localStorage.getItem(cameraStorageKey(orgId))
    if (!raw) return null
    const c = JSON.parse(raw) as { lng: number; lat: number; zoom: number; bearing: number; pitch: number }
    if (!Number.isFinite(c.lng) || !Number.isFinite(c.lat) || !Number.isFinite(c.zoom)) return null
    return c
  } catch {
    return null
  }
}

// Pencil cursor while a draw tool is armed — hotspot at the pencil tip.
// Annotation color choices — dark default first (readable on both map styles).
const ANNO_COLORS = ['#111827', '#DC2626', '#2563EB', '#16A34A', '#EA580C', '#7C3AED']

export const PENCIL_CURSOR =
  'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAuUlEQVR4nO2U4Q2CMBBGe13CRHeQCWQSx2MSnEB2qIlTfOZMmhz0BHq98MuX8AMK77VpSgh/jgIAtOfRS/4eejUSveSMFole8swyYg4AwKXvwuk+FmMyElvkjBbheyIiUwBCnpERKWeoVS5J43Mmr1oBDPLdARjluwJokG8GWuWrAQ/5z4CXnCleOt+u6l/RIq8+aKlSXgR49izhy0O+ugIZSUb5LJBnn5GbTEb591sZkAOvx2SWHsoH0v2NW7G57dwAAAAASUVORK5CYII=) 2 21, crosshair'
const UNSET_COLOR = UNSET_RATOON_COLOR

const SATELLITE_STYLE = 'mapbox://styles/mapbox/satellite-streets-v12'
const CROP_STYLE = 'mapbox://styles/mapbox/light-v11'

// Centroids for default map center if user has no fields yet.
const STATE_CENTERS: Record<CaneState, [number, number]> = {
  LA: [-91.5, 30.0],
  FL: [-80.7, 26.6],
}

// True when a block renders as a white context block (filtered out by the
// layer selection, or the white-map state). Plain blocks keep ALL their
// labels — id, acreage, cycle, variety — in black; only the fill whitens.
const PLAIN = ['to-boolean', ['get', 'plain']]

// Which palette paints the blocks: year-cane colors or variety colors. Filters
// choose WHICH blocks highlight; colorBy chooses the palette — so a stage
// filter and a variety filter can stack without their colors fighting.
export type ColorBy = 'stage' | 'variety'

function fillColorExpression(
  selectedFieldId: string | null,
  colorBy: ColorBy,
  stageColors: StageColor[],
  varietyColors: Record<string, string>,
  highlightColor: string | null,
  blockColors: Record<string, string> | null,
): mapboxgl.ExpressionSpecification {
  const varietyPairs = Object.entries(varietyColors).flatMap(([k, c]) => [k, c])
  const blockPairs = blockColors ? Object.entries(blockColors).flatMap(([k, c]) => [k, c]) : []
  // Plan viewing paints per-block colors (each step of the plan its own
  // color); single-color highlight covers a lone step or draft.
  const paletteExpr =
    blockPairs.length > 0
      ? ['match', ['get', 'id'], ...blockPairs, highlightColor ?? '#FFFFFF']
      : highlightColor
        ? highlightColor
        : colorBy === 'variety' && varietyPairs.length > 0
          ? ['match', ['coalesce', ['get', 'variety'], ''], ...varietyPairs, UNSET_COLOR]
          : [
              'match',
              ['coalesce', ['get', 'ratoon'], 'unset'],
              ...stageColors.flatMap((r) => [r.key, r.color]),
              UNSET_COLOR,
            ]
  return [
    'case',
    ['==', ['get', 'id'], ['literal', selectedFieldId ?? '']],
    SELECTED_COLOR,
    // Filtered-out / white-map blocks go white; matches keep their colors.
    PLAIN,
    '#FFFFFF',
    paletteExpr,
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
// light crop-map background. The selected block always shows the highlight color.
function lineColorExpression(
  selectedFieldId: string | null,
  viewMode: ViewMode,
): mapboxgl.ExpressionSpecification {
  const base = viewMode === 'crop' ? '#374151' : '#FFFFFF'
  return [
    'case',
    ['==', ['get', 'id'], ['literal', selectedFieldId ?? '']],
    SELECTED_COLOR,
    base,
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

export type ViewMode = 'satellite' | 'crop'

// Center label: the cut/ratoon abbreviated to sit in the middle of the block
// (P = plant cane, 1st–5th stubble, 6th+, F = fallow). Blank when unset. Block
// id and acreage go in the corners via a separate points layer.
function cutLabelExpression(): mapboxgl.ExpressionSpecification {
  return [
    'match',
    ['get', 'ratoon'],
    'plant_cane', 'P',
    'first_stubble', '1',
    'second_stubble', '2',
    'third_stubble', '3',
    'fourth_stubble', '4',
    'fifth_stubble_plus', '5',
    'sixth_stubble_plus', '6+',
    'fallow', 'F',
    '',
  ] as unknown as mapboxgl.ExpressionSpecification
}

// Zoom-scaled text size (grows as you zoom in). center=true is the big middle
// cut label; the corner id/acres labels are smaller.
function labelSize(center: boolean): mapboxgl.ExpressionSpecification {
  return center
    ? ['interpolate', ['linear'], ['zoom'], 13, 13, 17, 22]
    : ['interpolate', ['linear'], ['zoom'], 14, 10, 17, 15]
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
  // Snapshot/history views: hide every edit affordance (draw, line, text,
  // geometry edits, annotation deletes). The map becomes look-and-zoom only.
  readOnly?: boolean
  // Bulk-select mode: tapping a block on the map toggles it in/out of the set.
  selectMode: boolean
  selectedIds: Set<string>
  onToggleFieldSelected: (id: string) => void
  // Reposition mode: the ids of blocks to move/rotate as a rigid group, or null.
  repositionIds: Set<string> | null
  onSaveReposition: (features: { id: string; geometry: GeoJSON.Polygon }[]) => Promise<void>
  onCancelReposition: () => void
  // View mode is lifted to MapShell so the sidebar's print links can follow it.
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  // Layer filter: ids of blocks matching the active layer selection, or null
  // when no filter is on. Non-matching blocks render white with labels hidden.
  filterIds: Set<string> | null
  // Deep link: zoom the camera to this block on load (Operations to-dos).
  focusFieldId: string | null
  // Plantation isolation: when plantations are selected, only these block ids
  // exist on the map (others are omitted, not whitened) and the camera zooms
  // to them. null = whole operation visible.
  visibleIds: Set<string> | null
  // Stable key for visibleIds so the camera refits only when the plantation
  // selection actually changes.
  visibleKey: string
  // Signature of the full selection intent (stage/variety/plantation/plan/
  // deselect). Changes when a LAYER is picked — the camera reframes to the
  // highlighted blocks then — but not on a plain data refresh.
  selectionKey: string
  // White-map state (deselect-all or a fly plan): every non-matching block is
  // white but ALL labels stay visible in black — the printed spray-sheet look,
  // live. Replaces the old spray view mode.
  whiteMap: boolean
  // Fly-plan viewing: paint the matching blocks this single color instead of
  // the stage/variety palette.
  highlightColor: string | null
  // Plan-set viewing/drafting: per-block colors (each step of a plan its own
  // color). Wins over highlightColor for the listed blocks.
  blockColors: Record<string, string> | null
  // Palette that paints the blocks (stage = year cane colors, variety = variety
  // colors), with the farm's custom colors already resolved in.
  colorBy: ColorBy
  stageColors: StageColor[]
  varietyColors: Record<string, string>
  /** which of the 4 facts to render on blocks; absent = all four */
  labelFields?: ReadonlySet<LabelField>
  // Hand-drawn reference lines + text labels ("Hwy 308", "Shop house").
  annotations: AnnotationRow[]
  onCreateAnnotation: (
    kind: 'line' | 'text',
    geometry: GeoJSON.LineString | GeoJSON.Point,
    text?: string,
    style?: { size?: number; rotation?: number; width?: number; color?: string },
  ) => Promise<void>
  onUpdateAnnotation?: (
    id: string,
    patch: {
      geometry?: GeoJSON.LineString | GeoJSON.Point
      text?: string
      size?: number
      rotation?: number
      width?: number | null
      color?: string
    },
  ) => Promise<void>
  onDeleteAnnotation: (id: string) => Promise<void>
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
  readOnly = false,
  selectMode,
  selectedIds,
  onToggleFieldSelected,
  repositionIds,
  onSaveReposition,
  onCancelReposition,
  viewMode,
  onViewModeChange,
  filterIds,
  focusFieldId,
  visibleIds,
  visibleKey,
  selectionKey,
  whiteMap,
  highlightColor,
  blockColors,
  colorBy,
  stageColors,
  varietyColors,
  labelFields,
  annotations,
  onCreateAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
}: FieldMapProps) {
  const labelFieldsRef = useRef<ReadonlySet<LabelField>>(labelFields ?? new Set(ALL_LABEL_FIELDS))
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const drawRef = useRef<MapboxDraw | null>(null)
  const fieldsRef = useRef<FieldRow[]>([])
  fieldsRef.current = fields
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
  // Map click handlers are bound once; read live select-mode state via refs.
  const selectModeRef = useRef(selectMode)
  const onToggleSelectedRef = useRef(onToggleFieldSelected)
  selectModeRef.current = selectMode
  onToggleSelectedRef.current = onToggleFieldSelected
  // Live draw-kind + annotation callbacks for the once-bound map handlers.
  const drawKindRef = useRef<'block' | 'line' | 'text' | 'freehand' | null>(null)
  // True while a draw is being cancelled: mapbox-gl-draw COMMITS the
  // in-progress shape when the mode is programmatically exited (same
  // draw.create as a real finish), so cancel flags the exit and the create
  // handler swallows it.
  const cancelingDrawRef = useRef(false)
  const onCreateFieldRef = useRef(onCreateField)
  const onUpdateFieldRef = useRef(onUpdateField)
  const onCreateAnnotationRef = useRef(onCreateAnnotation)
  const onUpdateAnnotationRef = useRef(onUpdateAnnotation)
  const onDeleteAnnotationRef = useRef(onDeleteAnnotation)
  const readOnlyRef = useRef(readOnly)
  readOnlyRef.current = readOnly
  onCreateFieldRef.current = onCreateField
  onUpdateFieldRef.current = onUpdateField
  onCreateAnnotationRef.current = onCreateAnnotation
  onUpdateAnnotationRef.current = onUpdateAnnotation
  onDeleteAnnotationRef.current = onDeleteAnnotation
  const [savingReposition, setSavingReposition] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // No-WebGL2 machines (old farm-office Windows boxes) get the SVG crop map
  // instead of a dead pane — see LiteMap.
  const [liteMode, setLiteMode] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const [drawKind, setDrawKind] = useState<'block' | 'line' | 'text' | 'freehand' | null>(null)
  // Line tool: ONE toolbar button opens a chooser — freehand stroke or
  // point-to-point — plus a thickness pick that applies to both.
  const [lineChooser, setLineChooser] = useState(false)
  // Editing an EXISTING annotation (move/resize after drawing).
  const [textEdit, setTextEdit] = useState<{
    id: string
    lng: number
    lat: number
    value: string
    size: number
    rotation: number
    color: string
  } | null>(null)
  const [lineEdit, setLineEdit] = useState<{ id: string; width: number; color: string } | null>(null)
  const annotEditRef = useRef(false)
  annotEditRef.current = !!textEdit || !!lineEdit
  const textEditMarkerRef = useRef<mapboxgl.Marker | null>(null)
  // In-progress draw clicks — visible dots so the start point is unmistakable.
  const progressPtsRef = useRef<[number, number][]>([])
  const [lineWidth, setLineWidth] = useState(3)
  const lineWidthRef = useRef(3)
  lineWidthRef.current = lineWidth
  const [lineColor, setLineColor] = useState('#111827')
  const lineColorRef = useRef('#111827')
  lineColorRef.current = lineColor
  const freehandPtsRef = useRef<[number, number][]>([])
  // Text-label placement: after the grower clicks a spot, this holds the spot
  // while they type the label into the overlay input.
  const [textDraft, setTextDraft] = useState<{
    lng: number
    lat: number
    value: string
    size: number
    rotation: number
    color: string
  } | null>(null)
  const textMarkerRef = useRef<mapboxgl.Marker | null>(null)
  drawKindRef.current = drawKind
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

    // ?lite=1 forces the SVG fallback — for testing and for demoing what an
    // old machine will see.
    if (window.location.search.includes('lite=1')) {
      setLiteMode(true)
      return
    }

    // WebGL2 pre-flight on a THROWAWAY canvas — never Mapbox's own canvas
    // (probing that one after Mapbox grabs it returns null = false positive,
    // which is why an earlier check here was removed). Mapbox GL v3 hard-
    // requires WebGL2; without it the map can never render, so fall back to
    // the SVG crop map instead of a blank pane.
    try {
      const probe = document.createElement('canvas')
      const gl = probe.getContext('webgl2')
      if (!gl) {
        Sentry.captureMessage('webgl2-unavailable: falling back to LiteMap', {
          level: 'warning',
          extra: { ua: navigator.userAgent },
        })
        setLiteMode(true)
        return
      }
    } catch {
      setLiteMode(true)
      return
    }

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
      // Constructor threw (context creation failed despite the probe, driver
      // quirk, etc.) — same story: give them the SVG crop map, tell Sentry.
      Sentry.captureException(e)
      setLiteMode(true)
      return
    }

    // Surface ANY Mapbox runtime error visibly. Errors during dev are rare
    // enough that even noisy tile-fetch failures are worth showing.
    // Debug handle, same convention as LiteMap's __liteMap — lets dev tooling
    // project coordinates for scripted UI checks.
    ;(window as unknown as { __map?: mapboxgl.Map }).__map = map

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

    // Persist the camera on every settle so returning to the map restores it.
    map.on('moveend', () => {
      if (readOnlyRef.current) return
      try {
        const c = map.getCenter()
        localStorage.setItem(
          cameraStorageKey(fieldsRef.current?.[0]?.org_id),
          JSON.stringify({
            lng: c.lng,
            lat: c.lat,
            zoom: map.getZoom(),
            bearing: map.getBearing(),
            pitch: map.getPitch(),
          }),
        )
      } catch {
        /* storage full/blocked — position memory is best-effort */
      }
    })

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
        e.mode === 'draw_polygon' ? 'block' : e.mode === 'draw_line_string' ? 'line' : null
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
          // Initial paint; the view-mode effect re-applies the live palette.
          'fill-color': fillColorExpression(selectedFieldId, 'stage', stageColors, {}, null, null),
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
      // Bulk-select highlight — bright outline on blocks toggled on in the map.
      map.addSource('selected-highlight', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'selected-highlight-line',
        type: 'line',
        source: 'selected-highlight',
        paint: { 'line-color': '#22D3EE', 'line-width': 4 },
      })
      // Per-block label points: a 'center' point (the cut) at the block's
      // middle, plus 'id' (top-left) and 'acres' (bottom-right) corner points,
      // all computed from each block's bounding box. Labeling POINTS instead of
      // the polygon matters: a symbol on a big polygon gets its centroid label
      // duplicated once per tile the polygon spans at high zoom — points don't.
      map.addSource('field-corner-labels', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'fields-label',
        type: 'symbol',
        source: 'field-corner-labels',
        filter: ['==', ['get', 'corner'], 'center'],
        layout: {
          // Center of the block: the cut, abbreviated (P / 1st / … / F).
          'text-field': cutLabelExpression(),
          'text-size': labelSize(true),
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        },
        paint: {
          'text-color': '#FFFFFF',
          'text-halo-color': '#0F2A1F',
          'text-halo-width': 1.5,
        },
      })
      // Corner labels only appear once zoomed in enough to fit: minzoom floor +
      // Mapbox's built-in label collision (which hides a label until there's room).
      map.addLayer({
        id: 'field-label-id',
        type: 'symbol',
        source: 'field-corner-labels',
        filter: ['==', ['get', 'corner'], 'id'],
        minzoom: 14,
        layout: {
          'text-field': ['get', 'text'],
          'text-size': labelSize(false),
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-anchor': 'top-left',
          'text-offset': [0.3, 0.3],
        },
        paint: { 'text-color': '#FFFFFF', 'text-halo-color': '#0F2A1F', 'text-halo-width': 1.5 },
      })
      map.addLayer({
        id: 'field-label-variety',
        type: 'symbol',
        source: 'field-corner-labels',
        filter: ['==', ['get', 'corner'], 'variety'],
        minzoom: 14,
        layout: {
          'text-field': ['get', 'text'],
          'text-size': labelSize(false),
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-anchor': 'top-right',
          'text-offset': [-0.3, 0.3],
          'text-max-width': 8,
        },
        paint: { 'text-color': '#FFFFFF', 'text-halo-color': '#0F2A1F', 'text-halo-width': 1.5 },
      })
      map.addLayer({
        id: 'field-label-acres',
        type: 'symbol',
        source: 'field-corner-labels',
        filter: ['==', ['get', 'corner'], 'acres'],
        minzoom: 14,
        layout: {
          'text-field': ['get', 'text'],
          'text-size': labelSize(false),
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-anchor': 'bottom-right',
          'text-offset': [-0.3, -0.3],
        },
        paint: { 'text-color': '#FFFFFF', 'text-halo-color': '#0F2A1F', 'text-halo-width': 1.5 },
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
              (readOnlyRef.current
                ? ''
                : `<a href="/app/fields/${featureId}" style="display:inline-block;margin-top:10px;font-weight:600;font-size:14px;color:#1A3D2E">Open block →</a>`) +
              `</div>`,
          )
          .addTo(map)
      }

      map.on('click', 'fields-fill', (e) => {
        // Mid-draw clicks (block corners, line points, text placement) must
        // not select blocks or pop the info card.
        if (drawKindRef.current !== null) return
        const props = e.features?.[0]?.properties
        // In bulk-select mode, a click toggles the block in/out of the set.
        if (selectModeRef.current && typeof props?.id === 'string') {
          onToggleSelectedRef.current(props.id)
          return
        }
        openFieldInfo(props, e.lngLat)
      })

      // Hand-drawn annotations: reference lines + text labels. Kept above the
      // block layers so a road drawn across blocks stays visible.
      map.addSource('annotations', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'annotations-line',
        type: 'line',
        source: 'annotations',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: {
          'line-color': ['get', 'color'] as unknown as mapboxgl.ExpressionSpecification,
          // Ground-true width: annotations are painted ON the farm, so they
          // scale with it (double per zoom level, anchored at z15 — the
          // typical zoom when drawing). A constant screen width made lines
          // grow huge relative to blocks when zooming out.
          'line-width': [
            'interpolate',
            ['exponential', 2],
            ['zoom'],
            10,
            ['/', ['coalesce', ['get', 'width'], 3], 32],
            15,
            ['coalesce', ['get', 'width'], 3],
            20,
            ['*', ['coalesce', ['get', 'width'], 3], 32],
          ] as unknown as mapboxgl.ExpressionSpecification,
        },
      })
      map.addLayer({
        id: 'annotations-text',
        type: 'symbol',
        source: 'annotations',
        filter: ['==', ['geometry-type'], 'Point'],
        layout: {
          'text-field': ['get', 'text'],
          // Ground-true size: a note is painted ON the field (like the blocks),
          // so it scales with the ground — doubling per zoom level, anchored
          // at z15 where labels are typically placed. Constant screen size
          // made notes dwarf the whole farm once zoomed out.
          'text-size': [
            'interpolate',
            ['exponential', 2],
            ['zoom'],
            10,
            ['/', ['get', 'size'], 32],
            15,
            ['get', 'size'],
            20,
            ['*', ['get', 'size'], 32],
          ],
          'text-rotate': ['get', 'rotation'],
          // Rotate/tilt with the map, not the screen — a label aligned along
          // the rows STAYS along the rows when the map turns.
          'text-rotation-alignment': 'map',
          'text-pitch-alignment': 'map',
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': ['get', 'color'] as unknown as mapboxgl.ExpressionSpecification,
          'text-halo-color': '#FFFFFF',
          'text-halo-width': 2,
        },
      })

      // Visible dots at each clicked vertex while drawing — the START point
      // especially, so the grower can see exactly where the line/block began
      // (and where to double-click/close).
      map.addSource('draw-progress', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'draw-progress-dots',
        type: 'circle',
        source: 'draw-progress',
        paint: {
          'circle-radius': ['case', ['==', ['get', 'first'], true], 7, 5],
          'circle-color': ['case', ['==', ['get', 'first'], true], '#E8A33D', '#FFFFFF'],
          'circle-stroke-color': ['case', ['==', ['get', 'first'], true], '#FFFFFF', '#1A3D2E'],
          'circle-stroke-width': 2,
        },
      })
      map.on('click', (e) => {
        const kind = drawKindRef.current
        if (kind !== 'block' && kind !== 'line') return
        progressPtsRef.current.push([e.lngLat.lng, e.lngLat.lat])
        const src = map.getSource('draw-progress') as mapboxgl.GeoJSONSource | undefined
        src?.setData({
          type: 'FeatureCollection',
          features: progressPtsRef.current.map(([lng, lat], i) => ({
            type: 'Feature',
            properties: { first: i === 0 },
            geometry: { type: 'Point', coordinates: [lng, lat] },
          })),
        })
      })

      // Click a line/label (outside any draw mode) → offer to remove it.
      const openAnnotationDelete = (
        props: Record<string, unknown> | null | undefined,
        lngLat: mapboxgl.LngLat,
      ) => {
        const annId = props?.id
        if (typeof annId !== 'string') return
        popupRef.current?.remove()
        const node = document.createElement('div')
        node.style.cssText = 'font-family:system-ui,sans-serif;min-width:130px'
        const label = document.createElement('div')
        label.style.cssText = 'font-weight:700;color:#1A3D2E;font-size:13px'
        label.textContent = props?.kind === 'text' ? 'Text label' : 'Drawn line'
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.style.cssText =
          'margin-top:8px;font-weight:600;font-size:13px;color:#B91C1C;background:none;border:none;padding:0;cursor:pointer'
        btn.textContent = 'Delete'
        btn.onclick = async () => {
          await onDeleteAnnotationRef.current(annId)
          popupRef.current?.remove()
        }
        const edit = document.createElement('button')
        edit.type = 'button'
        edit.style.cssText =
          'margin-top:8px;margin-right:14px;font-weight:600;font-size:13px;color:#1A3D2E;background:none;border:none;padding:0;cursor:pointer'
        edit.textContent = props?.kind === 'text' ? 'Move / edit' : 'Move / reshape'
        edit.onclick = () => {
          popupRef.current?.remove()
          if (props?.kind === 'text') {
            const [lng, lat] = (
              JSON.parse(String(props?.geomJson ?? '{"coordinates":[0,0]}')) as {
                coordinates: [number, number]
              }
            ).coordinates
            setTextEdit({
              id: annId,
              lng,
              lat,
              value: String(props?.text ?? ''),
              size: Number(props?.size ?? 16),
              rotation: Number(props?.rotation ?? 0),
              color: String(props?.color ?? '#111827'),
            })
          } else {
            setLineEdit({ id: annId, width: Number(props?.width ?? 3), color: String(props?.color ?? '#111827') })
          }
        }
        node.append(label)
        if (!readOnlyRef.current && onUpdateAnnotationRef.current) node.append(edit)
        if (!readOnlyRef.current) node.append(btn)
        popupRef.current = new mapboxgl.Popup({ closeButton: true, offset: 8, maxWidth: '220px' })
          .setLngLat(lngLat)
          .setDOMContent(node)
          .addTo(map)
      }
      for (const layerId of ['annotations-line', 'annotations-text']) {
        map.on('click', layerId, (e) => {
          if (drawKindRef.current || selectModeRef.current || repositioningRef.current) return
          if (annotEditRef.current) return
          openAnnotationDelete(e.features?.[0]?.properties, e.lngLat)
        })
        map.on('mouseenter', layerId, () => {
          if (drawKindRef.current) return
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', layerId, () => {
          map.getCanvas().style.cursor = drawKindRef.current ? PENCIL_CURSOR : ''
        })
      }

      // Text-label placement: one click picks the spot, then the overlay input
      // takes the label text.
      map.on('click', (e) => {
        if (drawKindRef.current === 'text') {
          setTextDraft({ lng: e.lngLat.lng, lat: e.lngLat.lat, value: '', size: 16, rotation: 0, color: '#111827' })
          setDrawKind(null)
          setDrawing(false)
          return
        }
        // Clicking open ground (no block, no annotation) clears the selection
        // instead of leaving the last block highlighted forever.
        if (drawKindRef.current || selectModeRef.current || repositioningRef.current) return
        const hit = map.queryRenderedFeatures(e.point, {
          layers: ['fields-fill', 'annotations-line', 'annotations-text'],
        })
        if (hit.length === 0) {
          onSelectField(null)
          popupRef.current?.remove()
        }
      })

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
        if (drawKindRef.current === 'text') return
        const rect = canvasEl.getBoundingClientRect()
        const pt: [number, number] = [tch.clientX - rect.left, tch.clientY - rect.top]
        // Annotations first (they sit above the blocks) — with a padded hit
        // box, since a 3px line is unhittable with a fingertip. Tapping one
        // opens its delete popup; this was impossible on mobile before.
        if (!selectModeRef.current && !drawKindRef.current) {
          const pad = 10
          const annFeats = map.queryRenderedFeatures(
            [
              [pt[0] - pad, pt[1] - pad],
              [pt[0] + pad, pt[1] + pad],
            ],
            { layers: ['annotations-line', 'annotations-text'] },
          )
          if (annFeats.length) {
            openAnnotationDelete(annFeats[0].properties, map.unproject(pt))
            return
          }
        }
        const feats = map.queryRenderedFeatures(pt, { layers: ['fields-fill'] })
        if (!feats.length) {
          // Tapped open ground — clear the block selection.
          if (!selectModeRef.current) {
            onSelectField(null)
            popupRef.current?.remove()
          }
          return
        }
        const props = feats[0].properties
        if (selectModeRef.current && typeof props?.id === 'string') {
          onToggleSelectedRef.current(props.id)
          return
        }
        openFieldInfo(props, map.unproject(pt))
      }
      canvasEl.addEventListener('touchstart', onTapStart, { passive: true })
      canvasEl.addEventListener('touchend', onTapEnd, { passive: true })
      tapCleanup = () => {
        canvasEl.removeEventListener('touchstart', onTapStart)
        canvasEl.removeEventListener('touchend', onTapEnd)
      }
      map.on('mouseenter', 'fields-fill', () => {
        if (drawKindRef.current) return
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'fields-fill', () => {
        if (drawKindRef.current) {
          map.getCanvas().style.cursor = PENCIL_CURSOR
          return
        }
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
      if (readOnlyRef.current) {
        draw.deleteAll()
        setDrawing(false)
        return
      }
      if (cancelingDrawRef.current) {
        // Cancelled — discard whatever the mode exit tried to commit.
        draw.deleteAll()
        setDrawing(false)
        return
      }
      const feature = e.features[0]
      if (feature?.geometry?.type === 'Polygon') {
        await onCreateFieldRef.current(feature.geometry as GeoJSON.Polygon)
      } else if (feature?.geometry?.type === 'LineString') {
        // Reference-line annotation (road, ditch, headland run).
        await onCreateAnnotationRef.current('line', feature.geometry as GeoJSON.LineString, undefined, {
          width: lineWidthRef.current,
          color: lineColorRef.current,
        })
      }
      draw.deleteAll()
      setDrawing(false)
    })
    map.on('draw.update', async (e: { features: GeoJSON.Feature[] }) => {
      if (readOnlyRef.current) return
      const feature = e.features[0]
      const id = feature?.properties?.headlandFieldId
      if (typeof id === 'string' && feature?.geometry?.type === 'Polygon') {
        await onUpdateFieldRef.current(id, feature.geometry as GeoJSON.Polygon)
      }
    })

    onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        cancelingDrawRef.current = true
        try {
          draw.changeMode('simple_select')
          draw.deleteAll()
        } finally {
          cancelingDrawRef.current = false
        }
        setDrawing(false)
        setDrawKind(null)
        setTextDraft(null)
        setTextEdit(null)
        setLineEdit(null)
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

  // Update fields source when fields OR the layer filter change. Each feature
  // carries `dim` — true when a layer filter is on and the block doesn't match —
  // which drives the white fill and hides its labels.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const src = map.getSource('fields') as mapboxgl.GeoJSONSource | undefined
    if (!src) return
    // `plain` = renders white (filtered out or white-map) but KEEPS every
    // label — the farmer still needs id, acreage, cycle, and variety on the
    // surrounding blocks. When plantations are selected, blocks outside them
    // are omitted from the map entirely.
    const isMatch = (f: FieldRow) => (filterIds ? filterIds.has(f.id) : true)
    const visible = visibleIds ? fields.filter((f) => visibleIds.has(f.id)) : fields
    src.setData({
      type: 'FeatureCollection',
      features: visible.map((f) => ({
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          id: f.id,
          name: f.name,
          acreage: f.acreage_cached,
          ratoon: f.current_ratoon ?? 'unset',
          variety: f.variety ?? '',
          plain: !isMatch(f),
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

    // Corner label points: cut in the block's center, id / variety / acres
    // anchored to three actual corners (see cornerLabelAnchors — bbox corners
    // land outside angled cane blocks).
    const cornerSrc = map.getSource('field-corner-labels') as mapboxgl.GeoJSONSource | undefined
    if (cornerSrc) {
      const cornerFeatures = visible.flatMap((f) => {
        const anchors = cornerLabelAnchors(f.geometry.coordinates[0] as [number, number][] | undefined)
        if (!anchors) return []
        const acres = Number(f.acreage_cached || 0)
        const plain = !isMatch(f)
        return [
          {
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: anchors.center },
            properties: { corner: 'center', ratoon: f.current_ratoon ?? 'unset', plain },
          },
          {
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: anchors.id },
            properties: { corner: 'id', text: f.name ?? '', plain },
          },
          {
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: anchors.variety },
            properties: { corner: 'variety', text: f.variety ?? '', plain },
          },
          {
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: anchors.acres },
            properties: { corner: 'acres', text: `${acres.toFixed(2)} ac`, plain },
          },
        ]
      })
      cornerSrc.setData({ type: 'FeatureCollection', features: cornerFeatures })
    }
  }, [fields, ready, filterIds, visibleIds])

  // Camera framing. Farmers live in layers, so picking one has to reframe the
  // map to those blocks — select "plant cane" and the camera zooms out to show
  // every plant-cane block across the farm; pick a plantation and it zooms in.
  // The refit fires on SELECTION changes (selectionKey), never on a plain data
  // refresh — so rotate / move / log / assign (which router.refresh) keep the
  // grower's current view instead of snapping back to the whole farm.
  const didInitialFitRef = useRef(false)
  const prevSelKeyRef = useRef<string | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || fields.length === 0) return
    const firstFit = !didInitialFitRef.current
    const selectionChanged = prevSelKeyRef.current !== selectionKey
    if (!firstFit && !selectionChanged) return // data refresh only → keep view

    // First mount with a remembered position → go straight back there
    // instead of framing the whole farm. (Live map only; a layer selection
    // or Layers change still reframes as an explicit action.)
    if (firstFit && !readOnly && !focusFieldId) {
      const saved = loadSavedCamera(fields[0]?.org_id)
      if (saved) {
        didInitialFitRef.current = true
        prevSelKeyRef.current = selectionKey
        map.jumpTo({
          center: [saved.lng, saved.lat],
          zoom: saved.zoom,
          bearing: saved.bearing ?? 0,
          pitch: saved.pitch ?? 0,
        })
        return
      }
    }

    // With a layer active, frame the highlighted blocks (e.g. all plant cane).
    // On first load or a cleared selection, frame the whole farm (or the
    // isolated plantation).
    let target: FieldRow[]
    if (!firstFit && filterIds && filterIds.size > 0) {
      target = fields.filter((f) => filterIds.has(f.id))
    } else if (visibleIds) {
      target = fields.filter((f) => visibleIds.has(f.id))
    } else {
      target = fields
    }
    didInitialFitRef.current = true
    prevSelKeyRef.current = selectionKey
    if (target.length === 0) return
    const bounds = new mapboxgl.LngLatBounds()
    for (const f of target) {
      for (const ring of f.geometry.coordinates) {
        for (const [lng, lat] of ring) {
          bounds.extend([lng, lat])
        }
      }
    }
    if (!bounds.isEmpty()) {
      // Tight fit: the selection should fill the view at scale, not float in a
      // sea of blank basemap. Animate on a layer change, snap on first load.
      map.fitBounds(bounds, { padding: 32, animate: !firstFit, maxZoom: 16, duration: 500 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectionKey stands in for filterIds/visibleIds
  }, [fields, ready, selectionKey])

  // Deep-link focus: zoom to one block ("half zoomed" — the block plus some
  // neighbors for context). Runs once per focus id, after the farm fit, so
  // arriving from an Operations to-do lands right on the block.
  const focusedRef = useRef<string | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !focusFieldId) return
    if (focusedRef.current === focusFieldId) return
    const f = fields.find((x) => x.id === focusFieldId)
    if (!f) return
    focusedRef.current = focusFieldId
    const bounds = new mapboxgl.LngLatBounds()
    for (const ring of f.geometry.coordinates) {
      for (const [lng, lat] of ring) bounds.extend([lng, lat])
    }
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 140, animate: false, maxZoom: 16 })
    }
  }, [ready, fields, focusFieldId])

  // Bright outline on the bulk-selected blocks (cleared when not selecting).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const src = map.getSource('selected-highlight') as mapboxgl.GeoJSONSource | undefined
    if (!src) return
    const chosen = selectMode ? fields.filter((f) => selectedIds.has(f.id)) : []
    src.setData({
      type: 'FeatureCollection',
      features: chosen.map((f) => ({
        type: 'Feature',
        geometry: f.geometry,
        properties: { id: f.id },
      })),
    })
  }, [selectedIds, selectMode, fields, ready])

  // Push annotations into their source whenever they change.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const src = map.getSource('annotations') as mapboxgl.GeoJSONSource | undefined
    if (!src) return
    const hiddenId = textEdit?.id ?? lineEdit?.id ?? null
    src.setData({
      type: 'FeatureCollection',
      features: annotations
        .filter((a) => a.id !== hiddenId)
        .map((a) => ({
          type: 'Feature' as const,
          geometry: a.geometry,
          properties: {
            id: a.id,
            kind: a.kind,
            text: a.text ?? '',
            color: a.color,
            size: a.size ?? 16,
            rotation: a.rotation ?? 0,
            width: a.width ?? 3,
            geomJson: JSON.stringify(a.geometry),
          },
        })),
    })
  }, [annotations, ready, textEdit, lineEdit])

  // ── Move/edit an existing TEXT label: a draggable marker shows the live
  // position; the panel (below) edits value/size/rotation; Save PATCHes all.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !textEdit) return
    // Mapbox owns the marker ELEMENT's transform (it positions with
    // translate every frame) — rotation must live on an inner span we own,
    // or the slider looks dead.
    const el = document.createElement('div')
    el.style.cssText = 'cursor:grab;'
    const inner = document.createElement('span')
    inner.style.cssText =
      'display:inline-block;font-weight:700;color:' +
      textEdit.color +
      ';font-size:' +
      Math.min(textEdit.size, 28) +
      'px;transform:rotate(' +
      textEdit.rotation +
      'deg);text-shadow:0 0 3px #fff,0 0 3px #fff;white-space:nowrap;'
    inner.textContent = textEdit.value || 'label'
    el.appendChild(inner)
    const marker = new mapboxgl.Marker({ element: el, draggable: true })
      .setLngLat([textEdit.lng, textEdit.lat])
      .addTo(map)
    textEditMarkerRef.current = marker
    marker.on('dragend', () => {
      const ll = marker.getLngLat()
      setTextEdit((prev) => (prev ? { ...prev, lng: ll.lng, lat: ll.lat } : prev))
    })
    return () => {
      marker.remove()
      textEditMarkerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textEdit?.id, ready])

  // keep the preview marker matching the panel's live size/rotation/text —
  // styling targets the INNER span (Mapbox owns the outer's transform).
  useEffect(() => {
    const el = textEditMarkerRef.current?.getElement()
    const inner = el?.firstElementChild as HTMLElement | null
    if (!inner || !textEdit) return
    inner.style.fontSize = Math.min(textEdit.size, 28) + 'px'
    inner.style.transform = 'rotate(' + textEdit.rotation + 'deg)'
    inner.style.color = textEdit.color
    inner.textContent = textEdit.value || 'label'
  }, [textEdit])

  // ── Move/reshape an existing LINE — WYSIWYG: the line stays visible on a
  // dedicated preview layer (live width/color), each corner is a draggable
  // handle, and dragging the line itself slides the whole thing.
  const lineEditCoordsRef = useRef<[number, number][]>([])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !lineEdit) return
    const ann = annotations.find((a) => a.id === lineEdit.id)
    if (!ann || ann.geometry.type !== 'LineString') return
    lineEditCoordsRef.current = ann.geometry.coordinates.map(([lng, lat]) => [lng, lat])

    const data = (): GeoJSON.Feature => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: lineEditCoordsRef.current },
    })
    try {
      if (map.getLayer('line-edit-line')) map.removeLayer('line-edit-line')
      if (map.getSource('line-edit')) map.removeSource('line-edit')
    } catch {
      /* leftovers */
    }
    map.addSource('line-edit', { type: 'geojson', data: data() })
    map.addLayer({
      id: 'line-edit-line',
      type: 'line',
      source: 'line-edit',
      paint: {
        'line-color': lineEdit.color,
        'line-width': [
          'interpolate',
          ['exponential', 2],
          ['zoom'],
          10,
          lineEdit.width / 32,
          15,
          lineEdit.width,
          20,
          lineEdit.width * 32,
        ] as unknown as mapboxgl.ExpressionSpecification,
      },
    })
    const push = () => {
      const src = map.getSource('line-edit') as mapboxgl.GeoJSONSource | undefined
      src?.setData(data())
    }

    // corner handles
    const markers: mapboxgl.Marker[] = []
    const mkHandle = (i: number) => {
      const el = document.createElement('div')
      el.style.cssText =
        'width:16px;height:16px;border-radius:9999px;background:#fff;border:3px solid #E8A33D;box-shadow:0 1px 4px rgba(0,0,0,.4);cursor:grab;'
      const m = new mapboxgl.Marker({ element: el, draggable: true })
        .setLngLat(lineEditCoordsRef.current[i] as [number, number])
        .addTo(map)
      m.on('drag', () => {
        const ll = m.getLngLat()
        lineEditCoordsRef.current[i] = [ll.lng, ll.lat]
        push()
      })
      markers.push(m)
    }
    lineEditCoordsRef.current.forEach((_, i) => mkHandle(i))

    // drag the line itself to slide the whole thing
    let moveBase: [number, number][] | null = null
    let moveStart: mapboxgl.LngLat | null = null
    const onDown = (e: mapboxgl.MapMouseEvent) => {
      const hit = map.queryRenderedFeatures(e.point, { layers: ['line-edit-line'] })
      if (hit.length === 0) return
      e.preventDefault()
      map.dragPan.disable()
      moveBase = lineEditCoordsRef.current.map(([x, y]) => [x, y])
      moveStart = e.lngLat
    }
    const onMove = (e: mapboxgl.MapMouseEvent) => {
      if (!moveBase || !moveStart) return
      const dLng = e.lngLat.lng - moveStart.lng
      const dLat = e.lngLat.lat - moveStart.lat
      lineEditCoordsRef.current = moveBase.map(([x, y]) => [x + dLng, y + dLat])
      push()
      markers.forEach((m, i) => m.setLngLat(lineEditCoordsRef.current[i] as [number, number]))
    }
    const onUp = () => {
      if (!moveBase) return
      moveBase = null
      moveStart = null
      map.dragPan.enable()
    }
    map.on('mousedown', onDown)
    map.on('mousemove', onMove)
    map.on('mouseup', onUp)
    const onEnterLine = () => {
      const c = map.getCanvas?.()
      if (c) c.style.cursor = 'move'
    }
    const onLeaveLine = () => {
      const c = map.getCanvas?.()
      if (c) c.style.cursor = ''
    }
    map.on('mouseenter', 'line-edit-line', onEnterLine)
    map.on('mouseleave', 'line-edit-line', onLeaveLine)

    return () => {
      try {
        map.off('mousedown', onDown)
        map.off('mousemove', onMove)
        map.off('mouseup', onUp)
        map.off('mouseenter', 'line-edit-line', onEnterLine)
        map.off('mouseleave', 'line-edit-line', onLeaveLine)
        markers.forEach((m) => m.remove())
        if (map.getLayer('line-edit-line')) map.removeLayer('line-edit-line')
        if (map.getSource('line-edit')) map.removeSource('line-edit')
        map.dragPan.enable()
      } catch {
        /* map tearing down */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineEdit?.id, ready])

  // live width/color preview while the edit bar sliders move
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !lineEdit) return
    try {
      if (!map.getLayer('line-edit-line')) return
      map.setPaintProperty('line-edit-line', 'line-color', lineEdit.color)
      map.setPaintProperty('line-edit-line', 'line-width', [
        'interpolate',
        ['exponential', 2],
        ['zoom'],
        10,
        lineEdit.width / 32,
        15,
        lineEdit.width,
        20,
        lineEdit.width * 32,
      ] as unknown as mapboxgl.ExpressionSpecification)
    } catch {
      /* layer mid-teardown */
    }
  }, [lineEdit, ready])

  // Pencil cursor while any draw tool is armed; clear the progress dots when
  // the tool changes (finish, cancel, Esc).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    // getCanvas() is undefined once the map is removed — this cleanup runs
    // AFTER the init effect's map.remove() on unmount (React cleans up in
    // definition order), which crashed navigation off the map page.
    const canvas = map.getCanvas?.()
    if (canvas) canvas.style.cursor = drawKind ? PENCIL_CURSOR : ''
    progressPtsRef.current = []
    try {
      const src = map.getSource('draw-progress') as mapboxgl.GeoJSONSource | undefined
      src?.setData({ type: 'FeatureCollection', features: [] })
    } catch {
      /* map tearing down */
    }
    return () => {
      const c = map.getCanvas?.()
      if (c) c.style.cursor = ''
    }
  }, [drawKind, ready])

  // Freehand line drawing: drag paints the stroke (dragPan pauses while the
  // tool is active), release saves it as a line annotation at the chosen
  // thickness. Multi-touch (pinch) is ignored so zooming doesn't scribble.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || drawKind !== 'freehand') return
    const canvas = map.getCanvas()
    map.dragPan.disable()
    canvas.style.cursor = 'crosshair'
    if (!map.getSource('freehand-preview')) {
      map.addSource('freehand-preview', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'freehand-preview-line',
        type: 'line',
        source: 'freehand-preview',
        paint: { 'line-color': '#DC2626', 'line-opacity': 0.9, 'line-width': lineWidth },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      })
    } else {
      map.setPaintProperty('freehand-preview-line', 'line-width', lineWidth)
    }
    const src = () => map.getSource('freehand-preview') as mapboxgl.GeoJSONSource | undefined
    const setPreview = () => {
      const pts = freehandPtsRef.current
      src()?.setData(
        pts.length >= 2
          ? {
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: pts },
              properties: {},
            }
          : { type: 'FeatureCollection', features: [] },
      )
    }
    let active = false
    let lastPt: mapboxgl.Point | null = null
    type PointerEv = (mapboxgl.MapMouseEvent | mapboxgl.MapTouchEvent) & {
      points?: mapboxgl.Point[]
    }
    const start = (e: PointerEv) => {
      if (e.points && e.points.length > 1) return
      active = true
      freehandPtsRef.current = [[e.lngLat.lng, e.lngLat.lat]]
      lastPt = e.point
      e.preventDefault?.()
    }
    const move = (e: PointerEv) => {
      if (!active) return
      if (e.points && e.points.length > 1) {
        active = false
        freehandPtsRef.current = []
        setPreview()
        return
      }
      if (lastPt && e.point.dist(lastPt) < 4) return
      lastPt = e.point
      freehandPtsRef.current.push([e.lngLat.lng, e.lngLat.lat])
      setPreview()
    }
    const end = async () => {
      if (!active) return
      active = false
      const pts = freehandPtsRef.current.slice(0, 500)
      freehandPtsRef.current = []
      setPreview()
      if (pts.length >= 2) {
        await onCreateAnnotationRef.current(
          'line',
          { type: 'LineString', coordinates: pts },
          undefined,
          { width: lineWidthRef.current, color: lineColorRef.current },
        )
        setDrawing(false)
        setDrawKind(null)
      }
    }
    map.on('mousedown', start)
    map.on('mousemove', move)
    map.on('mouseup', end)
    map.on('touchstart', start)
    map.on('touchmove', move)
    map.on('touchend', end)
    return () => {
      // Guarded: this cleanup can run AFTER the init effect's map.remove()
      // on unmount (React cleans up in definition order) — the crash class
      // that took down navigation once already.
      try {
        map.off('mousedown', start)
        map.off('mousemove', move)
        map.off('mouseup', end)
        map.off('touchstart', start)
        map.off('touchmove', move)
        map.off('touchend', end)
        map.dragPan.enable()
        const c = map.getCanvas?.()
        if (c) c.style.cursor = ''
        src()?.setData({ type: 'FeatureCollection', features: [] })
      } catch {
        /* map already removed */
      }
      freehandPtsRef.current = []
    }
  }, [drawKind, ready, lineWidth])

  // Marker showing where a pending text label will land while typing.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    textMarkerRef.current?.remove()
    textMarkerRef.current = null
    if (textDraft) {
      textMarkerRef.current = new mapboxgl.Marker({ color: '#E8A33D' })
        .setLngLat([textDraft.lng, textDraft.lat])
        .addTo(map)
    }
    return () => {
      textMarkerRef.current?.remove()
      textMarkerRef.current = null
    }
  }, [textDraft])

  // Recolor selection + apply the active view mode. Crop mode hides the
  // satellite raster and lightens the background to a blank white plat sheet.
  // whiteMap (deselect-all / fly plan) renders the spray-sheet look: white
  // blocks, heavy black outlines, black labels.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const isCrop = viewMode === 'crop'
    const sheetLook = isCrop && whiteMap
    const onWhiteSheet = isCrop

    map.setPaintProperty(
      'fields-fill',
      'fill-color',
      fillColorExpression(selectedFieldId, colorBy, stageColors, varietyColors, highlightColor, blockColors),
    )
    // Plain (white) blocks render more opaque on satellite so they read as
    // solid white "off" blocks rather than a ghost tint.
    map.setPaintProperty(
      'fields-fill',
      'fill-opacity',
      isCrop
        ? sheetLook
          ? 1
          : 0.92
        : (['case', PLAIN, 0.75, 0.4] as unknown as mapboxgl.ExpressionSpecification),
    )
    map.setPaintProperty(
      'fields-outline',
      'line-color',
      sheetLook
        ? ([
            'case',
            ['==', ['get', 'id'], ['literal', selectedFieldId ?? '']],
            SELECTED_COLOR,
            '#000000',
          ] as unknown as mapboxgl.ExpressionSpecification)
        : lineColorExpression(selectedFieldId, viewMode),
    )
    map.setPaintProperty('fields-outline', 'line-width', sheetLook ? 2.5 : isCrop ? 1.5 : 2)
    // Label colors are per-BLOCK: plain (white) blocks always read in black so
    // their baseline data (id, acreage, cycle, variety) stays legible; colored
    // blocks keep white text with a dark halo. Applies to the center cut label
    // AND the corner labels.
    const textColor = sheetLook
      ? '#111827'
      : (['case', PLAIN, '#111827', '#FFFFFF'] as unknown as mapboxgl.ExpressionSpecification)
    const haloColor = sheetLook
      ? '#FFFFFF'
      : (['case', PLAIN, '#FFFFFF', '#0F2A1F'] as unknown as mapboxgl.ExpressionSpecification)
    for (const id of ['fields-label', 'field-label-id', 'field-label-variety', 'field-label-acres']) {
      map.setPaintProperty(id, 'text-color', textColor)
      map.setPaintProperty(id, 'text-halo-color', haloColor)
    }

    // Crop = a blank white plat sheet: hide EVERY basemap layer (raster,
    // streets, labels, water) and leave only our block layers on a white
    // background. Satellite mode restores them. Swapping visibility (not
    // setStyle) keeps our layers + the draw control intact.
    const ours = new Set([
      'fields-fill',
      'fields-outline',
      'fields-label',
      'field-label-id',
      'field-label-variety',
      'field-label-acres',
      'selected-highlight-line',
      'reposition-fill',
      'reposition-outline',
      'annotations-line',
      'annotations-text',
      // in-progress draw vertex dots — must survive the crop-map layer hider
      'draw-progress-dots',
      'line-edit-line',
      'me-accuracy-fill',
      'me-accuracy-line',
      'freehand-preview-line',
    ])
    const style = map.getStyle()
    for (const layer of style?.layers ?? []) {
      // Ours + mapbox-gl-draw's own feedback layers (vertex dots + the
      // in-progress line/polygon) — hiding those made drawing on the crop
      // map invisible.
      if (ours.has(layer.id) || layer.id.startsWith('gl-draw')) continue
      try {
        if (layer.type === 'background') {
          map.setPaintProperty(layer.id, 'background-color', onWhiteSheet ? '#FFFFFF' : '#0B0B0B')
        } else {
          map.setLayoutProperty(layer.id, 'visibility', onWhiteSheet ? 'none' : 'visible')
        }
      } catch {
        /* layer may not support the property — ignore */
      }
    }
  }, [selectedFieldId, ready, viewMode, whiteMap, highlightColor, blockColors, colorBy, stageColors, varietyColors])

  // Per-field label visibility (user toggle). The 4 label layers are in the
  // white-sheet `ours` set (they aren't hidden by the crop-sheet loop), so this
  // effect owns their base visibility. cut=fields-label (center), name/variety/
  // acres = the three corner layers.
  useEffect(() => {
    const set = labelFields ?? new Set<LabelField>(ALL_LABEL_FIELDS)
    labelFieldsRef.current = set
    const map = mapRef.current
    if (!map || !ready) return
    const pairs: [LabelField, string][] = [
      ['cut', 'fields-label'],
      ['name', 'field-label-id'],
      ['variety', 'field-label-variety'],
      ['acres', 'field-label-acres'],
    ]
    for (const [field, layerId] of pairs) {
      try {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, 'visibility', set.has(field) ? 'visible' : 'none')
        }
      } catch {
        /* layer not ready — ignore */
      }
    }
  }, [labelFields, ready])

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

    // Frame the group ONLY if it isn't already comfortably on screen — a
    // grower who selected blocks they're already looking at shouldn't have the
    // camera yanked in. Recenter just when part of the group sits off-view.
    const groupBounds = new mapboxgl.LngLatBounds()
    for (const g of workingMap.values()) {
      for (const ring of g.coordinates) for (const [lng, lat] of ring) groupBounds.extend([lng, lat])
    }
    if (!groupBounds.isEmpty()) {
      const view = map.getBounds()
      const onScreen =
        view &&
        view.contains(groupBounds.getNorthEast()) &&
        view.contains(groupBounds.getSouthWest())
      if (!onScreen) {
        map.fitBounds(groupBounds, { padding: 110, animate: true, maxZoom: 16, duration: 500 })
      }
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
        map.setLayoutProperty(
          'fields-label',
          'visibility',
          labelFieldsRef.current.has('cut') ? 'visible' : 'none',
        )
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
    // Deep-link focus provides its own padded context framing — don't clobber
    // it with the tighter fly-to.
    if (selectedFieldId === focusFieldId) return
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

  function cancelDraw() {
    const draw = drawRef.current
    cancelingDrawRef.current = true
    try {
      // draw.create fires synchronously in here when a shape is in progress —
      // the flagged handler discards it instead of saving.
      draw?.changeMode('simple_select')
      draw?.deleteAll()
    } finally {
      cancelingDrawRef.current = false
    }
    setDrawing(false)
    setDrawKind(null)
    setTextDraft(null)
    setLineChooser(false)
  }

  function toggleDraw() {
    if (!drawRef.current) return
    if (drawKind === 'block') {
      cancelDraw()
    } else {
      // Discard any in-progress line/text first (flagged, so nothing commits).
      cancelDraw()
      drawRef.current.changeMode('draw_polygon')
      setDrawing(true)
      setDrawKind('block')
    }
  }

  function toggleLine() {
    if (!drawRef.current) return
    if (drawKind === 'line' || drawKind === 'freehand') {
      cancelDraw()
    } else if (lineChooser) {
      setLineChooser(false)
    } else {
      cancelDraw()
      setLineChooser(true)
    }
  }

  function startLine(mode: 'freehand' | 'points') {
    if (!drawRef.current) return
    cancelDraw()
    if (mode === 'points') drawRef.current.changeMode('draw_line_string')
    setDrawing(true)
    setDrawKind(mode === 'points' ? 'line' : 'freehand')
  }

  function toggleText() {
    if (drawKind === 'text') {
      cancelDraw()
    } else {
      // Discard any in-progress shape, then arm the one-shot placement click.
      cancelDraw()
      setDrawing(true)
      setDrawKind('text')
      setTextDraft(null)
    }
  }

  if (liteMode) {
    return (
      <LiteMap
        fields={fields}
        selectedFieldId={selectedFieldId}
        onSelectField={onSelectField}
        stageColorMap={Object.fromEntries(stageColors.map((r) => [r.key, r.color]))}
        stageColors={stageColors}
        colorBy={colorBy}
        labelFields={labelFields}
        varietyColors={varietyColors}
        highlightColor={highlightColor}
        blockColors={blockColors}
        filterIds={filterIds}
        visibleIds={visibleIds}
        whiteMap={whiteMap}
        readOnly={readOnly}
        onShowFields={onShowFields}
        selectMode={selectMode}
        selectedIds={selectedIds}
        onToggleFieldSelected={onToggleFieldSelected}
        selectionKey={selectionKey}
        focusFieldId={focusFieldId}
        repositionIds={repositionIds}
        onSaveReposition={onSaveReposition}
        onCancelReposition={onCancelReposition}
        onCreateField={readOnly ? undefined : onCreateField}
        onUpdateField={readOnly ? undefined : onUpdateField}
        annotations={annotations}
        onCreateAnnotation={readOnly ? undefined : onCreateAnnotation}
        onUpdateAnnotation={readOnly ? undefined : onUpdateAnnotation}
        onDeleteAnnotation={readOnly ? undefined : onDeleteAnnotation}
      />
    )
  }

  if (error) {
    // Friendly, farmer-facing message only. The technical detail (Mapbox URL,
    // status, etc.) is logged to the console at the 'error' handler above for
    // debugging — never shown in the UI.
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-100 p-8">
        <div className="max-w-sm text-center">
          <p className="text-primary font-semibold text-lg mb-2">Map couldn&apos;t load</p>
          <p className="text-sm text-gray-600 mb-5">
            Check your internet connection and refresh the page. If it keeps happening,
            give it a minute and try again.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn-primary text-sm"
          >
            Refresh
          </button>
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
        // White backdrop behind the canvas so crop-map mode reads as a blank
        // white plat sheet wherever the basemap is hidden.
        style={{ width: '100%', height: '100%', backgroundColor: '#FFFFFF' }}
      />

      {/* View-mode toggle — top-center. Satellite (for drawing / ground-truth)
          and the crop map (the plat sheet; deselect-all in Layers turns it
          into the white pilot map). */}
      <div className="absolute left-1/2 -translate-x-1/2 z-10 bottom-8 lg:bottom-auto lg:top-3">
        <div className="inline-flex rounded-md bg-white shadow-md border border-gray-200 overflow-hidden text-sm font-semibold">
          <button
            type="button"
            onClick={() => onViewModeChange('crop')}
            className={`px-3 py-2 transition ${
              viewMode === 'crop' ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Crop map
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('satellite')}
            className={`px-3 py-2 transition border-l border-gray-200 ${
              viewMode === 'satellite' ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Satellite
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
        <div className="flex flex-wrap gap-2 pointer-events-none max-w-[21rem] lg:max-w-[27rem]">
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
          {!readOnly && (<>
          <button
            type="button"
            onClick={toggleDraw}
            disabled={!ready}
            className={`pointer-events-auto inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed ${
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

          {/* Annotation tools: reference lines (roads/ditches) + text labels. */}
          <button
            type="button"
            onClick={toggleLine}
            disabled={!ready}
            title="Draw a reference line (road, ditch)"
            className={`pointer-events-auto inline-flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed border-2 ${
              drawKind === 'line' || drawKind === 'freehand' || lineChooser
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-primary border-primary hover:bg-primary/5'
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M3.5 14.5a2 2 0 102.83 2.83l9.5-9.5A2 2 0 1013 5l-9.5 9.5z" />
              <circle cx="4.75" cy="15.75" r="1.75" />
              <circle cx="15.25" cy="4.75" r="1.75" />
            </svg>
            {drawKind === 'line' || drawKind === 'freehand' ? 'Cancel line' : 'Line'}
          </button>
          <button
            type="button"
            onClick={toggleText}
            disabled={!ready}
            title="Add a text label (Hwy 308, Shop, N)"
            className={`pointer-events-auto inline-flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed border-2 ${
              drawKind === 'text'
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-primary border-primary hover:bg-primary/5'
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M4 4a1 1 0 011-1h10a1 1 0 011 1v2a1 1 0 11-2 0V5h-3v10h1a1 1 0 110 2H8a1 1 0 110-2h1V5H6v1a1 1 0 01-2 0V4z" />
            </svg>
            {drawKind === 'text' ? 'Cancel text' : 'Text'}
          </button>
          </>)}

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
            {drawKind === 'line'
              ? 'Click points along the road or ditch. Double-click the last point to finish. Press Esc to cancel.'
              : drawKind === 'freehand'
                ? 'Press and drag to draw. Let go to save the line.'
                : drawKind === 'text'
                  ? 'Click the map where the label should go.'
                  : 'Click each corner of the block. Double-click the last corner to finish. Press Esc to cancel.'}
          </div>
        )}

        {lineChooser && !drawKind && (
          <div className="pointer-events-auto rounded-md bg-white shadow-md border border-gray-100 px-3 py-2 flex items-center gap-2 flex-wrap max-w-xs">
            {(
              [
                ['freehand', 'Freehand'],
                ['points', 'Point to point'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => startLine(mode)}
                className="text-xs font-semibold rounded-md border-2 border-primary text-primary px-2.5 py-1.5 hover:bg-primary hover:text-white transition"
              >
                {label}
              </button>
            ))}
            <div className="basis-full flex items-center gap-2 pt-1">
              <span className="text-[11px] font-semibold text-gray-500 shrink-0">Thickness</span>
              <input
                type="range"
                min={0.5}
                max={8}
                step={0.5}
                value={lineWidth}
                onChange={(e) => setLineWidth(Number(e.target.value))}
                className="flex-1"
                aria-label="Line thickness"
              />
              <span className="text-xs text-gray-500 w-7 text-right">{lineWidth}</span>
            </div>
            <div
              className="basis-full rounded-full"
              style={{ height: Math.max(2, lineWidth), backgroundColor: lineColor }}
            />
            <div className="basis-full flex items-center gap-1.5 pt-1">
              <span className="text-[11px] font-semibold text-gray-500 shrink-0">Color</span>
              {ANNO_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setLineColor(c)}
                  aria-label={`Line color ${c}`}
                  className={`w-5 h-5 rounded-full border-2 ${lineColor === c ? 'border-primary scale-110' : 'border-white shadow'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
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

      {/* Edit an existing TEXT label — same panel as creation, prefilled;
          drag the live label on the map to move it. */}
      {textEdit && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
          <form
            className="rounded-md bg-white shadow-lg border border-gray-200 p-3 space-y-2 w-72"
            onSubmit={async (e) => {
              e.preventDefault()
              const value = textEdit.value.trim()
              if (!value || !onUpdateAnnotation) return
              await onUpdateAnnotation(textEdit.id, {
                geometry: { type: 'Point', coordinates: [textEdit.lng, textEdit.lat] },
                text: value,
                size: textEdit.size,
                rotation: textEdit.rotation,
                color: textEdit.color,
              })
              setTextEdit(null)
            }}
          >
            <p className="text-xs text-gray-500 leading-snug">
              Drag the label on the map to move it. Adjust below, then save.
            </p>
            <input
              type="text"
              value={textEdit.value}
              maxLength={120}
              onChange={(e) => setTextEdit({ ...textEdit, value: e.target.value })}
              className="input text-sm w-full"
            />
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500 w-10">Size</span>
              <input
                type="range"
                min={8}
                max={48}
                step={1}
                value={textEdit.size}
                onChange={(e) => setTextEdit({ ...textEdit, size: Number(e.target.value) })}
                className="flex-1"
                aria-label="Label size"
              />
              <span className="text-xs text-gray-500 w-9 text-right">{textEdit.size}px</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500 w-10">Color</span>
              {ANNO_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setTextEdit({ ...textEdit, color: c })}
                  aria-label={`Label color ${c}`}
                  className={`w-5 h-5 rounded-full border-2 ${textEdit.color === c ? 'border-primary scale-110' : 'border-white shadow'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500 w-10">Turn</span>
              <input
                type="range"
                min={-90}
                max={90}
                step={5}
                value={textEdit.rotation}
                onChange={(e) => setTextEdit({ ...textEdit, rotation: Number(e.target.value) })}
                className="flex-1"
                aria-label="Rotate label"
              />
              <span className="text-xs text-gray-500 w-9 text-right">{textEdit.rotation}°</span>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={!textEdit.value.trim()} className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50">
                Save
              </button>
              <button type="button" className="text-xs text-gray-500" onClick={() => setTextEdit(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit an existing LINE — drag to move it whole; click it, then drag
          corners to reshape. Thickness adjustable. */}
      {lineEdit && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
          <div className="rounded-md bg-white shadow-lg border border-gray-200 p-3 space-y-2 w-72">
            <p className="text-xs text-gray-500 leading-snug">
              Drag the gold corner dots to reshape. Drag the line itself to move the whole thing.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-gray-500 shrink-0">Thickness</span>
              <input
                type="range"
                min={0.5}
                max={8}
                step={0.5}
                value={lineEdit.width}
                onChange={(e) => setLineEdit({ ...lineEdit, width: Number(e.target.value) })}
                className="flex-1"
                aria-label="Line thickness"
              />
              <span className="text-xs text-gray-500 w-7 text-right">{lineEdit.width}</span>
            </div>
            <div className="rounded-full" style={{ height: Math.max(2, lineEdit.width), backgroundColor: lineEdit.color }} />
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-gray-500 shrink-0">Color</span>
              {ANNO_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setLineEdit({ ...lineEdit, color: c })}
                  aria-label={`Line color ${c}`}
                  className={`w-5 h-5 rounded-full border-2 ${lineEdit.color === c ? 'border-primary scale-110' : 'border-white shadow'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-primary text-xs px-3 py-1.5"
                onClick={async () => {
                  if (!onUpdateAnnotation) return
                  const coords = lineEditCoordsRef.current
                  await onUpdateAnnotation(lineEdit.id, {
                    ...(coords.length >= 2
                      ? { geometry: { type: 'LineString', coordinates: coords } as GeoJSON.LineString }
                      : {}),
                    width: lineEdit.width,
                    color: lineEdit.color,
                  })
                  setLineEdit(null)
                }}
              >
                Save
              </button>
              <button type="button" className="text-xs text-gray-500" onClick={() => setLineEdit(null)}>
                Cancel
              </button>
            </div>
          </div>
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

      {/* Text-label input — appears after the grower clicks a spot. Size and
          rotation are set here; the live preview shows both. */}
      {textDraft && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
          <form
            className="rounded-md bg-white shadow-lg border border-gray-200 p-3 space-y-2 w-72"
            onSubmit={async (e) => {
              e.preventDefault()
              const value = textDraft.value.trim()
              if (!value) return
              await onCreateAnnotation(
                'text',
                { type: 'Point', coordinates: [textDraft.lng, textDraft.lat] },
                value,
                { size: textDraft.size, rotation: textDraft.rotation, color: textDraft.color },
              )
              setTextDraft(null)
            }}
          >
            <input
              autoFocus
              type="text"
              value={textDraft.value}
              maxLength={120}
              onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
              placeholder="Hwy 308, Shop house, N…"
              className="input text-sm w-full"
            />
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500 w-10">
                Size
              </span>
              <input
                type="range"
                min={8}
                max={48}
                step={1}
                value={textDraft.size}
                onChange={(e) => setTextDraft({ ...textDraft, size: Number(e.target.value) })}
                className="flex-1"
                aria-label="Label size"
              />
              <span className="text-xs text-gray-500 w-9 text-right">{textDraft.size}px</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500 w-10">Color</span>
              {ANNO_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setTextDraft({ ...textDraft, color: c })}
                  aria-label={`Label color ${c}`}
                  className={`w-5 h-5 rounded-full border-2 ${textDraft.color === c ? 'border-primary scale-110' : 'border-white shadow'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500 w-10">
                Turn
              </span>
              <input
                type="range"
                min={-90}
                max={90}
                step={5}
                value={textDraft.rotation}
                onChange={(e) => setTextDraft({ ...textDraft, rotation: Number(e.target.value) })}
                className="flex-1"
                aria-label="Rotate label"
              />
              <span className="text-xs text-gray-500 w-9 text-right">{textDraft.rotation}°</span>
            </div>
            {/* Live preview at chosen size + angle */}
            {textDraft.value.trim() && (
              <div className="h-16 flex items-center justify-center overflow-hidden">
                <span
                  className="font-bold"
                  style={{
                    fontSize: Math.min(textDraft.size, 28),
                    transform: `rotate(${textDraft.rotation}deg)`,
                    color: textDraft.color,
                  }}
                >
                  {textDraft.value}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button type="submit" className="btn-primary text-sm px-3 py-2" disabled={!textDraft.value.trim()}>
                Add
              </button>
              <button
                type="button"
                onClick={() => setTextDraft(null)}
                className="text-sm text-gray-500 hover:text-primary px-1"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Legend — bottom-right, shared with the lite map (MapLegend). Hidden
          while per-block plan colors paint (the plan legend takes over). */}
      {!blockColors && (anyRatoonSet || viewMode === 'crop' || colorBy === 'variety') && (
        <MapLegend colorBy={colorBy} stageColors={stageColors} varietyColors={varietyColors} />
      )}
    </div>
  )
}
