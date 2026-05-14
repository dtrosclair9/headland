import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as EmailOtpType | null
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/app/map'

  const supabaseError =
    url.searchParams.get('error_description') ??
    url.searchParams.get('error_code') ??
    url.searchParams.get('error')
  if (supabaseError) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(supabaseError)}`, url.origin),
    )
  }

  const supabase = await createClient()

  if (tokenHash && type) {
    const { error: verifyError } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    })
    if (verifyError) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(verifyError.message)}`, url.origin),
      )
    }
  } else if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    if (exchangeError) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(exchangeError.message)}`, url.origin),
      )
    }
  } else {
    return NextResponse.redirect(new URL('/login?error=missing_token', url.origin))
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login?error=no_user', url.origin))
  }

  // Bootstrap an org for first-time users.
  const { data: existing } = await supabase
    .from('memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!existing) {
    const farmName =
      (user.user_metadata?.farm_name as string | undefined) ??
      `${user.email?.split('@')[0] ?? 'My'} Farm`
    const units =
      user.user_metadata?.units === 'arpents' ? 'arpents' : 'acres'
    const stateRaw = user.user_metadata?.state
    const state = stateRaw === 'LA' || stateRaw === 'FL' ? stateRaw : null

    const admin = createAdminClient()

    const { data: org, error: orgErr } = await admin
      .from('organizations')
      .insert({
        name: farmName,
        owner_id: user.id,
        units_default: units,
        state,
      })
      .select('id')
      .single()
    if (orgErr || !org) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(orgErr?.message ?? 'org_create_failed')}`, url.origin),
      )
    }

    const { error: memErr } = await admin.from('memberships').insert({
      org_id: org.id,
      user_id: user.id,
      role: 'owner',
      accepted_at: new Date().toISOString(),
    })
    if (memErr) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(memErr.message)}`, url.origin),
      )
    }
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
