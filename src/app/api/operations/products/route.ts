import { NextResponse } from 'next/server'
import { requireUserAndOrg } from '@/lib/orgs'
import { createClient } from '@/lib/supabase/server'

// Product-name history for the log-spray / bulk-log forms: distinct products
// this farm has used, most recent first — so nobody types "Atrazine 4L" twice
// (same idea as the variety suggestions).
export async function GET() {
  const { org } = await requireUserAndOrg()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('applications')
    .select('product, applied_at, fields!inner(org_id)')
    .eq('fields.org_id', org.id)
    .not('product', 'is', null)
    .order('applied_at', { ascending: false })
    .limit(300)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const seen = new Set<string>()
  const products: string[] = []
  for (const row of data ?? []) {
    const p = (row.product as string).trim()
    const key = p.toLowerCase()
    if (p && !seen.has(key)) {
      seen.add(key)
      products.push(p)
      if (products.length >= 15) break
    }
  }
  return NextResponse.json({ products })
}
