'use client'

import { useEffect, useState } from 'react'

interface Props {
  fieldId: string
  configured: boolean
}

type Tab = 'vigor' | 'latest'

export function FieldImageryCard({ fieldId, configured }: Props) {
  const [tab, setTab] = useState<Tab>('latest')
  const [bust, setBust] = useState(() => new Date().toISOString().slice(0, 10))

  const refresh = () => setBust(`${Date.now()}`)

  return (
    <section className="bg-white border border-gray-100 rounded-xl p-6">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-bold text-primary">Satellite</h2>
        <span className="text-xs text-gray-500">Sentinel-2 · ~5–15 day refresh</span>
      </div>

      {!configured ? (
        <div className="rounded-md bg-gray-50 border border-gray-100 p-4 text-sm text-gray-600 leading-relaxed">
          <p className="font-semibold text-primary mb-1">Not configured yet.</p>
          <p>
            Recent satellite imagery (vigor + true color) requires a free Copernicus
            Data Space account. Add{' '}
            <code className="bg-gray-100 px-1 rounded text-xs">SENTINEL_HUB_CLIENT_ID</code>{' '}
            and{' '}
            <code className="bg-gray-100 px-1 rounded text-xs">SENTINEL_HUB_CLIENT_SECRET</code>{' '}
            to <code className="bg-gray-100 px-1 rounded text-xs">.env.local</code> and
            restart.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-3">
            <TabButton active={tab === 'latest'} onClick={() => setTab('latest')}>
              Latest view
            </TabButton>
            <TabButton active={tab === 'vigor'} onClick={() => setTab('vigor')}>
              Vigor (NDVI)
            </TabButton>
            <button
              type="button"
              onClick={refresh}
              className="ml-auto text-xs text-gray-500 hover:text-primary"
              title="Re-fetch from Sentinel-2"
            >
              ↻ refresh
            </button>
          </div>

          {tab === 'latest' && (
            <LatestView fieldId={fieldId} bust={bust} />
          )}

          {tab === 'vigor' && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/fields/${fieldId}/ndvi?v=${bust}`}
                alt="Sentinel-2 NDVI of the field"
                className="w-full rounded-md border border-gray-100"
                loading="lazy"
              />
              <div className="mt-3 grid grid-cols-7 gap-1 text-[10px] text-center text-gray-600">
                <div className="rounded bg-[#8C8C8C] text-white py-1">water/bare</div>
                <div className="rounded bg-[#C73636] text-white py-1">very stressed</div>
                <div className="rounded bg-[#ED8C45] text-white py-1">stressed</div>
                <div className="rounded bg-[#F5C745] py-1">moderate</div>
                <div className="rounded bg-[#BCD94D] py-1">healthy</div>
                <div className="rounded bg-[#5BB566] text-white py-1">vigorous</div>
                <div className="rounded bg-[#1A7333] text-white py-1">very vigorous</div>
              </div>
              <p className="mt-2 text-xs text-gray-500 leading-relaxed">
                Vigor map computed from red + near-infrared bands. Mosaic of the
                least-cloudy capture in the last 90 days.
              </p>
            </>
          )}
        </>
      )}
    </section>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
        active
          ? 'bg-primary text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      {children}
    </button>
  )
}

// Pre-flight HEAD-style fetch so we can show a useful empty state if Sentinel
// returned a no-data 204 rather than rendering a blank img.
function LatestView({ fieldId, bust }: { fieldId: string; bust: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'empty' | 'error'>(
    'loading',
  )

  const url = `/api/fields/${fieldId}/satellite?v=${bust}`

  useEffect(() => {
    let cancelled = false
    setState('loading')
    fetch(url)
      .then((res) => {
        if (cancelled) return
        if (res.status === 204) setState('empty')
        else if (!res.ok) setState('error')
        else setState('ok')
      })
      .catch(() => !cancelled && setState('error'))
    return () => { cancelled = true }
  }, [url])

  if (state === 'loading') {
    return (
      <div className="aspect-[4/3] rounded-md border border-gray-100 bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-500">Loading latest satellite capture…</p>
      </div>
    )
  }

  if (state === 'empty') {
    return (
      <div className="aspect-[4/3] rounded-md border border-amber-200 bg-amber-50 flex flex-col items-center justify-center px-6 text-center">
        <p className="font-semibold text-amber-900">Cloudy stretch — no clear capture in 30 days</p>
        <p className="mt-2 text-sm text-amber-800 leading-relaxed max-w-md">
          Sentinel-2 hasn&apos;t had a cloud-free pass over this field recently. Check
          back after the next clear day. The Vigor (NDVI) tab uses a wider 90-day window
          and may still have data.
        </p>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="aspect-[4/3] rounded-md border border-red-100 bg-red-50 flex items-center justify-center px-6 text-center">
        <p className="text-sm text-red-700">
          Couldn&apos;t fetch the latest capture. Try the ↻ refresh button.
        </p>
      </div>
    )
  }

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Latest Sentinel-2 view of the field"
        className="w-full rounded-md border border-gray-100"
        loading="lazy"
      />
      <p className="mt-2 text-xs text-gray-500 leading-relaxed">
        Natural-color satellite photo from the least-cloudy Sentinel-2 capture in the
        last 30 days. <strong>Sentinel-2 is 10m/pixel</strong> — best for spotting field-wide
        changes (bare → growing → harvested) over time, not row-level detail. The basemap
        you draw on is Maxar at &lt;1m resolution but only refreshes every 1–3 years.
      </p>
    </>
  )
}
