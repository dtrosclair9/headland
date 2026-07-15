import { NextResponse } from 'next/server'
import { requireUserAndOrg } from '@/lib/orgs'
import { getBillableAcres } from '@/lib/acreage'
import { generateFarmSnapshot } from '@/lib/snapshots'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

export async function POST() {
  const { org } = await requireUserAndOrg()
  // Heavy endpoint: full-farm export build + zip + Storage write per call,
  // and each manual run stores a new object. Same weight class as imports.
  if (!(await rateLimit(`snapshot:${org.id}`, 5, 60))) {
    return NextResponse.json({ error: 'Too many snapshots — wait a minute and try again.' }, { status: 429 })
  }
  if ((await getBillableAcres(org.id)) < 1) {
    return NextResponse.json({ error: 'Map at least one block before creating a snapshot.' }, { status: 422 })
  }
  const res = await generateFarmSnapshot(org.id, 'manual')
  return NextResponse.json(res)
}
