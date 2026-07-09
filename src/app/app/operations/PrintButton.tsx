'use client'

// Page-level print action — prints the current view (active filters and time
// window apply). Lives in the page header so it reads as "print this page".
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print-hide btn-primary inline-flex items-center gap-2 text-sm shrink-0"
      title="Print this view — current filters and time window apply"
    >
      <svg
        className="w-4 h-4"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M5 2.75A1.75 1.75 0 016.75 1h6.5A1.75 1.75 0 0115 2.75V6h.25A2.75 2.75 0 0118 8.75v4.5c0 .966-.784 1.75-1.75 1.75H15v1.25A1.75 1.75 0 0113.25 18h-6.5A1.75 1.75 0 015 16.25V15H3.75A1.75 1.75 0 012 13.25v-4.5A2.75 2.75 0 014.75 6H5V2.75zm1.5 0V6h7V2.75a.25.25 0 00-.25-.25h-6.5a.25.25 0 00-.25.25zm0 9.75v3.75c0 .138.112.25.25.25h6.5a.25.25 0 00.25-.25V12.5h-7z"
          clipRule="evenodd"
        />
      </svg>
      Print
    </button>
  )
}
