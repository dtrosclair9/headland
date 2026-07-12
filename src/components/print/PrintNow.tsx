'use client'

// Manual print trigger for record/reference views that don't auto-print.
export default function PrintNow() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      style={{
        fontSize: 12,
        fontWeight: 700,
        padding: '3px 12px',
        borderRadius: 999,
        border: 0,
        background: 'white',
        color: '#1A3D2E',
        cursor: 'pointer',
        marginLeft: 14,
      }}
    >
      Print / Save PDF
    </button>
  )
}
