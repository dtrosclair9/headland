// The bytes decide what a file is — never the browser's claimed MIME type or
// the filename, both of which an attacker fully controls. Sniffing the magic
// numbers server-side is what stops an HTML/executable "photo.jpg" from
// landing on the public bucket with a content type that makes it dangerous.
const IMAGE_SIGNATURES: { ext: string; mime: string; test: (b: Buffer) => boolean }[] = [
  { ext: 'jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    ext: 'png',
    mime: 'image/png',
    test: (b) =>
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    ext: 'webp',
    mime: 'image/webp',
    test: (b) =>
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  {
    ext: 'heic',
    mime: 'image/heic',
    test: (b) =>
      b.subarray(4, 8).toString('ascii') === 'ftyp' &&
      ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(
        b.subarray(8, 12).toString('ascii'),
      ),
  },
]

export function sniffImage(buf: Buffer): { ext: string; mime: string } | null {
  if (buf.length < 12) return null
  for (const sig of IMAGE_SIGNATURES) if (sig.test(buf)) return { ext: sig.ext, mime: sig.mime }
  return null
}
