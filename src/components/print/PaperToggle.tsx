'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { PAPER_DIMS, type PaperSize } from '@/lib/plantation-map-svg'

// Paper-size switch in the print banner. Bigger paper = same physical text
// size with more room per block, so more blocks fit their full labels.
// Options come from PAPER_DIMS — adding a size there adds a pill here.
export default function PaperToggle({ active }: { active: PaperSize }) {
  const router = useRouter()
  const params = useSearchParams()

  function set(paper: PaperSize) {
    const sp = new URLSearchParams(params.toString())
    sp.set('paper', paper)
    router.replace(`?${sp.toString()}`)
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 14 }}>
      <span style={{ fontSize: 12, opacity: 0.8 }}>Paper:</span>
      {(Object.keys(PAPER_DIMS) as PaperSize[]).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => set(p)}
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: '3px 10px',
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.5)',
            background: active === p ? 'white' : 'transparent',
            color: active === p ? '#1A3D2E' : 'white',
            cursor: 'pointer',
          }}
        >
          {active === p ? '✓ ' : ''}
          {PAPER_DIMS[p].label}
        </button>
      ))}
    </span>
  )
}
