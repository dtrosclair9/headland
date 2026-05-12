// Open-Meteo client. Free, no API key, no auth. Cached 1 hour at the fetch layer.
// API: https://open-meteo.com/en/docs

export interface CurrentWeather {
  temperature_f: number
  humidity: number
  wind_mph: number
  weather_code: number
  observed_at: string
}

export interface DailyForecast {
  date: string
  high_f: number
  low_f: number
  precip_in: number
  weather_code: number
}

export interface WeatherSnapshot {
  current: CurrentWeather
  forecast: DailyForecast[]
  source: 'open-meteo'
}

// WMO weather code → short human label.
// Reference: https://open-meteo.com/en/docs (Weather variable documentation)
const WMO_LABELS: Record<number, string> = {
  0: 'Clear',
  1: 'Mostly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Rime fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  80: 'Showers',
  81: 'Heavy showers',
  82: 'Violent showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm w/ hail',
  99: 'Severe thunderstorm w/ hail',
}

export function weatherLabel(code: number): string {
  return WMO_LABELS[code] ?? `Code ${code}`
}

export async function fetchWeather(
  lat: number,
  lng: number,
): Promise<WeatherSnapshot | null> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', lat.toFixed(4))
  url.searchParams.set('longitude', lng.toFixed(4))
  url.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code',
  )
  url.searchParams.set(
    'daily',
    'temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code',
  )
  url.searchParams.set('temperature_unit', 'fahrenheit')
  url.searchParams.set('wind_speed_unit', 'mph')
  url.searchParams.set('precipitation_unit', 'inch')
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('forecast_days', '7')

  try {
    const res = await fetch(url.toString(), {
      // Cache 1 hour (3600s). Open-Meteo updates hourly.
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.current || !data?.daily) return null

    const current: CurrentWeather = {
      temperature_f: Math.round(data.current.temperature_2m),
      humidity: Math.round(data.current.relative_humidity_2m),
      wind_mph: Math.round(data.current.wind_speed_10m),
      weather_code: data.current.weather_code,
      observed_at: data.current.time,
    }

    const dates: string[] = data.daily.time
    const highs: number[] = data.daily.temperature_2m_max
    const lows: number[] = data.daily.temperature_2m_min
    const precips: number[] = data.daily.precipitation_sum
    const codes: number[] = data.daily.weather_code

    const forecast: DailyForecast[] = dates.map((date, i) => ({
      date,
      high_f: Math.round(highs[i]),
      low_f: Math.round(lows[i]),
      precip_in: Number((precips[i] ?? 0).toFixed(2)),
      weather_code: codes[i],
    }))

    return { current, forecast, source: 'open-meteo' }
  } catch {
    return null
  }
}
