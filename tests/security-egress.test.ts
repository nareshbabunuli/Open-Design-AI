import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import { createBrowserEgressProxy, isPublicAddress, publicDestination } from '../lib/security/browser-egress'
import { assertProviderKey, configuredLayaBase, isLocalGateway } from '../lib/security/provider-policy'

test('private, metadata, mapped IPv6 and reserved addresses fail closed', async () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '100.64.0.1', '192.168.1.1', '172.16.0.1', '::1', '::ffff:127.0.0.1', 'fd00::1', '224.0.0.1']) {
    assert.equal(isPublicAddress(address), false, address)
  }
  assert.equal(isPublicAddress('8.8.8.8'), true)
  await assert.rejects(publicDestination('127.0.0.1', 80))
  await assert.rejects(publicDestination('8.8.8.8', 22))
})

test('proxy blocks HTTP and CONNECT to loopback without contacting the service', async () => {
  let hits = 0
  const target = http.createServer((_req, res) => { hits++; res.end('secret') })
  await new Promise<void>(resolve => target.listen(0, '127.0.0.1', resolve))
  const proxy = await createBrowserEgressProxy()
  try {
    const url = new URL(proxy.url)
    const status = await new Promise(resolve => {
      http.get({ hostname: url.hostname, port: url.port, path: 'http://127.0.0.1/' }, res => { res.resume(); resolve(res.statusCode) })
    })
    assert.equal(status, 403)
    const reply = await new Promise<string>((resolve, reject) => {
      const socket = net.connect(Number(url.port), url.hostname, () => socket.write('CONNECT 127.0.0.1:443 HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n'))
      socket.once('data', data => { resolve(data.toString()); socket.destroy() })
      socket.once('error', reject)
    })
    assert.match(reply, /403 Forbidden/)
    assert.equal(hits, 0)
  } finally { proxy.close(); target.close() }
})

test('provider credentials require exact HTTPS origins', () => {
  const old = process.env.OPENROUTER_API_KEY
  process.env.OPENROUTER_API_KEY = 'server-test-secret'
  try {
    assert.doesNotThrow(() => assertProviderKey('https://openrouter.ai/api/v1', 'server-test-secret'))
    for (const base of ['https://openrouter.ai.evil.example/v1', 'https://evil.example/openrouter.ai', 'http://openrouter.ai/v1', 'https://openrouter.ai:444/v1']) {
      assert.throws(() => assertProviderKey(base, 'server-test-secret'))
    }
    assert.doesNotThrow(() => assertProviderKey('https://custom.example/v1', 'user-key'))
    assert.equal(isLocalGateway('https://evil.example/localhost'), false)
  } finally {
    if (old === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = old
  }
})

test('Laya accepts only the configured endpoint', () => {
  const old = process.env.LAYA_BASE_URL
  process.env.LAYA_BASE_URL = 'http://127.0.0.1:8000'
  try {
    assert.equal(configuredLayaBase(), 'http://127.0.0.1:8000')
    assert.throws(() => configuredLayaBase('http://169.254.169.254'))
    assert.throws(() => configuredLayaBase('http://127.0.0.1:8000/other'))
  } finally {
    if (old === undefined) delete process.env.LAYA_BASE_URL
    else process.env.LAYA_BASE_URL = old
  }
})

test('gateway resolver never falls back to a server key for custom hosts', async () => {
  const { resolveAiApiKey } = await import('../lib/ai-automation/ai-gateway')
  const old = process.env.NEBIUS_API_KEY
  process.env.NEBIUS_API_KEY = 'nebius-test-key'
  try {
    assert.equal(resolveAiApiKey('https://api.tokenfactory.nebius.com/v1'), 'nebius-test-key')
    assert.equal(resolveAiApiKey('https://api.tokenfactory.nebius.com.evil.example/v1'), undefined)
    assert.equal(resolveAiApiKey('https://evil.example/tokenfactory.nebius.com'), undefined)
  } finally {
    if (old === undefined) delete process.env.NEBIUS_API_KEY
    else process.env.NEBIUS_API_KEY = old
  }
})

test('both gateway implementations reject misdirected server keys before fetch', async () => {
  const gateways = await Promise.all([import('../lib/ai-automation/ai-gateway'), import('../lib/ai-automation/openrouter')])
  const oldKey = process.env.OPENROUTER_API_KEY
  const oldFetch = globalThis.fetch
  let calls = 0
  process.env.OPENROUTER_API_KEY = 'test-server-key'
  globalThis.fetch = async () => { calls++; return new Response('{}') }
  try {
    for (const gateway of gateways) {
      await assert.rejects(gateway.postChatCompletionSafe('https://evil.example/v1', 'test-server-key', {}, 'test'))
    }
    assert.equal(calls, 0)
  } finally {
    globalThis.fetch = oldFetch
    if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = oldKey
  }
})
