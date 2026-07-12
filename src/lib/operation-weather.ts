// Weather at the field WHEN AN OPERATION HAPPENED — spray/burn record-keeping
// (drift disputes, LDAF paperwork). Open-Meteo, free, no key. If the operation
// has a time we record that hour's conditions — temp, humidity, wind speed +
// direction, precip — otherwise the day's summary. Recent dates use the
// forecast API (reaches ~3 months back); older dates the ERA5 archive.

export interface OperationWeather {
  /** compact one-line display, e.g. "74°F · RH 62% · wind 8 mph SE" */
  summary: string
  tempF?: number
  tempMaxF?: number
  tempMinF?: number
  humidityPct?: number
  windMph?: number
  windDir?: string
  precipIn?: number
  /** 'hour' when a time was given, 'day' for a daily summary */
  resolution: 'hour' | 'day'
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
export function compassDir(deg: number): string {
  return COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]
}

const UNITS =
  'temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FChicago'

// date: YYYY-MM-DD, time: HH:MM (optional). Returns null on any failure —
// weather is best-effort; a fetch hiccup must never block logging work.
export async function fetchOperationWeather(
  lat: number,
  lng: number,
  date: string,
  time?: string | null,
): Promise<OperationWeather | null> {
  try {
    const ageDays = (Date.now() - new Date(`${date}T12:00:00Z`).getTime()) / 86_400_000
    // The forecast API reaches ~92 days back; ERA5 archive covers the rest.
    const base =
      ageDays > 85
        ? 'https://archive-api.open-meteo.com/v1/archive'
        : 'https://api.open-meteo.com/v1/forecast'
    const loc = `latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&start_date=${date}&end_date=${date}`

    if (time) {
      const url = `${base}?${loc}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation&${UNITS}`
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
      if (!res.ok) return null
      const data = await res.json()
      const hours: string[] = data.hourly?.time ?? []
      const i = hours.indexOf(`${date}T${time.slice(0, 2)}:00`)
      if (i === -1) return null
      const temp = Math.round(data.hourly.temperature_2m?.[i])
      if (!Number.isFinite(temp)) return null
      const rh = Math.round(data.hourly.relative_humidity_2m?.[i])
      const wind = Math.round(data.hourly.wind_speed_10m?.[i])
      const dir = compassDir(data.hourly.wind_direction_10m?.[i] ?? 0)
      return {
        summary: `${temp}°F · RH ${rh}% · wind ${wind} mph ${dir}`,
        tempF: temp,
        humidityPct: rh,
        windMph: wind,
        windDir: dir,
        precipIn: data.hourly.precipitation?.[i] ?? undefined,
        resolution: 'hour',
      }
    }

    const url = `${base}?${loc}&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_direction_10m_dominant,precipitation_sum&${UNITS}`
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const data = await res.json()
    const d = data.daily
    const hi = Math.round(d?.temperature_2m_max?.[0])
    if (!Number.isFinite(hi)) return null
    const lo = Math.round(d.temperature_2m_min[0])
    const wind = Math.round(d.wind_speed_10m_max[0])
    const dir = compassDir(d.wind_direction_10m_dominant?.[0] ?? 0)
    const precip = d.precipitation_sum?.[0] ?? 0
    return {
      summary:
        `${lo}–${hi}°F · wind to ${wind} mph ${dir}` +
        (precip > 0.005 ? ` · ${precip.toFixed(2)}" rain` : ''),
      tempMaxF: hi,
      tempMinF: lo,
      windMph: wind,
      windDir: dir,
      precipIn: precip,
      resolution: 'day',
    }
  } catch {
    return null
  }
}
