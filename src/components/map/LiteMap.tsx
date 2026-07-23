'use client'

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import * as turf from '@turf/turf'
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
  onShowFields,
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
  onShowFields?: () => void
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
    style?: { size?: number; rotation?: number; width?: number },
  ) => Promise<void>
  onUpdateAnnotation?: (
    id: string,
    patch: {
      geometry?: GeoJSON.LineString | GeoJSON.Point
      text?: string
      size?: number
      rotation?: number
      width?: number | null
    },
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
  const [textDraft, setTextDraft] = useState<{
    lng: number
    lat: number
    value: string
    size: number
    rotation: number
    /** set when editing an existing label instead of creating one */
    editingId?: string
  } | null>(null)
  const [lineEdit, setLineEdit] = useState<{ id: string; width: number } | null>(null)
  const lineEditLayerRef = useRef<L.Polyline | null>(null)
  const [locating, setLocating] = useState(false)
  const [locateAccuracy, setLocateAccuracy] = useState<number | null>(null)
  const [locateError, setLocateError] = useState<string | null>(null)
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
      zoomControl: false,
      attributionControl: false,
      // canvas renderer: fastest non-GPU path for hundreds of polygons
      preferCanvas: true,
    })
    // Zoom top-right, same corner as the full map's navigation control —
    // and clear of the draw-tools column top-left.
    L.control.zoom({ position: 'topright' }).addTo(map)
    mapRef.current = map
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
        })
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
    const repositioning = !!repositionIds && repositionIds.size > 0
    const shown = (visibleIds ? fields.filter((f) => visibleIds.has(f.id)) : fields).filter(
      (f) => !repositioning || !repositionIds!.has(f.id),
    )
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
        fillOpacity: repositioning ? 0.25 : sat ? (sel ? 0.35 : 0.08) : 0.9,
      })
      poly.on('click', (ev) => {
        if (live.current.tool !== 'none') return
        L.DomEvent.stopPropagation(ev)
        live.current.onSelectField(f.id)
      })
      if (showLabels) {
        const cutShort: Record<string, string> = {
          plant_cane: 'PC', first_stubble: '1st', second_stubble: '2nd', third_stubble: '3rd',
          fourth_stubble: '4th', fifth_stubble_plus: '5th', sixth_stubble_plus: '6th+', fallow: 'F',
        }
        const facts = [
          Number(f.acreage_cached || 0) ? `${Number(f.acreage_cached).toFixed(2)} ac` : '',
          f.variety ?? '',
          f.current_ratoon ? (cutShort[f.current_ratoon] ?? '') : '',
        ].filter(Boolean).join(' · ')
        poly.bindTooltip(
          `<div style="text-align:center"><strong>${escapeHtml(f.name)}</strong>${facts ? `<br/><span style="font-weight:500;font-size:10px">${escapeHtml(facts)}</span>` : ''}</div>`,
          {
            permanent: true,
            direction: 'center',
            className: sat ? 'lite-label lite-label-sat' : 'lite-label',
          },
        )
      }
      poly.addTo(group)
      // reshape mode for the selected block — geoman vertex editing
      if (sel && editingShape && onUpdateField && !readOnly) {
        poly.pm.enable({ allowSelfIntersection: false })
        editTargetRef.current = poly
      }
    }
  }, [fields, selectedFieldId, mode, colorBy, varietyColors, highlightColor, filterIds, visibleIds, whiteMap, stageColorMap, editingShape, onUpdateField, readOnly, zoomTick, repositionIds])

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
                        setLineEdit({ id: a.id, width: a.width ?? 3 })
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
            { width: lineWidthRef.current },
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
        setTextDraft({ lng: e.latlng.lng, lat: e.latlng.lat, value: '', size: 16, rotation: 0 })
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

  // Esc cancels any in-progress tool — same as the full map.
  useEffect(() => {
    if (tool === 'none' && !lineChooser) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        mapRef.current?.pm.disableDraw()
        setTool('none')
        setLineChooser(false)
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
      <div ref={holderRef} className="absolute inset-0 z-0" />
      <style>{`
        .lite-label { background: transparent; border: none; box-shadow: none; font-weight: 700; font-size: 11px; color: #111827; }
        .lite-label-sat { color: #fff; text-shadow: 0 0 3px #000, 0 0 3px #000; }
        .lite-label::before { display: none; }
        .lite-pencil, .lite-pencil * { cursor: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAuUlEQVR4nO2U4Q2CMBBGe13CRHeQCWQSx2MSnEB2qIlTfOZMmhz0BHq98MuX8AMK77VpSgh/jgIAtOfRS/4eejUSveSMFole8swyYg4AwKXvwuk+FmMyElvkjBbheyIiUwBCnpERKWeoVS5J43Mmr1oBDPLdARjluwJokG8GWuWrAQ/5z4CXnCleOt+u6l/RIq8+aKlSXgR49izhy0O+ugIZSUb5LJBnn5GbTEb591sZkAOvx2SWHsoH0v2NW7G57dwAAAAASUVORK5CYII=) 2 21, crosshair !important; }
      `}</style>

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
            <span className="basis-full h-0" />
            <span className="text-[11px] font-semibold text-gray-500">Thickness:</span>
            {(
              [
                [1.5, 'Thin'],
                [3, 'Medium'],
                [5, 'Thick'],
              ] as const
            ).map(([w, label]) => (
              <button
                key={w}
                type="button"
                onClick={() => setLineWidth(w)}
                className={`text-[11px] font-semibold rounded-full px-2 py-0.5 border transition ${
                  lineWidth === w
                    ? 'bg-primary text-white border-primary'
                    : 'border-gray-300 text-gray-600 hover:border-primary hover:text-primary'
                }`}
              >
                {label}
              </button>
            ))}
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
                })
              } else if (onCreateAnnotation) {
                void onCreateAnnotation(
                  'text',
                  { type: 'Point', coordinates: [textDraft.lng, textDraft.lat] },
                  value,
                  { size: textDraft.size, rotation: textDraft.rotation },
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
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500 w-10">Size</span>
              {(
                [
                  ['S', 12],
                  ['M', 16],
                  ['L', 24],
                  ['XL', 36],
                ] as const
              ).map(([label, px]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setTextDraft({ ...textDraft, size: px })}
                  className={`text-xs font-semibold rounded-md border-2 px-2.5 py-1 transition ${
                    textDraft.size === px
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-primary'
                  }`}
                >
                  {label}
                </button>
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
                  className="font-bold text-gray-800"
                  style={{ fontSize: Math.min(textDraft.size, 28), transform: `rotate(${textDraft.rotation}deg)` }}
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
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold text-gray-500">Thickness:</span>
              {([[1.5, 'Thin'], [3, 'Medium'], [5, 'Thick']] as const).map(([w, label]) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setLineEdit({ ...lineEdit, width: w })}
                  className={`text-[11px] font-semibold rounded-full px-2 py-0.5 border transition ${
                    lineEdit.width === w
                      ? 'bg-primary text-white border-primary'
                      : 'border-gray-300 text-gray-600 hover:border-primary hover:text-primary'
                  }`}
                >
                  {label}
                </button>
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
