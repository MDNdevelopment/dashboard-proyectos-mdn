/**
 * Parses a URL (or hash/search string) from a Supabase password-recovery link.
 *
 * Supabase embeds recovery params in the URL fragment:
 *   #access_token=...&type=recovery&...
 * Errors (e.g. expired link) appear as query params or in the hash:
 *   ?error=access_denied&error_code=otp_expired
 *
 * @param {string} url - Full URL (window.location.href) or hash/query string.
 * @returns {{ hasToken: boolean, hasAccessToken: boolean, type: string|null, error: string|null, errorCode: string|null }}
 */
export function parseRecoveryParams(url) {
  let hashParams = new URLSearchParams()
  let queryParams = new URLSearchParams()

  try {
    const parsed = new URL(url)
    hashParams = new URLSearchParams(parsed.hash.replace('#', ''))
    queryParams = parsed.searchParams
  } catch {
    // Fallback: bare fragment or query string passed directly
    const str = url.startsWith('#') || url.startsWith('?') ? url.slice(1) : url
    hashParams = new URLSearchParams(str)
  }

  const error = hashParams.get('error') || queryParams.get('error') || null
  const errorCode = hashParams.get('error_code') || queryParams.get('error_code') || null
  const type = hashParams.get('type') || queryParams.get('type') || null
  const accessToken = hashParams.get('access_token') || queryParams.get('access_token') || null

  const hasToken = type === 'recovery' && Boolean(accessToken)

  return { hasToken, hasAccessToken: Boolean(accessToken), type, error, errorCode }
}
