import { createElement } from 'react'
import { NextResponse, type NextRequest } from 'next/server'
import { Document, Page, Text, renderToBuffer } from '@react-pdf/renderer'
import { requireUserAndOrg } from '@/lib/orgs'
import { getField } from '@/lib/fields'

export const runtime = 'nodejs'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { org } = await requireUserAndOrg()
  const { id } = await params

  const field = await getField(id)
  if (!field) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (field.org_id !== org.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // DIAGNOSTIC: minimal PDF using only react-pdf primitives + createElement.
  // If this works, the bug is in FieldPrintDocument. If it fails, the bug is
  // deeper (react-pdf vs Next 15 React 18.3.1 incompatibility).
  const buffer = await renderToBuffer(
    createElement(
      Document,
      null,
      createElement(
        Page,
        { size: 'LETTER' },
        createElement(Text, null, `${org.name} — ${field.name}`),
      ),
    ),
  )

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="test.pdf"`,
    },
  })
}
