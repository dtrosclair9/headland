// Safari/WebKit bug: after a print dialog is closed, later window.print()
// calls on the SAME page render blank (webkit.org/b/63408). The reliable fix
// is a fresh document per print — so we track whether this page-load has
// already shown a print dialog, and re-prints go through a reload.

const FLAG = 'headland-print-on-load'

export function markPrinted() {
  ;(window as Window & { __headlandPrinted?: boolean }).__headlandPrinted = true
}

export function hasPrinted(): boolean {
  return !!(window as Window & { __headlandPrinted?: boolean }).__headlandPrinted
}

/** ask the NEXT page load to open the print dialog */
export function requestPrintOnLoad() {
  try {
    sessionStorage.setItem(FLAG, '1')
  } catch {
    /* private mode — reload alone still fixes the blank-page state */
  }
}

/** consume the flag set by requestPrintOnLoad */
export function shouldPrintOnLoad(): boolean {
  try {
    const v = sessionStorage.getItem(FLAG) === '1'
    sessionStorage.removeItem(FLAG)
    return v
  } catch {
    return false
  }
}
