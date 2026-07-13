// Founder notifications — a new farm signing up should never go unnoticed
// (Thomas Farms sat for a week before anyone knew). Sent through Resend's
// HTTP API on the already-verified headlandmaps.com domain. Best-effort:
// a notification failure must never break the signup it's reporting.

const NOTIFY_TO = [
  'daynetrosclair@icloud.com',
  'info@strykora.com',
  'info@headlandmaps.com',
]

export async function notifySignup(info: {
  farmName: string
  email: string
  phone?: string | null
  state: string | null
  units: string
}): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) return // not configured (e.g. local dev) — silently skip
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Headland <notifications@headlandmaps.com>',
        to: NOTIFY_TO,
        subject: `🌱 New Headland signup: ${info.farmName}`,
        text:
          `${info.farmName} just confirmed their account.\n\n` +
          `Email: ${info.email}\n` +
          `Cell: ${info.phone ?? 'not given'}\n` +
          `State: ${info.state ?? 'not set'}\n` +
          `Units: ${info.units}\n\n` +
          `Reach out and make sure setup goes well — the first import is where farms stick or stall.`,
      }),
      signal: AbortSignal.timeout(6000),
    })
  } catch {
    /* never block a signup on a notification */
  }
}
