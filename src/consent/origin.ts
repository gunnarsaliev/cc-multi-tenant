const hostnameOf = (value: string): null | string => {
  try {
    return new URL(value.includes('://') ? value : `https://${value}`).hostname.toLowerCase()
  } catch {
    return null
  }
}

const isLocal = (hostname: string) =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost')

/**
 * Whether a browser on `origin` may record consent for a tenant whose site is `tenantDomain`.
 *
 * This keeps other websites from writing into a tenant's log. It is not authentication: anything
 * that isn't a browser can send whatever Origin it likes.
 */
export const isAllowedOrigin = (
  origin: null | string | undefined,
  tenantDomain: null | string | undefined,
): boolean => {
  const originHost = origin ? hostnameOf(origin) : null

  if (!originHost) {
    return false
  }

  if (process.env.NODE_ENV !== 'production' && isLocal(originHost)) {
    return true
  }

  const tenantHost = tenantDomain ? hostnameOf(tenantDomain) : null

  if (!tenantHost) {
    return false
  }

  const bare = (hostname: string) => hostname.replace(/^www\./, '')

  return bare(originHost) === bare(tenantHost)
}
