'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import * as turf from '@turf/turf'
import { UNSET_RATOON_COLOR } from '@/lib/ratoon-colors'
import type { StageColor } from '@/lib/resolve-colors'
import MapLegend from './MapLegend'
import type { FieldRow } from '@/lib/fields'
import type { AnnotationRow } from '@/lib/annotations'
import { ALL_LABEL_FIELDS, type LabelField } from '@/lib/label-fields'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''
const SAT_TILES = `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${MAPBOX_TOKEN}`
const SELECTED_COLOR = '#E8A33D'
const ANNO_COLORS = ['#111827', '#DC2626', '#2563EB', '#16A34A', '#EA580C', '#7C3AED']

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
  onShowFields,
  selectMode = false,
  selectedIds,
  onToggleFieldSelected,
  selectionKey = '',
  focusFieldId = null,
  repositionIds = null,
  onSaveReposition,
  onCancelReposition,
  onCreateField,
  onUpdateField,
  annotations = [],
  onCreateAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  colorBy = 'stage',
  varietyColors = {},
  stageColors = [],
  highlightColor = null,
  blockColors = null,
  filterIds = null,
  visibleIds = null,
  whiteMap = false,
  readOnly = false,
  labelFields,
}: {
  fields: FieldRow[]
  selectedFieldId: string | null
  onSelectField: (id: string | null) => void
  stageColorMap: Record<string, string>
  onShowFields?: () => void
  selectMode?: boolean
  selectedIds?: Set<string>
  onToggleFieldSelected?: (id: string) => void
  selectionKey?: string
  focusFieldId?: string | null
  repositionIds?: Set<string> | null
  onSaveReposition?: (features: { id: string; geometry: GeoJSON.Polygon }[]) => Promise<void>
  onCancelReposition?: () => void
  onCreateField?: (geometry: GeoJSON.Polygon) => Promise<void>
  onUpdateField?: (id: string, geometry: GeoJSON.Polygon) => Promise<void>
  annotations?: AnnotationRow[]
  onCreateAnnotation?: (
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
  onDeleteAnnotation?: (id: string) => Promise<void>
  colorBy?: 'stage' | 'variety'
  varietyColors?: Record<string, string>
  labelFields?: ReadonlySet<LabelField>
  // Ordered stage palette with labels — feeds the shared MapLegend.
  stageColors?: StageColor[]
  highlightColor?: string | null
  // Per-block colors for plan-set viewing/drafting — wins over highlightColor.
  blockColors?: Record<string, string> | null
  filterIds?: Set<string> | null
  visibleIds?: Set<string> | null
  whiteMap?: boolean
  readOnly?: boolean
}) {
  const holderRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const blocksRef = useRef<L.LayerGroup | null>(null)
  // Persistent per-block polygons — the Mapbox model: build once, restyle in
  // place. Zoom/pan/selection NEVER tear these down.
  const polysRef = useRef<Map<string, L.Polygon>>(new Map())
  const annosRef = useRef<L.LayerGroup | null>(null)
  const satLayerRef = useRef<L.TileLayer | null>(null)
  const gpsRef = useRef<{ marker: L.CircleMarker; ring: L.Circle } | null>(null)
  const editTargetRef = useRef<L.Polygon | null>(null)
  const repoGroupRef = useRef<L.LayerGroup | null>(null)
  const repoWorkingRef = useRef<Map<string, GeoJSON.Polygon>>(new Map())
  const [savingReposition, setSavingReposition] = useState(false)
  const [mode, setMode] = useState<'crop' | 'satellite'>('crop')
  const [tool, setTool] = useState<'none' | 'block' | 'line' | 'freehand' | 'text'>('none')
  const [editingShape, setEditingShape] = useState(false)
  const [lineChooser, setLineChooser] = useState(false)
  const [lineWidth, setLineWidth] = useState(3)
  const lineWidthRef = useRef(3)
  lineWidthRef.current = lineWidth
  const [lineColor, setLineColor] = useState('#111827')
  const lineColorRef = useRef('#111827')
  lineColorRef.current = lineColor
  const [textDraft, setTextDraft] = useState<{
    lng: number
    lat: number
    value: string
    size: number
    rotation: number
    color: string
    /** set when editing an existing label instead of creating one */
    editingId?: string
  } | null>(null)
  const [lineEdit, setLineEdit] = useState<{ id: string; width: number; color: string } | null>(null)
  const lineEditLayerRef = useRef<L.Polyline | null>(null)
  const [locating, setLocating] = useState(false)
  const [locateAccuracy, setLocateAccuracy] = useState<number | null>(null)
  const [locateError, setLocateError] = useState<string | null>(null)
  const [gpsOn, setGpsOn] = useState(false)
  const [zoomTick, setZoomTick] = useState(0)
  const [viewTick, setViewTick] = useState(0)

  // Refs mirror the props/state the imperative Leaflet handlers need — the
  // map is created once; handlers must read current values.
  const fieldById = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields])
  const live = useRef({
    tool,
    onSelectField,
    onCreateField,
    onCreateAnnotation,
    selectMode,
    onToggleFieldSelected,
    repositioning: false,
    fieldById,
    readOnly,
  })
  live.current = {
    tool,
    onSelectField,
    onCreateField,
    onCreateAnnotation,
    selectMode,
    onToggleFieldSelected,
    repositioning: !!repositionIds && repositionIds.size > 0,
    fieldById,
    readOnly,
  }

  // ── map lifecycle ──────────────────────────────────────────────────
  useEffect(() => {
    if (!holderRef.current || mapRef.current) return
    const map = L.map(holderRef.current, {
      zoomControl: false,
      attributionControl: false,
      // canvas renderer: fastest non-GPU path for hundreds of polygons
      preferCanvas: true,
      // The crop view has no tile layer, so nothing constrains zoom without
      // this — users could zoom to a microscopic empty viewport (z25+).
      maxZoom: 19,
      minZoom: 3,
    })
    L.control.scale({ imperial: true, metric: false }).addTo(map)
    // Zoom top-right, same corner as the full map's navigation control —
    // and clear of the draw-tools column top-left.
    L.control.zoom({ position: 'topright' }).addTo(map)
    mapRef.current = map
    // debug handle (read-only introspection; used by tests/diagnostics)
    ;(window as unknown as { __liteMap?: L.Map }).__liteMap = map
    blocksRef.current = L.layerGroup().addTo(map)
    annosRef.current = L.layerGroup().addTo(map)

    // Where-you-were memory (parity with the full map): restore the saved
    // camera if one exists; otherwise fit the farm (or south Louisiana).
    const camKey = 'hl-cam:' + (fields[0]?.org_id || 'org')
    let restored = false
    if (!readOnly) {
      try {
        const raw = localStorage.getItem(camKey)
        if (raw) {
          const c = JSON.parse(raw) as { lng: number; lat: number; zoom: number }
          if (Number.isFinite(c.lng) && Number.isFinite(c.lat) && Number.isFinite(c.zoom)) {
            map.setView([c.lat, c.lng], Math.round(c.zoom) + 1)
            restored = true
          }
        }
      } catch {
        /* best-effort */
      }
    }
    if (!restored) {
      const pts: [number, number][] = []
      for (const f of fields)
        for (const ring of f.geometry?.coordinates ?? [])
          for (const [lng, lat] of ring) pts.push([lat, lng])
      if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.06))
      else map.setView([29.9, -90.8], 12)
    }
    if (!readOnly) {
      map.on('moveend', () => {
        try {
          const c = map.getCenter()
          localStorage.setItem(
            camKey,
            JSON.stringify({ lng: c.lng, lat: c.lat, zoom: map.getZoom() - 1, bearing: 0, pitch: 0 }),
          )
        } catch {
          /* best-effort */
        }
      })
    }

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
        void live.current.onCreateAnnotation('line', gj.geometry as GeoJSON.LineString, undefined, {
          width: lineWidthRef.current,
          color: lineColorRef.current,
        })
      }
      setTool('none')
    })

    const onZoomEnd = () => {
      setZoomTick((n) => n + 1) // annotations ground-scale (zoom only)
      setViewTick((n) => n + 1)
    }
    const onMoveEnd = () => setViewTick((n) => n + 1) // label culling only
    map.on('zoomend', onZoomEnd)
    map.on('moveend', onMoveEnd)

    return () => {
      map.off('zoomend', onZoomEnd)
      map.off('moveend', onMoveEnd)
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

  // ── blocks: STRUCTURE (create/remove polygons only when the data set
  // changes — never on zoom/pan/selection). The Mapbox model in Leaflet terms.
  useEffect(() => {
    const map = mapRef.current
    const group = blocksRef.current
    if (!map || !group) return
    const polys = polysRef.current
    const shownIds = new Set(
      (visibleIds ? fields.filter((f) => visibleIds.has(f.id)) : fields).map((f) => f.id),
    )
    // remove stale
    for (const [id, poly] of polys) {
      if (!shownIds.has(id)) {
        group.removeLayer(poly)
        polys.delete(id)
      }
    }
    // add/update
    for (const f of fields) {
      if (!shownIds.has(f.id)) continue
      const latlngs = (f.geometry?.coordinates ?? []).map((ring) =>
        ring.map(([lng, lat]) => [lat, lng] as [number, number]),
      )
      const existing = polys.get(f.id)
      if (existing) {
        existing.setLatLngs(latlngs)
        continue
      }
      const poly = L.polygon(latlngs, { color: '#374151', weight: 1, fillColor: '#e5e7eb', fillOpacity: 0.9 })
      poly.on('click', (ev) => {
        if (live.current.tool !== 'none' || live.current.repositioning) return
        L.DomEvent.stopPropagation(ev)
        if (live.current.selectMode) {
          live.current.onToggleFieldSelected?.(f.id)
          return
        }
        live.current.onSelectField(f.id)
        // Same info card the full map pops on click — selection alone gives
        // no feedback when the sidebar is closed. Read CURRENT field data
        // from the live lookup (the closure's `f` goes stale after edits).
        const cur = live.current.fieldById.get(f.id)
        if (!cur) return
        const esc = (t: string) =>
          t.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] as string)
        const cutLabels: Record<string, string> = {
          plant_cane: 'Plant cane', first_stubble: '1st stubble', second_stubble: '2nd stubble',
          third_stubble: '3rd stubble', fourth_stubble: '4th stubble', fifth_stubble_plus: '5th stubble',
          sixth_stubble_plus: '6th+ stubble', fallow: 'Fallow',
        }
        const meta = [
          `${Number(cur.acreage_cached || 0).toFixed(2)} ac`,
          cutLabels[String(cur.current_ratoon ?? '')] ?? '',
          cur.variety ? esc(cur.variety) : '',
        ].filter(Boolean).join(' · ')
        L.popup({ closeButton: true, offset: [0, -4], maxWidth: 260 })
          .setLatLng(ev.latlng)
          .setContent(
            `<div style="font-family:system-ui,sans-serif;min-width:150px">` +
              `<div style="font-weight:700;color:#1A3D2E;font-size:15px">${esc(cur.name ?? 'Block')}</div>` +
              `<div style="color:#4b5563;font-size:12px;margin-top:2px">${meta}</div>` +
              (live.current.readOnly
                ? ''
                : `<a href="/app/fields/${f.id}" style="display:inline-block;margin-top:10px;font-weight:600;font-size:14px;color:#1A3D2E">Open block &rarr;</a>`) +
              `</div>`,
          )
          .openOn(map)
      })
      poly.addTo(group)
      polys.set(f.id, poly)
    }
  }, [fields, visibleIds])

  // ONE fill resolver for both the polygon styles AND the label text rule —
  // mirrors FieldMap's fill expression exactly (selected → highlight, plan
  // step colors, single highlight, palette, cyan unset). Any divergence here
  // is a lite-parity bug (Lance caught the grey-vs-cyan unset mismatch).
  const fillFor = (f: FieldRow): string => {
    if (f.id === selectedFieldId) return SELECTED_COLOR
    const member = filterIds ? filterIds.has(f.id) : !whiteMap
    if (!member) return '#FFFFFF'
    return (
      blockColors?.[f.id] ??
      (highlightColor ??
        (colorBy === 'variety'
          ? (varietyColors[f.variety ?? ''] ?? UNSET_RATOON_COLOR)
          : (f.current_ratoon && stageColorMap[f.current_ratoon]) || UNSET_RATOON_COLOR))
    )
  }

  // ── blocks: STYLE (setStyle in place — cheap even at thousands of blocks;
  // zoom is deliberately NOT a dependency).
  useEffect(() => {
    const polys = polysRef.current
    if (polys.size === 0) return
    const sat = mode === 'satellite'
    const repositioning = !!repositionIds && repositionIds.size > 0
    const byId = new Map(fields.map((f) => [f.id, f]))
    for (const [id, poly] of polys) {
      const f = byId.get(id)
      if (!f) continue
      if (repositioning && repositionIds!.has(id)) {
        // the working copy renders separately — hide the original in place
        poly.setStyle({ opacity: 0, fillOpacity: 0 })
        continue
      }
      const sel = id === selectedFieldId
      const bulkSel = selectMode && !!selectedIds?.has(id)
      const fill = fillFor(f)
      poly.setStyle({
        color: bulkSel ? SELECTED_COLOR : sel ? '#111827' : sat ? '#facc15' : '#374151',
        weight: bulkSel ? 4 : sel ? 3 : sat ? 1.5 : 1,
        fillColor: fill,
        fillOpacity: repositioning ? 0.25 : sat ? (sel ? 0.35 : 0.08) : 0.9,
      })
    }
  }, [fields, selectedFieldId, mode, colorBy, varietyColors, highlightColor, blockColors, filterIds, visibleIds, whiteMap, stageColorMap, repositionIds, selectMode, selectedIds])

  // ── blocks: LABELS (viewport-culled — only on-screen blocks carry tooltip
  // DOM, typically 20–80 instead of the whole farm; re-culled after each
  // zoom/pan settle via zoomTick).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const polys = polysRef.current
    const sat = mode === 'satellite'
    const showLabels = map.getZoom() >= 14
    const bounds = map.getBounds().pad(0.15)
    const repositioning = !!repositionIds && repositionIds.size > 0
    const byId = new Map(fields.map((f) => [f.id, f]))
    const cutShort: Record<string, string> = {
      plant_cane: 'PC', first_stubble: '1st', second_stubble: '2nd', third_stubble: '3rd',
      fourth_stubble: '4th', fifth_stubble_plus: '5th', sixth_stubble_plus: '6th+', fallow: 'F',
    }
    const className = sat ? 'lite-label lite-label-sat' : 'lite-label'
    const lf = labelFields ?? new Set<LabelField>(ALL_LABEL_FIELDS)
    const factsFor = (f: FieldRow) =>
      [
        lf.has('acres') && Number(f.acreage_cached || 0)
          ? `${Number(f.acreage_cached).toFixed(2)} ac`
          : '',
        lf.has('variety') ? (f.variety ?? '') : '',
        lf.has('cut') && f.current_ratoon ? (cutShort[f.current_ratoon] ?? '') : '',
      ]
        .filter(Boolean)
        .join(' · ')
    const contentFor = (f: FieldRow) => {
      const facts = factsFor(f)
      const nameShown = lf.has('name')
      if (!nameShown && !facts) return ''
      // Same label rule as the full map: white text with a dark halo on
      // colored blocks, black with a white halo on white/plain blocks.
      const colored = fillFor(f) !== '#FFFFFF'
      const textStyle = colored
        ? 'color:#FFFFFF;text-shadow:0 0 3px #0F2A1F,0 0 3px #0F2A1F'
        : 'color:#111827;text-shadow:0 0 2px #FFFFFF,0 0 2px #FFFFFF'
      const head = nameShown ? `<strong>${escapeHtml(f.name)}</strong>` : ''
      const sub = facts
        ? `${nameShown ? '<br/>' : ''}<span style="font-weight:500;font-size:10px">${escapeHtml(facts)}</span>`
        : ''
      return `<div style="text-align:center;${textStyle}">${head}${sub}</div>`
    }
    // Rank in-view candidates by distance to center and cap the count — a
    // dense viewport otherwise mounts hundreds of label nodes in one burst.
    const MAX_LABELS = 120
    const center = map.getCenter()
    const candidates: { id: string; d: number }[] = []
    if (showLabels && lf.size > 0) {
      for (const [id] of polys) {
        const f = byId.get(id)
        if (!f) continue
        if (repositioning && repositionIds!.has(id)) continue
        const ll = L.latLng(f.centroid_lat, f.centroid_lng)
        if (!bounds.contains(ll)) continue
        candidates.push({ id, d: center.distanceTo(ll) })
      }
      candidates.sort((a, b) => a.d - b.d)
    }
    // Collision culling — the exact behavior that makes the full map read
    // clean: constant-size labels, show the ones that fit, HIDE the rest
    // (they appear as you zoom in and space opens up). Boxes sized to the
    // MEASURED tooltip: ~6px Leaflet padding per side, name ~8px/char at
    // 11px bold, facts ~5.5px/char at 10px, plus a small breathing gap.
    const labeled = new Set<string>()
    const placedBoxes: { x1: number; y1: number; x2: number; y2: number }[] = []
    for (const c of candidates) {
      if (labeled.size >= MAX_LABELS) break
      const f = byId.get(c.id)!
      const pt = map.latLngToContainerPoint(L.latLng(f.centroid_lat, f.centroid_lng))
      const facts = factsFor(f)
      const nameShown = lf.has('name')
      const nameW = nameShown ? (f.name ?? '').length * 8 : 0
      const w = Math.max(nameW, facts.length * 5.5) + 20
      const h = (nameShown && facts ? 44 : nameShown || facts ? 30 : 0) + 4
      const box = { x1: pt.x - w / 2, y1: pt.y - h / 2, x2: pt.x + w / 2, y2: pt.y + h / 2 }
      if (
        placedBoxes.some(
          (b) => !(box.x2 < b.x1 || box.x1 > b.x2 || box.y2 < b.y1 || box.y1 > b.y2),
        )
      )
        continue
      placedBoxes.push(box)
      labeled.add(c.id)
    }
    for (const [id, poly] of polys) {
      const f = byId.get(id)
      const wants = !!f && labeled.has(id)
      const existing = poly.getTooltip()
      if (wants && existing && existing.options.className !== className) {
        poly.unbindTooltip() // crop<->satellite flip restyles the label
      }
      if (wants && !poly.getTooltip()) {
        poly.bindTooltip(contentFor(f!), { permanent: true, direction: 'center', className })
      } else if (wants && poly.getTooltip()) {
        // keep visible labels' facts fresh (bulk edits change variety/cut)
        poly.setTooltipContent(contentFor(f!))
      } else if (!wants && poly.getTooltip()) {
        poly.unbindTooltip()
      }
    }
  }, [fields, mode, viewTick, repositionIds, colorBy, varietyColors, stageColorMap, filterIds, whiteMap, highlightColor, blockColors, selectedFieldId, labelFields])

  // ── blocks: RESHAPE (geoman on the persistent polygon — survives zooms).
  useEffect(() => {
    editTargetRef.current = null
    if (!editingShape || !selectedFieldId || !onUpdateField || readOnly) return
    const poly = polysRef.current.get(selectedFieldId)
    if (!poly) return
    poly.pm.enable({ allowSelfIntersection: false })
    editTargetRef.current = poly
    return () => {
      try {
        poly.pm.disable()
      } catch {
        /* map tearing down */
      }
      editTargetRef.current = null
    }
  }, [editingShape, selectedFieldId, onUpdateField, readOnly])

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
        if (!readOnly && (onDeleteAnnotation || onUpdateAnnotation)) {
          line.on('click', (ev) => {
            if (live.current.tool !== 'none' || lineEdit) return
            L.DomEvent.stopPropagation(ev)
            const p = L.popup()
              .setLatLng(ev.latlng)
              .setContent(
                annotationMenu({
                  onEdit: onUpdateAnnotation
                    ? () => {
                        map.closePopup(p)
                        setLineEdit({ id: a.id, width: a.width ?? 3, color: a.color ?? '#111827' })
                      }
                    : undefined,
                  editLabel: 'Move / reshape',
                  onDelete: onDeleteAnnotation
                    ? () => {
                        void onDeleteAnnotation(a.id)
                        map.closePopup(p)
                      }
                    : undefined,
                }),
              )
              .openOn(map)
          })
        }
        if (lineEdit?.id === a.id) {
          // hidden while its editable clone is on the map
        } else {
          line.addTo(group)
        }
      } else if (a.kind === 'text' && a.geometry.type === 'Point') {
        const [lng, lat] = a.geometry.coordinates
        const marker = L.marker([lat, lng], {
          icon: L.divIcon({
            className: 'lite-text-anno',
            html: `<span style="color:${a.color};font-size:${Math.max(2, a.size * groundScale)}px;font-weight:700;transform:rotate(${a.rotation}deg);display:inline-block;white-space:nowrap;text-shadow:0 0 3px #fff,0 0 3px #fff">${escapeHtml(a.text ?? '')}</span>`,
          }),
          interactive: !readOnly && (!!onDeleteAnnotation || !!onUpdateAnnotation),
          draggable: !readOnly && !!onUpdateAnnotation,
        })
        if (!readOnly && onUpdateAnnotation) {
          // drag the label to a new spot — saves on release
          marker.on('dragend', () => {
            const ll = marker.getLatLng()
            void onUpdateAnnotation(a.id, {
              geometry: { type: 'Point', coordinates: [ll.lng, ll.lat] },
            })
          })
        }
        if (!readOnly && (onDeleteAnnotation || onUpdateAnnotation)) {
          marker.on('click', () => {
            const p = L.popup()
              .setLatLng([lat, lng])
              .setContent(
                annotationMenu({
                  onEdit: onUpdateAnnotation
                    ? () => {
                        map.closePopup(p)
                        setTextDraft({
                          lng,
                          lat,
                          value: a.text ?? '',
                          size: a.size ?? 16,
                          rotation: a.rotation ?? 0,
                          color: a.color ?? '#111827',
                          editingId: a.id,
                        })
                      }
                    : undefined,
                  editLabel: 'Edit',
                  onDelete: onDeleteAnnotation
                    ? () => {
                        void onDeleteAnnotation(a.id)
                        map.closePopup(p)
                      }
                    : undefined,
                }),
              )
              .openOn(map)
          })
        }
        marker.addTo(group)
      }
    }
  }, [annotations, readOnly, onDeleteAnnotation, onUpdateAnnotation, zoomTick, lineEdit])

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
          void live.current.onCreateAnnotation(
            'line',
            { type: 'LineString', coordinates: pts },
            undefined,
            { width: lineWidthRef.current, color: lineColorRef.current },
          )
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
        setTextDraft({ lng: e.latlng.lng, lat: e.latlng.lat, value: '', size: 16, rotation: 0, color: '#111827' })
        setTool('none')
      }
      map.on('click', onClick)
      return () => {
        map.off('click', onClick)
      }
    }
  }, [tool])

  // ── Reposition mode — EXACT capability parity with the full map: the
  // chosen blocks lift into a bright working copy; drag slides the group,
  // the round handle above rotates it (same turf.transformRotate math, so
  // shapes/acreage never change). Save → same bulk-geometry pipeline.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !repositionIds || repositionIds.size === 0) return

    const working = new Map<string, GeoJSON.Polygon>()
    for (const f of fields)
      if (repositionIds.has(f.id))
        working.set(f.id, JSON.parse(JSON.stringify(f.geometry)) as GeoJSON.Polygon)
    if (working.size === 0) return
    repoWorkingRef.current = working

    const group = L.layerGroup().addTo(map)
    repoGroupRef.current = group

    const fc = (): GeoJSON.FeatureCollection => ({
      type: 'FeatureCollection',
      features: Array.from(working.entries()).map(([id, geometry]) => ({
        type: 'Feature',
        properties: { id },
        geometry,
      })),
    })
    const cloneWorking = () => {
      const m = new Map<string, GeoJSON.Polygon>()
      for (const [id, g] of working) m.set(id, JSON.parse(JSON.stringify(g)) as GeoJSON.Polygon)
      return m
    }

    let polys: L.Polygon[] = []
    const render = () => {
      group.clearLayers()
      polys = []
      for (const [, g] of working) {
        const poly = L.polygon(
          g.coordinates.map((ring) => ring.map(([lng, lat]) => [lat, lng] as [number, number])),
          { color: SELECTED_COLOR, weight: 3, fillColor: SELECTED_COLOR, fillOpacity: 0.55 },
        )
        poly.addTo(group)
        polys.push(poly)
      }
    }
    render()

    // frame the group if off-screen (parity with the full map's behavior)
    const b = turf.bbox(fc())
    const groupBounds = L.latLngBounds([b[1], b[0]], [b[3], b[2]])
    if (!map.getBounds().contains(groupBounds)) map.fitBounds(groupBounds.pad(0.3))

    // rotate handle — same styled round marker above the group
    const handleEl = document.createElement('div')
    handleEl.style.cssText =
      'width:36px;height:36px;border-radius:9999px;background:#fff;border:2px solid ' +
      SELECTED_COLOR +
      ';box-shadow:0 1px 5px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;cursor:grab;touch-action:none;'
    handleEl.innerHTML =
      '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#1A3D2E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/></svg>'
    const handleAnchor = (): [number, number] => {
      const bb = turf.bbox(fc())
      const pad = (bb[3] - bb[1]) * 0.18 || 0.0005
      return [(bb[0] + bb[2]) / 2, bb[3] + pad]
    }
    const anchor0 = handleAnchor()
    const handle = L.marker([anchor0[1], anchor0[0]], {
      icon: L.divIcon({ className: '', html: handleEl.outerHTML, iconSize: [36, 36], iconAnchor: [18, 18] }),
      draggable: true,
    }).addTo(map)
    const placeHandle = () => {
      const a = handleAnchor()
      handle.setLatLng([a[1], a[0]])
    }

    let rotateBase: Map<string, GeoJSON.Polygon> | null = null
    let rotatePivot: [number, number] | null = null
    let startBearing = 0
    handle.on('dragstart', () => {
      rotateBase = cloneWorking()
      rotatePivot = turf.centroid(fc()).geometry.coordinates as [number, number]
      const ll = handle.getLatLng()
      startBearing = turf.bearing(rotatePivot, [ll.lng, ll.lat])
    })
    handle.on('drag', () => {
      if (!rotateBase || !rotatePivot) return
      const ll = handle.getLatLng()
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
      working.clear()
      for (const feat of rotated.features)
        working.set(feat.properties!.id as string, feat.geometry as GeoJSON.Polygon)
      render()
    })
    handle.on('dragend', () => {
      rotateBase = null
      rotatePivot = null
      placeHandle()
    })

    // drag that STARTS on the group slides it; empty map still pans
    let moveBase: Map<string, GeoJSON.Polygon> | null = null
    let moveStart: L.LatLng | null = null
    const onDown = (e: L.LeafletMouseEvent) => {
      const pt = turf.point([e.latlng.lng, e.latlng.lat])
      const hit = Array.from(working.values()).some((g) =>
        turf.booleanPointInPolygon(pt, { type: 'Feature', properties: {}, geometry: g }),
      )
      if (!hit) return
      map.dragging.disable()
      moveBase = cloneWorking()
      moveStart = e.latlng
    }
    const onMove = (e: L.LeafletMouseEvent) => {
      if (!moveBase || !moveStart) return
      const dLng = e.latlng.lng - moveStart.lng
      const dLat = e.latlng.lat - moveStart.lat
      working.clear()
      for (const [id, g] of moveBase) {
        working.set(id, {
          type: 'Polygon',
          coordinates: g.coordinates.map((ring) => ring.map(([lng, lat]) => [lng + dLng, lat + dLat])),
        })
      }
      render()
    }
    const onUp = () => {
      if (!moveBase) return
      moveBase = null
      moveStart = null
      map.dragging.enable()
      placeHandle()
    }
    map.on('mousedown', onDown)
    map.on('mousemove', onMove)
    map.on('mouseup', onUp)

    return () => {
      try {
        map.off('mousedown', onDown)
        map.off('mousemove', onMove)
        map.off('mouseup', onUp)
        handle.remove()
        group.remove()
        map.dragging.enable()
      } catch {
        /* map already removed */
      }
      repoGroupRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repositionIds, fields])

  // ── Move/reshape an existing LINE (lite): an editable clone gets geoman
  // vertex handles + whole-line dragging; Save PATCHes geometry + width.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !lineEdit) return
    const ann = annotations.find((x) => x.id === lineEdit.id)
    if (!ann || ann.geometry.type !== 'LineString') return
    const layer = L.polyline(
      ann.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
      { color: ann.color, weight: ann.width ?? 3, dashArray: '6 4' },
    ).addTo(map)
    lineEditLayerRef.current = layer
    layer.pm.enable({ allowSelfIntersection: true })
    layer.pm.enableLayerDrag()
    return () => {
      try {
        layer.pm.disableLayerDrag()
        layer.pm.disable()
        layer.remove()
      } catch {
        /* map already removed */
      }
      lineEditLayerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineEdit?.id])

  // Live preview while editing a line: width/color changes apply instantly.
  useEffect(() => {
    if (lineEdit) lineEditLayerRef.current?.setStyle({ weight: lineEdit.width, color: lineEdit.color })
  }, [lineEdit])

  // Camera parity with the full map: layer/plantation selection reframes.
  const prevSelKeyRef = useRef<string | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!map || fields.length === 0) return
    if (prevSelKeyRef.current === null) {
      prevSelKeyRef.current = selectionKey
      return // mount handled by saved-camera/fit
    }
    if (prevSelKeyRef.current === selectionKey) return
    prevSelKeyRef.current = selectionKey
    const target =
      filterIds && filterIds.size > 0
        ? fields.filter((f) => filterIds.has(f.id))
        : visibleIds
          ? fields.filter((f) => visibleIds.has(f.id))
          : fields
    const pts: [number, number][] = []
    for (const f of target)
      for (const ring of f.geometry?.coordinates ?? [])
        for (const [lng, lat] of ring) pts.push([lat, lng])
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.04))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey, fields])

  // Deep-link focus: zoom to the block with context (once per id).
  const focusedRef = useRef<string | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !focusFieldId || focusedRef.current === focusFieldId) return
    const f = fields.find((x) => x.id === focusFieldId)
    if (!f) return
    focusedRef.current = focusFieldId
    const pts: [number, number][] = []
    for (const ring of f.geometry?.coordinates ?? [])
      for (const [lng, lat] of ring) pts.push([lat, lng])
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(1.2))
  }, [focusFieldId, fields])

  // Fly to a newly selected block (skip the deep-link case — focus framed it).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedFieldId || selectedFieldId === focusFieldId) return
    const f = fields.find((x) => x.id === selectedFieldId)
    if (f) map.setView([f.centroid_lat, f.centroid_lng], Math.max(map.getZoom(), 16))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFieldId])

  // Pencil cursor while a tool is armed — toggled imperatively so React
  // never rewrites the holder's className (see render comment).
  useEffect(() => {
    holderRef.current?.classList.toggle('lite-pencil', tool !== 'none')
  }, [tool])

  // Esc cancels any in-progress tool — same as the full map.
  useEffect(() => {
    if (tool === 'none' && !lineChooser) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        mapRef.current?.pm.disableDraw()
        setTool('none')
        setLineChooser(false)
        setLineEdit(null)
        setTextDraft(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tool, lineChooser])

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
      {/* className must stay STATIC: React rewriting it would wipe the
          classes Leaflet adds imperatively (leaflet-container etc.) and
          visually kill the map. The pencil class toggles via classList. */}
      <div ref={holderRef} className="absolute inset-0 z-0" />
      <style>{`
        .lite-label { background: transparent; border: none; box-shadow: none; font-weight: 700; font-size: 11px; color: #111827; }
        .lite-label-sat { color: #fff; text-shadow: 0 0 3px #000, 0 0 3px #000; }
        .lite-label::before { display: none; }
        .lite-pencil, .lite-pencil * { cursor: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAuUlEQVR4nO2U4Q2CMBBGe13CRHeQCWQSx2MSnEB2qIlTfOZMmhz0BHq98MuX8AMK77VpSgh/jgIAtOfRS/4eejUSveSMFole8swyYg4AwKXvwuk+FmMyElvkjBbheyIiUwBCnpERKWeoVS5J43Mmr1oBDPLdARjluwJokG8GWuWrAQ/5z4CXnCleOt+u6l/RIq8+aKlSXgR49izhy0O+ugIZSUb5LJBnn5GbTEb591sZkAOvx2SWHsoH0v2NW7G57dwAAAAASUVORK5CYII=) 2 21, crosshair !important; }
      `}</style>

      {/* Palette legend — the SAME shared component as the full map, same
          show/hide rule (hidden while plan colors paint). z-[1000] because
          Leaflet panes stack above plain z-10. */}
      {!blockColors && (fields.some((f) => f.current_ratoon) || mode === 'crop' || colorBy === 'variety') && (
        <div className="z-[1000] absolute inset-0 pointer-events-none [&>div]:pointer-events-auto">
          <MapLegend colorBy={colorBy} stageColors={stageColors} varietyColors={varietyColors} />
        </div>
      )}

      {/* Labeled action buttons — overlay the map at top-left. EXACT clone of
          the full map's toolbar: same buttons, classes, copy, and positions.
          Only the engine under the buttons differs. */}
      <div className="absolute top-3 left-3 right-14 md:right-auto z-[1000] flex flex-col gap-2 pointer-events-none items-start">
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
          {!readOnly && (
            <>
              {onCreateField && (
                <button
                  type="button"
                  onClick={() => {
                    setLineChooser(false)
                    setTool(tool === 'block' ? 'none' : 'block')
                  }}
                  className={`pointer-events-auto inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold shadow-md transition ${
                    tool === 'block'
                      ? 'bg-white text-primary border-2 border-primary hover:bg-gray-50'
                      : 'bg-accent text-primary-dark hover:bg-accent-dark'
                  }`}
                >
                  {tool === 'block' ? (
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
              )}
              {onCreateAnnotation && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (tool === 'line' || tool === 'freehand') {
                        mapRef.current?.pm.disableDraw()
                        setTool('none')
                      } else {
                        setTool('none')
                        setLineChooser(!lineChooser)
                      }
                    }}
                    title="Draw a reference line (road, ditch)"
                    className={`pointer-events-auto inline-flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold shadow-md transition border-2 ${
                      tool === 'line' || tool === 'freehand' || lineChooser
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-primary border-primary hover:bg-primary/5'
                    }`}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path d="M3.5 14.5a2 2 0 102.83 2.83l9.5-9.5A2 2 0 1013 5l-9.5 9.5z" />
                      <circle cx="4.75" cy="15.75" r="1.75" />
                      <circle cx="15.25" cy="4.75" r="1.75" />
                    </svg>
                    {tool === 'line' || tool === 'freehand' ? 'Cancel line' : 'Line'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLineChooser(false)
                      setTool(tool === 'text' ? 'none' : 'text')
                    }}
                    title="Add a text label (Hwy 308, Shop, N)"
                    className={`pointer-events-auto inline-flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold shadow-md transition border-2 ${
                      tool === 'text'
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-primary border-primary hover:bg-primary/5'
                    }`}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path d="M4 4a1 1 0 011-1h10a1 1 0 011 1v2a1 1 0 11-2 0V5h-3v10h1a1 1 0 110 2H8a1 1 0 110-2h1V5H6v1a1 1 0 01-2 0V4z" />
                    </svg>
                    {tool === 'text' ? 'Cancel text' : 'Text'}
                  </button>
                </>
              )}
              {selectedFieldId && onUpdateField && !editingShape && (
                <button
                  type="button"
                  onClick={() => setEditingShape(true)}
                  className="pointer-events-auto inline-flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold shadow-md transition bg-white text-primary border-2 border-primary hover:bg-primary/5"
                >
                  Edit shape
                </button>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => {
              setLocating(true)
              setLocateError(null)
              navigator.geolocation?.getCurrentPosition(
                (pos) => {
                  setLocating(false)
                  setLocateAccuracy(pos.coords.accuracy)
                  setGpsOn(true)
                  mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], Math.max(mapRef.current.getZoom(), 15))
                },
                () => {
                  setLocating(false)
                  setLocateError("Couldn't get a location fix. Check that location access is allowed for this site.")
                },
                { enableHighAccuracy: true, timeout: 10000 },
              )
            }}
            disabled={locating || tool !== 'none'}
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
              <span className="text-gray-500 ml-1">(Wi-Fi triangulation — use phone for GPS)</span>
            </div>
          )}
        </div>

        {tool !== 'none' && (
          <div className="pointer-events-none rounded-md bg-primary-dark/90 text-white px-3 py-2 text-xs leading-snug max-w-xs shadow-md">
            {tool === 'line'
              ? 'Click points along the road or ditch. Double-click the last point to finish. Press Esc to cancel.'
              : tool === 'freehand'
                ? 'Press and drag to draw. Let go to save the line.'
                : tool === 'text'
                  ? 'Click the map where the label should go.'
                  : 'Click each corner of the block. Double-click the last corner to finish. Press Esc to cancel.'}
          </div>
        )}

        {lineChooser && tool === 'none' && (
          <div className="pointer-events-auto rounded-md bg-white shadow-md border border-gray-100 px-3 py-2 flex items-center gap-2 flex-wrap max-w-xs">
            {(
              [
                ['freehand', 'Freehand'],
                ['line', 'Point to point'],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setLineChooser(false)
                  setTool(m)
                }}
                className="text-xs font-semibold rounded-md border-2 border-primary text-primary px-2.5 py-1.5 hover:bg-primary hover:text-white transition"
              >
                {label}
              </button>
            ))}
            <div className="basis-full flex items-center gap-2 pt-1">
              <span className="text-[11px] font-semibold text-gray-500 shrink-0">Thickness</span>
              <input type="range" min={0.5} max={8} step={0.5} value={lineWidth}
                onChange={(e) => setLineWidth(Number(e.target.value))} className="flex-1" aria-label="Line thickness" />
              <span className="text-xs text-gray-500 w-7 text-right">{lineWidth}</span>
            </div>
            <div className="basis-full rounded-full" style={{ height: Math.max(2, lineWidth), backgroundColor: lineColor }} />
            <div className="basis-full flex items-center gap-1.5 pt-1">
              <span className="text-[11px] font-semibold text-gray-500 shrink-0">Color</span>
              {ANNO_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setLineColor(c)} aria-label={`Line color ${c}`}
                  className={`w-5 h-5 rounded-full border-2 ${lineColor === c ? 'border-primary scale-110' : 'border-white shadow'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
        )}

        {locateError && (
          <div className="pointer-events-auto rounded-md bg-red-50 border border-red-100 text-red-800 px-3 py-2 text-xs leading-snug max-w-xs shadow-md flex items-start gap-2">
            <span>{locateError}</span>
            <button type="button" onClick={() => setLocateError(null)} className="text-red-600 hover:underline shrink-0" aria-label="Dismiss">
              ×
            </button>
          </div>
        )}

        {editingShape && (
          <div className="pointer-events-auto rounded-md bg-white shadow-md border border-gray-200 p-2 space-y-1.5 max-w-[190px]">
            <p className="text-xs text-gray-600">Drag the corners into place.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => void finishReshape()} className="btn-primary text-xs px-2.5 py-1.5">
                Save shape
              </button>
              <button type="button" onClick={() => setEditingShape(false)} className="text-xs text-gray-600 hover:text-primary">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Text-label input — exact clone of the full map's panel. */}
      {textDraft && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1000] pointer-events-auto">
          <form
            className="rounded-md bg-white shadow-lg border border-gray-200 p-3 space-y-2 w-72"
            onSubmit={(e) => {
              e.preventDefault()
              const value = textDraft.value.trim()
              if (!value) return
              if (textDraft.editingId && onUpdateAnnotation) {
                void onUpdateAnnotation(textDraft.editingId, {
                  text: value,
                  size: textDraft.size,
                  rotation: textDraft.rotation,
                  color: textDraft.color,
                })
              } else if (onCreateAnnotation) {
                void onCreateAnnotation(
                  'text',
                  { type: 'Point', coordinates: [textDraft.lng, textDraft.lat] },
                  value,
                  { size: textDraft.size, rotation: textDraft.rotation, color: textDraft.color },
                )
              }
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
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500 w-10">Size</span>
              <input type="range" min={8} max={48} step={1} value={textDraft.size}
                onChange={(e) => setTextDraft({ ...textDraft, size: Number(e.target.value) })} className="flex-1" aria-label="Label size" />
              <span className="text-xs text-gray-500 w-9 text-right">{textDraft.size}px</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500 w-10">Color</span>
              {ANNO_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setTextDraft({ ...textDraft, color: c })} aria-label={`Label color ${c}`}
                  className={`w-5 h-5 rounded-full border-2 ${textDraft.color === c ? 'border-primary scale-110' : 'border-white shadow'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500 w-10">Turn</span>
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
            {textDraft.value.trim() && (
              <div className="h-16 flex items-center justify-center overflow-hidden">
                <span
                  className="font-bold"
                  style={{ fontSize: Math.min(textDraft.size, 28), transform: `rotate(${textDraft.rotation}deg)`, color: textDraft.color }}
                >
                  {textDraft.value}
                </span>
              </div>
            )}
            <div className="flex gap-2">
              <button type="submit" disabled={!textDraft.value.trim()} className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50">
                Save
              </button>
              <button type="button" className="text-xs text-gray-500" onClick={() => setTextDraft(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* view toggle — identical to the full map */}
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

      {/* Edit-line bar (lite) — same controls as the full map's */}
      {lineEdit && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1000] pointer-events-auto">
          <div className="rounded-md bg-white shadow-lg border border-gray-200 p-3 space-y-2 w-72">
            <p className="text-xs text-gray-500 leading-snug">
              Drag the line to move it. Drag the corner dots to reshape.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-gray-500 shrink-0">Thickness</span>
              <input type="range" min={0.5} max={8} step={0.5} value={lineEdit.width}
                onChange={(e) => setLineEdit({ ...lineEdit, width: Number(e.target.value) })} className="flex-1" aria-label="Line thickness" />
              <span className="text-xs text-gray-500 w-7 text-right">{lineEdit.width}</span>
            </div>
            <div className="rounded-full" style={{ height: Math.max(2, lineEdit.width), backgroundColor: lineEdit.color }} />
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-gray-500 shrink-0">Color</span>
              {ANNO_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setLineEdit({ ...lineEdit, color: c })} aria-label={`Line color ${c}`}
                  className={`w-5 h-5 rounded-full border-2 ${lineEdit.color === c ? 'border-primary scale-110' : 'border-white shadow'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-primary text-xs px-3 py-1.5"
                onClick={() => {
                  if (!onUpdateAnnotation) return
                  const gj = lineEditLayerRef.current?.toGeoJSON() as GeoJSON.Feature | undefined
                  const geometry =
                    gj?.geometry?.type === 'LineString' ? (gj.geometry as GeoJSON.LineString) : undefined
                  void onUpdateAnnotation(lineEdit.id, {
                    ...(geometry ? { geometry } : {}),
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

      {/* Reposition bar — exact clone of the full map's */}
      {repositionIds && repositionIds.size > 0 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1100] w-[calc(100%-1.5rem)] max-w-md">
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
                  if (!onSaveReposition) return
                  setSavingReposition(true)
                  const features = Array.from(repoWorkingRef.current.entries()).map(
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
                className="flex-1 text-sm font-semibold rounded-md border-2 border-gray-200 text-gray-600 hover:border-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="absolute left-1/2 -translate-x-1/2 bottom-20 lg:bottom-3 lg:left-auto lg:right-3 lg:translate-x-0 z-[1000] max-w-xs px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-900 shadow-sm text-center">
        Compatibility mode — full features, lightweight graphics for this computer.
      </div>
    </div>
  )
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] as string)
}

function annotationMenu(opts: {
  onEdit?: () => void
  editLabel: string
  onDelete?: () => void
}): HTMLElement {
  const div = document.createElement('div')
  div.style.cssText = 'display:flex;gap:14px;font-family:system-ui,sans-serif'
  if (opts.onEdit) {
    const edit = document.createElement('button')
    edit.textContent = opts.editLabel
    edit.style.cssText = 'color:#1A3D2E;font-weight:600;font-size:13px;background:none;border:none;padding:0;cursor:pointer'
    edit.onclick = opts.onEdit
    div.appendChild(edit)
  }
  if (opts.onDelete) {
    const btn = document.createElement('button')
    btn.textContent = 'Delete'
    btn.style.cssText = 'color:#dc2626;font-weight:600;font-size:13px;background:none;border:none;padding:0;cursor:pointer'
    btn.onclick = opts.onDelete
    div.appendChild(btn)
  }
  return div
}
