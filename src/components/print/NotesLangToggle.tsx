'use client'

import { useRouter, useSearchParams } from 'next/navigation'

// English | Español switch for the record document's notes line — most field
// crews are Spanish-speaking; the printout should read in their language.
export default function NotesLangToggle({ active }: { active: 'en' | 'es' }) {
  const router = useRouter()
  const params = useSearchParams()

  function set(lang: 'en' | 'es') {
    const sp = new URLSearchParams(params.toString())
    sp.set('lang', lang)
    router.replace(`?${sp.toString()}`)
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 14 }}>
      <span style={{ fontSize: 12, opacity: 0.8 }}>Notes:</span>
      {(
        [
          ['en', 'English'],
          ['es', 'Español'],
        ] as const
      ).map(([k, label]) => (
        <button
          key={k}
          type="button"
          onClick={() => set(k)}
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: '3px 10px',
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.5)',
            background: active === k ? 'white' : 'transparent',
            color: active === k ? '#1A3D2E' : 'white',
            cursor: 'pointer',
          }}
        >
          {active === k ? '✓ ' : ''}
          {label}
        </button>
      ))}
    </span>
  )
}
