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
