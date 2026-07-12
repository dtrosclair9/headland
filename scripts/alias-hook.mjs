// ESM resolve hook so node scripts can import app TypeScript directly (Node
// strips types natively): maps the `@/` alias to src/, and retries
// extensionless imports with .ts/.tsx (tsconfig-style resolution). Async
// because nextResolve returns a promise — sync try/catch misses rejections.
export async function resolve(specifier, context, nextResolve) {
  const attempt = async (spec) => {
    for (const ext of ['', '.ts', '.tsx', '/index.ts']) {
      try {
        return await nextResolve(spec + ext, context)
      } catch {
        /* try next extension */
      }
    }
    return null
  }
  if (specifier.startsWith('@/')) {
    const url = new URL(`../src/${specifier.slice(2)}`, import.meta.url)
    const hit = await attempt(url.href)
    if (hit) return hit
  }
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const hit = await attempt(specifier)
    if (hit) return hit
  }
  return nextResolve(specifier, context)
}
