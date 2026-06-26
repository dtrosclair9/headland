import { NextResponse } from 'next/server'
import { requireUserAndOrg } from '@/lib/orgs'
import { getBillableAcres } from '@/lib/acreage'
import { generateFarmSnapshot } from '@/lib/snapshots'

export const runtime = 'nodejs'

export async function POST() {
  const { org } = await requireUserAndOrg()
  if ((await getBillableAcres(org.id)) < 1) {
    return NextResponse.json({ error: 'Map at least one block before creating a snapshot.' }, { status: 422 })
  }
  const res = await generateFarmSnapshot(org.id, 'manual')
  return NextResponse.json(res)
}
