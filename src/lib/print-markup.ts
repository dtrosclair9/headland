// Serializes a built PlantationSvg to standalone SVG markup — used to store
// point-in-time crop-map snapshots on operation events (PlatSheet renders the
// same structure via React; this is the string twin for storage).

import type { PlantationSvg } from './plantation-map-svg'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function plantationSvgMarkup(svg: PlantationSvg, isSpray: boolean): string {
  const polys = svg.blocks
    .map(
      (b) =>
        `<polygon points="${b.points}" fill="${b.color}" stroke="${isSpray ? '#000000' : '#1f2937'}" stroke-width="${isSpray ? 1.2 : 0.8}" stroke-linejoin="round"/>`,
    )
    .join('')
  const annotations = svg.annotations
    .map((a) => {
      if (a.kind === 'line') {
        return `<polyline points="${a.points}" fill="none" stroke="${isSpray ? '#000000' : a.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`
      }
      const rot = a.rotation ? ` transform="rotate(${a.rotation} ${a.x} ${a.y})"` : ''
      return `<text x="${a.x}" y="${a.y}" text-anchor="middle" font-size="${a.size ?? 13}" font-weight="700" fill="${isSpray ? '#000000' : a.color}" stroke="#FFFFFF" stroke-width="2.5" paint-order="stroke"${rot}>${esc(a.text ?? '')}</text>`
    })
    .join('')
  const labels = svg.blocks
    .map((b) => {
      const fill = b.labelDark ? '#111827' : '#FFFFFF'
      const halo = b.labelDark ? '' : ' stroke="#1f2937" paint-order="stroke"'
      return `<g fill="${fill}">${b.labels
        .map(
          (l) =>
            `<text x="${l.x}" y="${l.y}" text-anchor="${l.anchor}" dominant-baseline="central" font-size="${l.font}" font-weight="${l.bold ? 700 : 400}"${l.rotation ? ` transform="rotate(${l.rotation} ${l.x} ${l.y})"` : ''}${halo}${b.labelDark ? '' : ` stroke-width="${(l.font * 0.14).toFixed(2)}"`}>${esc(l.text)}</text>`,
        )
        .join('')}</g>`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svg.width} ${svg.height}" font-family="system-ui, sans-serif">${polys}${annotations}${labels}</svg>`
}
