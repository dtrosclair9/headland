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
  const callouts = svg.callouts
    .map((c) => {
      const bold = c.bold ? `<tspan font-weight="700">${esc(c.bold)} </tspan>` : ''
      return (
        `<line x1="${c.x1}" y1="${c.y1}" x2="${c.x2}" y2="${c.y2}" stroke="#374151" stroke-width="0.9"/>` +
        `<circle cx="${c.x1}" cy="${c.y1}" r="1.5" fill="#374151"/>` +
        `<rect x="${c.box.x}" y="${c.box.y}" width="${c.box.w}" height="${c.box.h}" rx="2" fill="#FFFFFF" stroke="#6B7280" stroke-width="0.5"/>` +
        `<text x="${c.box.x + c.box.w / 2}" y="${c.box.y + c.box.h / 2}" text-anchor="middle" dominant-baseline="central" font-size="${c.font}" fill="#111827">${bold}${esc(c.text)}</text>`
      )
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svg.width} ${svg.height}" font-family="system-ui, sans-serif">${polys}${annotations}${labels}${callouts}</svg>`
}
