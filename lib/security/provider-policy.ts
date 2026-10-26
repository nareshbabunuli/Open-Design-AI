/** Server secrets may only be used with their exact provider origin. */
export function isLocalGateway(raw: string): boolean {
  try {
    const u = new URL(raw)
    return process.env.NODE_ENV === 'development' &&
      ['http:', 'https:'].includes(u.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
  } catch { return false }
}

export function providerOrigin(raw: string): string {
  const u = new URL(raw)
  if (u.username || u.password || u.search || u.hash) throw new Error('Invalid AI gateway URL')
  if (u.protocol !== 'https:' && !isLocalGateway(raw)) throw new Error('AI gateways require HTTPS')
  return u.origin
}

export function assertProviderKey(raw: string, key?: string): void {
  const origin = providerOrigin(raw)
  const bindings: [string | undefined, string][] = [
    [process.env.OPENROUTER_API_KEY, 'https://openrouter.ai'],
    [process.env.UNOROUTER_API_KEY, 'https://api.unorouter.com'],
    [process.env.NEBIUS_API_KEY, 'https://api.tokenfactory.nebius.com'],
    [process.env.NEBIUS_TOKEN_FACTORY_KEY, 'https://api.tokenfactory.nebius.com'],
    [process.env.AI_API_KEY, 'https://api.tokenfactory.nebius.com'],
  ]
  if (key && bindings.some(([secret, allowed]) => secret?.trim() === key.trim() && origin !== allowed)) {
    throw new Error('Server AI credentials cannot be used with this gateway')
  }
}

export function configuredLayaBase(raw?: string): string {
  const configured = new URL(process.env.LAYA_BASE_URL || 'http://127.0.0.1:8000')
  const requested = new URL(raw || configured.href)
  const normalize = (u: URL) => u.href.replace(/\/$/, '')
  if (!['http:', 'https:'].includes(configured.protocol) || configured.username || configured.password ||
      normalize(requested) !== normalize(configured)) throw new Error('Laya URL must match server configuration')
  return normalize(configured)
}
