import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUserAndOrg } from '@/lib/orgs'
import { createClient } from '@/lib/supabase/server'
import { getOrgColors } from '@/lib/org-colors'
import ColorSettings from './ColorSettings'

export const metadata: Metadata = { title: 'Map colors' }

export default async function ColorsPage() {
  const { org } = await requireUserAndOrg()
  const supabase = await createClient()
  // Varieties actually on the farm — those are the ones worth coloring.
  const { data } = await supabase
    .from('fields')
    .select('variety')
    .eq('org_id', org.id)
    .is('archived_at', null)
    .not('variety', 'is', null)
  const varieties = Array.from(
    new Set((data ?? []).map((r) => (r.variety as string).trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  const overrides = await getOrgColors(org.id)

  return (
    <div className="container-wide py-8 max-w-2xl">
      <div className="mb-6">
        <Link href="/app/settings" className="text-sm text-primary hover:underline">
          ← Settings
        </Link>
        <h1 className="text-2xl font-bold text-primary mt-2">Map colors</h1>
        <p className="text-sm text-gray-600 mt-1">
          Match Headland to the colors your operation already uses. These apply everywhere —
          the live map, the crop map, and every printed sheet.
        </p>
      </div>
      <ColorSettings varieties={varieties} initialOverrides={overrides} />
    </div>
  )
}
