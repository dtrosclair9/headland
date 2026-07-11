// One printed page per plantation: group blocks by their plantation, named
// plantations alpha, Unassigned last. Every multi-plantation print (layer
// highlights, selected blocks, fly plans) splits along these groups.
export function groupByPlantation<T extends { plantation_id: string | null; plantation_name: string | null }>(
  blocks: T[],
): { id: string | null; name: string; blocks: T[] }[] {
  const map = new Map<string | null, T[]>()
  for (const b of blocks) {
    const key = b.plantation_id ?? null
    const arr = map.get(key) ?? []
    arr.push(b)
    map.set(key, arr)
  }
  return Array.from(map.entries())
    .map(([id, group]) => ({
      id,
      name: group[0]?.plantation_name ?? 'Unassigned',
      blocks: group,
    }))
    .sort((a, b) =>
      a.id === null ? 1 : b.id === null ? -1 : a.name.localeCompare(b.name),
    )
}
