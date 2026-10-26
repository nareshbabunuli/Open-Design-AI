import http from 'node:http'
import net from 'node:net'
import { lookup } from 'node:dns/promises'

const blocked = new net.BlockList()
for (const [ip, bits] of [ ['0.0.0.0',8], ['10.0.0.0',8], ['100.64.0.0',10],
  ['127.0.0.0',8], ['169.254.0.0',16], ['172.16.0.0',12], ['192.168.0.0',16],
  ['192.0.0.0',24], ['192.0.2.0',24], ['198.18.0.0',15], ['198.51.100.0',24],
  ['203.0.113.0',24], ['224.0.0.0',4], ['240.0.0.0',4] ] as const) blocked.addSubnet(ip, bits, 'ipv4')

export function isPublicAddress(address: string): boolean {
  // Fail closed for IPv6, including IPv4-mapped and transition addresses.
  // Public dual-stack sites use their validated A record.
  return net.isIP(address) === 4 && !blocked.check(address, 'ipv4')
}

export async function publicDestination(host: string, port: number): Promise<string> {
  if (![80, 443].includes(port)) throw new Error('Only web ports are allowed')
  const addresses = await lookup(host, { all: true, family: 4 })
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error('Private or reserved destination blocked')
  }
  // Connect to this IP, never resolve the hostname again (DNS rebinding).
  return addresses[0].address
}

/** A per-browser proxy checks every connection, including redirects and subresources. */
export async function createBrowserEgressProxy() {
  const sockets = new Set<net.Socket>()
  const track = (socket: net.Socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.setTimeout(30000, () => socket.destroy())
    return socket
  }
  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url || '')
      if (url.protocol !== 'http:' || url.username || url.password) throw new Error('Invalid proxy URL')
      const port = Number(url.port || 80)
      const address = await publicDestination(url.hostname, port)
      const headers: http.IncomingHttpHeaders = { ...req.headers, host: url.host }
      delete headers['proxy-authorization']
      delete headers['proxy-connection']
      const upstream = http.request({ hostname: address, port, path: url.pathname + url.search,
        method: req.method, headers, agent: false }, response => {
        res.writeHead(response.statusCode || 502, response.headers)
        response.pipe(res)
      })
      upstream.on('socket', track)
      upstream.on('error', () => res.destroy())
      req.on('aborted', () => upstream.destroy())
      res.on('close', () => upstream.destroy())
      req.pipe(upstream)
    })().catch(() => { if (!res.headersSent) res.writeHead(403); res.end() })
  })
  server.on('connection', track)
  server.on('connect', (req, client, head) => {
    void (async () => {
      const url = new URL(`https://${req.url}`)
      if (url.username || url.password || url.pathname !== '/') throw new Error('Invalid tunnel')
      const port = Number(url.port || 443)
      const address = await publicDestination(url.hostname, port)
      if (client.destroyed) return
      const upstream = track(net.connect(port, address))
      upstream.on('error', () => client.destroy())
      client.on('error', () => upstream.destroy())
      client.on('close', () => upstream.destroy())
      upstream.on('connect', () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        if (head.length) upstream.write(head)
        upstream.pipe(client)
        client.pipe(upstream)
      })
    })().catch(() => client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'))
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address() as net.AddressInfo
  return {
    url: `http://127.0.0.1:${address.port}`,
    close() { for (const socket of sockets) socket.destroy(); server.close() },
  }
}
