import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Organization, Role } from '@/lib/types'

export type CurrentOrg = Organization & { role: Role }

export async function getCurrentOrg(): Promise<CurrentOrg | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // First org the user is a member of (sorted by membership creation).
  // Future work: per-user "current_org_id" cookie for multi-org switching.
  const { data } = await supabase
    .from('memberships')
    .select('role, organizations(*)')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!data || !data.organizations) return null
  const org = data.organizations as unknown as Organization
  return { ...org, role: data.role as Role }
}

export async function requireUserAndOrg() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const org = await getCurrentOrg()
  if (!org) redirect('/login?error=no_org')

  return { user, org }
}
