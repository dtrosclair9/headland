// Split an id list into URL-safe batches. Supabase/PostgREST puts every id
// from an .in(...) filter into the request URL; past ~430 ids that URL blows
// past PostgREST's 16KB header limit and the query 500s — it took Ritchie's
// whole map down at 681 blocks. Batch at 100 (~4KB URL) and merge results.
export function chunkIds<T>(ids: T[], size = 100): T[][] {
  const out: T[][] = []
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size))
  return out
}
