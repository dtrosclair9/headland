// PostgREST caps every response at 1000 rows (the db-max-rows setting) and
// .range() can't exceed it — so any unbounded list query silently truncates
// past 1000. A farm can have far more blocks/records than that (the 2000-block
// scale test exposed this). Page through with .range() until a short page so
// we always get EVERY row, at any farm size.
export async function paginateAll<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const PAGE = 1000
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await buildPage(from, from + PAGE - 1)
    if (error) throw error
    const batch = data ?? []
    out.push(...batch)
    if (batch.length < PAGE) break
  }
  return out
}

// Parallel variant for hot paths (the map's field list): sequential paging
// costs one round-trip per 1000 rows — ~16 in a row at 15k blocks, several
// seconds of pure latency. Here the first page also asks PostgREST for the
// exact count (withCount=true → pass { count: 'exact' } to .select), then the
// remaining pages fetch concurrently in small waves. Rows created between the
// count and the page reads are picked up on the next load, same as the
// sequential version.
export async function paginateAllParallel<T>(
  buildPage: (
    from: number,
    to: number,
    withCount: boolean,
  ) => PromiseLike<{ data: T[] | null; error: unknown; count?: number | null }>,
): Promise<T[]> {
  const PAGE = 1000
  const WAVE = 8 // concurrent requests per wave — plenty fast, gentle on the pooler
  const first = await buildPage(0, PAGE - 1, true)
  if (first.error) throw first.error
  const out: T[] = [...(first.data ?? [])]
  const total = first.count ?? out.length
  if (out.length < PAGE || total <= PAGE) return out
  const starts: number[] = []
  for (let from = PAGE; from < total; from += PAGE) starts.push(from)
  for (let i = 0; i < starts.length; i += WAVE) {
    const wave = await Promise.all(
      starts.slice(i, i + WAVE).map((from) => buildPage(from, from + PAGE - 1, false)),
    )
    for (const r of wave) {
      if (r.error) throw r.error
      out.push(...(r.data ?? []))
    }
  }
  return out
}
