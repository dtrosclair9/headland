// LDAF smoke-management "Category Day" (1–5) for sugarcane burning — issued
// each morning inside the NWS Fire Weather Planning Forecast (FWF), per fire
// weather zone. Auto-fetched so the farmer never has to go look it up:
//   1. api.weather.gov/points → the farm's fire weather zone + NWS office
//   2. Iowa State Mesonet's AFOS archive → that office's FWF text for the
//      date (archived for years, so this also works retroactively in audits)
//   3. parse the zone's block for its first "Category Day" value
// Best-effort like the weather fetch: null on any failure, never blocks a log.

export interface BurnCategoryResult {
  category: '1' | '2' | '3' | '4' | '5'
  /** provenance, e.g. "NWS LIX FWF 202511051026 zone LAZ094" */
  source: string
}

const UA = { 'User-Agent': 'headlandmaps.com (support@headlandmaps.com)' }

// "LAZ034>037-046-052300-" → ["LAZ034","LAZ035","LAZ036","LAZ037","LAZ046"]
// (the trailing 6-digit token is the UGC expiry, not a zone)
function expandZoneGroup(header: string): string[] {
  const out: string[] = []
  let state = ''
  for (const token of header.replace(/\s+/g, '').split('-')) {
    const m = token.match(/^([A-Z]{2}Z)?(\d{3})(?:>(\d{3}))?$/)
    if (!m) continue
    if (m[1]) state = m[1]
    if (!state) continue
    const from = parseInt(m[2], 10)
    const to = m[3] ? parseInt(m[3], 10) : from
    for (let z = from; z <= to; z++) out.push(`${state}${String(z).padStart(3, '0')}`)
  }
  return out
}

export async function fetchBurnCategory(
  lat: number,
  lng: number,
  date: string,
): Promise<BurnCategoryResult | null> {
  try {
    // 1. Farm → NWS office + fire weather zone.
    const ptRes = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lng.toFixed(4)}`, {
      headers: UA,
      signal: AbortSignal.timeout(6000),
    })
    if (!ptRes.ok) return null
    const pt = await ptRes.json()
    const office: string | undefined = pt?.properties?.cwa
    const zoneUrl: string | undefined = pt?.properties?.fireWeatherZone
    const zone = zoneUrl?.split('/').pop()
    if (!office || !zone) return null

    // 2. The FWF issued that morning (last product before 18Z ≈ noon CT).
    const stamp = date.replace(/-/g, '')
    const prodRes = await fetch(
      `https://mesonet.agron.iastate.edu/cgi-bin/afos/retrieve.py?pil=FWF${office}&e=${stamp}1800&limit=1&fmt=text`,
      { headers: UA, signal: AbortSignal.timeout(8000) },
    )
    if (!prodRes.ok) return null
    const text = await prodRes.text()
    if (!text.includes('Category Day')) return null

    // 3. Find the zone block (blocks start with a UGC header line containing
    //    zone ranges) and take its FIRST Category Day value — today's number.
    const blocks = text.split(/\n(?=[A-Z]{2}Z\d{3})/)
    for (const block of blocks) {
      const header = block.slice(0, block.indexOf('\n'))
      if (!expandZoneGroup(header).includes(zone)) continue
      const m = block.match(/Category Day\s+([1-5])/)
      if (!m) return null
      return {
        category: m[1] as BurnCategoryResult['category'],
        source: `NWS ${office} FWF ${stamp} zone ${zone}`,
      }
    }
    return null
  } catch {
    return null
  }
}
