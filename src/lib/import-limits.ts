// Hard ceilings on uploaded farm files. next.config's bodySizeLimit only
// covers server ACTIONS, not route handlers, so imports otherwise rely on the
// raw platform limit — a decompression-heavy zip is a memory-DoS vector. A
// real cane farm is a few hundred blocks in a few MB; these caps sit far above
// that and well below "fills the function's memory."
export const MAX_IMPORT_BYTES = 40 * 1024 * 1024 // 40 MB across all files
export const MAX_IMPORT_FEATURES = 5000 // blocks per import

export function totalBytes(files: { data: Buffer }[]): number {
  return files.reduce((n, f) => n + f.data.length, 0)
}
