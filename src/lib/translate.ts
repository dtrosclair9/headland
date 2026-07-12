// Best-effort English → Spanish translation for record printouts (field
// crews are largely Spanish-speaking). MyMemory: free, no key, fine for
// short field notes. Never blocks logging — returns null on any failure.
export async function translateToSpanish(text: string): Promise<string | null> {
  const clean = text.trim()
  if (!clean) return null
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean.slice(0, 500))}&langpair=en|es`
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const data = await res.json()
    const out = data?.responseData?.translatedText
    if (typeof out !== 'string' || !out.trim()) return null
    // MyMemory sometimes echoes errors in the text body
    if (/MYMEMORY WARNING|INVALID/i.test(out)) return null
    return out.trim()
  } catch {
    return null
  }
}
