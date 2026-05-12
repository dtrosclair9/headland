import type { WeatherSnapshot } from '@/lib/weather'
import { weatherLabel } from '@/lib/weather'

interface Props {
  weather: WeatherSnapshot | null
}

export function WeatherCard({ weather }: Props) {
  if (!weather) {
    return (
      <section className="bg-white border border-gray-100 rounded-xl p-6">
        <h2 className="text-lg font-bold text-primary mb-2">Weather</h2>
        <p className="text-sm text-gray-500">
          Forecast unavailable right now. We&apos;ll retry on the next page load.
        </p>
      </section>
    )
  }

  const { current, forecast } = weather
  const today = forecast[0]

  return (
    <section className="bg-white border border-gray-100 rounded-xl p-6">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-bold text-primary">Weather</h2>
        <span className="text-xs text-gray-500">Open-Meteo · field centroid</span>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-4xl font-bold text-primary leading-none">
            {current.temperature_f}°
            <span className="text-base text-gray-500 ml-1">F</span>
          </p>
          <p className="text-sm text-gray-700 mt-1">
            {weatherLabel(current.weather_code)}
          </p>
        </div>
        <div className="text-right text-sm text-gray-600 leading-relaxed">
          <div>
            Wind <span className="font-semibold text-primary">{current.wind_mph} mph</span>
          </div>
          <div>
            Humidity <span className="font-semibold text-primary">{current.humidity}%</span>
          </div>
          {today && (
            <div>
              Today {today.high_f}° / {today.low_f}°
              {today.precip_in > 0 && <> · {today.precip_in}&quot; rain</>}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-gray-100 pt-3">
        <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">
          7-day forecast
        </p>
        <div className="grid grid-cols-7 gap-1 text-center">
          {forecast.map((d, i) => (
            <div key={d.date} className="text-xs">
              <p className="font-semibold text-gray-700">
                {i === 0
                  ? 'Today'
                  : new Date(d.date).toLocaleDateString('en-US', {
                      weekday: 'short',
                    })}
              </p>
              <p className="font-bold text-primary mt-1">{d.high_f}°</p>
              <p className="text-gray-500">{d.low_f}°</p>
              {d.precip_in > 0 && (
                <p className="text-blue-600 text-[10px] mt-0.5">
                  {d.precip_in.toFixed(1)}&quot;
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
