/* Weather Widget -- shared across pages with module-level caching */
'use client'

import { useEffect, useState } from 'react'

interface Weather {
  condition: string
  temp: string
  wind: string
}

// Module-level cache: prevents re-fetching on every component mount/tab switch
const weatherCache: { data: Weather | null; ts: number; zip: string } = { data: null, ts: 0, zip: '' }
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

const WEATHER_ICONS: Record<string, string> = {
  '113': '\u2600\uFE0F', '116': '\u26C5', '119': '\u2601\uFE0F', '122': '\u2601\uFE0F',
  '143': '\uD83C\uDF2B', '176': '\uD83C\uDF26', '200': '\u26C8', '230': '\uD83C\uDF28',
  '266': '\uD83C\uDF27', '320': '\uD83C\uDF28', '356': '\uD83C\uDF27', '362': '\uD83C\uDF28',
}

function parseWeatherJson(data: Record<string, unknown>): Weather | null {
  const current = (data?.current_condition as Record<string, unknown>[])?.[0]
  if (!current) return null
  const code = String(current.weatherCode ?? '')
  const wdir = (current.winddir16Point as string)?.[0] || ''
  return {
    condition: WEATHER_ICONS[code] || '\uD83C\uDF24',
    temp: `${current.temp_F}\u00B0`,
    wind: `${wdir}${current.windspeedMiles}mph`,
  }
}

export function WeatherWidget({ zip = '95368' }: { zip?: string }) {
  const [weather, setWeather] = useState<Weather | null>(() => {
    // Return cached data if still fresh for this zip code
    if (weatherCache.zip === zip && weatherCache.data && Date.now() - weatherCache.ts < CACHE_TTL_MS) {
      return weatherCache.data
    }
    return null
  })

  useEffect(() => {
    // Use cache if fresh
    if (weatherCache.zip === zip && weatherCache.data && Date.now() - weatherCache.ts < CACHE_TTL_MS) {
      setWeather(weatherCache.data)
      return
    }

    const controller = new AbortController()

    fetch(`https://wttr.in/${encodeURIComponent(zip)}?format=j1`, { signal: controller.signal })
      .then(r => r.json())
      .then(data => {
        const parsed = parseWeatherJson(data)
        if (parsed) {
          weatherCache.data = parsed
          weatherCache.ts = Date.now()
          weatherCache.zip = zip
          setWeather(parsed)
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return
        // Fallback to simple text format
        fetch(`https://wttr.in/${encodeURIComponent(zip)}?format=%c+%t+%w`, { signal: controller.signal })
          .then(r => r.text())
          .then(t => {
            const parts = t.trim().split(' ')
            const parsed: Weather = {
              condition: parts[0] || '\uD83C\uDF24',
              temp: parts[1] || '\u2014',
              wind: parts.slice(2).join(' ') || '',
            }
            weatherCache.data = parsed
            weatherCache.ts = Date.now()
            weatherCache.zip = zip
            setWeather(parsed)
          })
          .catch(() => {})
      })

    return () => controller.abort()
  }, [zip])

  return (
    <div className="math-weather">
      {weather ? (
        <>
          <span className="math-weather-icon">{weather.condition}</span>
          <span className="math-weather-temp">{weather.temp}</span>
          <span className="math-weather-wind">{weather.wind}</span>
        </>
      ) : (
        <span className="math-weather-loading">{'\uD83D\uDCE1'}</span>
      )}
    </div>
  )
}
