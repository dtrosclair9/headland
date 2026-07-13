'use server'

import { z } from 'zod'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BASE_URL } from '@/lib/site'

// Min length kept in sync with the form's minLength and the Supabase setting.
const PASSWORD = z.string().min(8, 'Password must be at least 8 characters.')

const SignUpSchema = z.object({
  email: z.string().email(),
  password: PASSWORD,
  farm_name: z.string().min(2).max(100),
  state: z.enum(['LA', 'FL']),
  units: z.enum(['acres', 'arpents']).default('acres'),
  /** required cell — a farm you can't call is a farm you can't onboard */
  phone: z
    .string()
    .trim()
    .min(7, 'Enter a phone number so we can help you get set up.')
    .max(20),
})

const SignInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Enter your password.'),
})

const EmailOnlySchema = z.object({ email: z.string().email() })

export async function signUp(formData: FormData) {
  const parsed = SignUpSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    farm_name: formData.get('farm_name'),
    state: formData.get('state'),
    units: formData.get('units') ?? 'acres',
    phone: formData.get('phone'),
  })
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Please fill in farm name, state, email, and a password.'
    redirect('/signup?error=' + encodeURIComponent(msg))
  }

  const supabase = await createClient()
  // Email confirmation is ON, so this sends one confirmation email and returns
  // no session. The org is bootstrapped in /auth/callback when they confirm.
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        farm_name: parsed.data.farm_name,
        state: parsed.data.state,
        units: parsed.data.units,
        phone: parsed.data.phone,
      },
      emailRedirectTo: `${BASE_URL}/auth/callback?next=/app/map`,
    },
  })
  if (error) redirect('/signup?error=' + encodeURIComponent(error.message))
  redirect('/check-email?email=' + encodeURIComponent(parsed.data.email))
}

export async function signIn(formData: FormData) {
  const parsed = SignInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Enter your email and password.'
    redirect('/login?error=' + encodeURIComponent(msg))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })
  if (error) {
    redirect('/login?error=' + encodeURIComponent(error.message))
  }
  redirect('/app/map')
}

// Fallback / recovery: email a one-time login link instead of a password.
// Also how existing magic-link users get in to set a password the first time.
export async function signInWithLink(formData: FormData) {
  const parsed = EmailOnlySchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) {
    redirect('/login?error=' + encodeURIComponent('Enter your email to get a login link.'))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${BASE_URL}/auth/callback?next=/app/map`,
    },
  })
  if (error) redirect('/login?error=' + encodeURIComponent(error.message))
  redirect('/check-email?email=' + encodeURIComponent(parsed.data.email))
}

const NewPasswordSchema = z
  .object({ password: PASSWORD, confirm: z.string() })
  .refine((d) => d.password === d.confirm, {
    message: 'Passwords do not match.',
    path: ['confirm'],
  })

// Step 1 of forgot-password: email a recovery link. The link lands on
// /auth/callback (which verifies it and opens a session) and then forwards to
// /reset-password. We always show the same confirmation regardless of whether
// the email exists, to avoid leaking which addresses have accounts.
export async function requestPasswordReset(formData: FormData) {
  const parsed = EmailOnlySchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) {
    redirect('/forgot-password?error=' + encodeURIComponent('Enter a valid email address.'))
  }

  const supabase = await createClient()
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${BASE_URL}/auth/callback?next=/reset-password`,
  })
  redirect('/check-email?mode=reset&email=' + encodeURIComponent(parsed.data.email))
}

// Step 2 of forgot-password: the recovery link already opened a session via
// /auth/callback, so we just set the new password on the signed-in user.
export async function setNewPassword(formData: FormData) {
  const parsed = NewPasswordSchema.safeParse({
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  })
  if (!parsed.success) {
    redirect(
      '/reset-password?error=' +
        encodeURIComponent(parsed.error.issues[0]?.message ?? 'Invalid password.'),
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect(
      '/forgot-password?error=' +
        encodeURIComponent('That reset link has expired. Request a new one.'),
    )
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    redirect('/reset-password?error=' + encodeURIComponent(error.message))
  }
  redirect('/app/map')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/')
}
