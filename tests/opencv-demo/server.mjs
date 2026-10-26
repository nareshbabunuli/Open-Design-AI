import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export async function startDemoServer(port = 4173) {
  const html = await readFile(new URL('./target.html', import.meta.url))
  const server = http.createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname
    if (path !== '/' && path !== '/target.html') { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(html)
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
  const address = server.address()
  return { url: `http://127.0.0.1:${address.port}`, close: () => new Promise(resolve => server.close(resolve)) }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await startDemoServer(Number(process.env.PORT || 4173))
  console.log(`Demo target: ${server.url}\nTry ?variant=missing-button, shifted-card or low-contrast`)
}
