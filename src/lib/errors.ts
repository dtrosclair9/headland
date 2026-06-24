// Turn a caught error into a short, farmer-facing message for the UI.
//
// Always logs the raw error to the console for debugging, then:
//   • names connection problems (by far the most common cause),
//   • passes through short, human-readable messages we wrote on purpose
//     (e.g. "No field boundaries were found in that file."),
//   • and hides anything technical — stack traces, fetch URLs, Postgres /
//     Supabase text, internal codes — behind the given fallback.
//
// The goal: a grower never sees a token, a URL, "Failed to fetch", or a
// row-level-security message.
export function friendlyError(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  console.error('[headland]', e)
  const raw = (e instanceof Error ? e.message : String(e)) || ''
  const low = raw.toLowerCase()

  if (
    /failed to fetch|networkerror|network request failed|load failed|timeout|timed out|connection|offline|net::|err_internet|err_network/.test(
      low,
    )
  ) {
    return 'Connection problem. Check your internet and try again.'
  }

  // Markers of a raw system/technical error — never show these.
  const technical =
    /[{}<>;]|https?:|error:|exception|undefined|null|stack|pgrst|sqlstate|\bjwt\b|violat|constraint|policy|permission|duplicate key|relation|column|function|syntax|supabase|fetch|500|503|econn/i

  const looksHuman =
    raw.length > 0 && raw.length <= 120 && /\s/.test(raw) && /[a-zA-Z]/.test(raw) && !technical.test(raw)

  return looksHuman ? raw : fallback
}
