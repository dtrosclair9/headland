import { NextResponse } from 'next/server'
// @ts-expect-error - jszip 2.x ships no types
import JSZip from 'jszip'
import { requireUserAndOrg } from '@/lib/orgs'
import { listFields } from '@/lib/fields'
import { listPlantations } from '@/lib/plantations'
import { buildFieldsShapefileSet } from '@/lib/farm-export'

export async function GET() {
  const { org } = await requireUserAndOrg()
  const [fields, plantations] = await Promise.all([listFields(org.id), listPlantations(org.id)])
  const { shp, shx, dbf, prj, cpg } = buildFieldsShapefileSet(fields, plantations, org)

  const zip = new JSZip()
  zip.file('fields/fields.shp', shp)
  zip.file('fields/fields.shx', shx)
  zip.file('fields/fields.dbf', dbf)
  zip.file('fields/fields.prj', prj)
  zip.file('fields/fields.cpg', cpg)
  const buffer = zip.generate({ type: 'nodebuffer', compression: 'STORE' }) as Buffer

  const safeOrg = org.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeOrg}-fields-shapefile.zip"`,
    },
  })
}
