# Automation network boundaries

Production browser launches use a per-browser HTTP/CONNECT proxy. Each connection resolves an A record, rejects private/reserved addresses, and connects to the validated IP without a second DNS lookup. Redirects, frames, workers, and subresources use the same proxy. Chromium's loopback bypass, QUIC and non-proxied WebRTC UDP are disabled. Proxy sockets close when the browser disconnects or launch fails.

Only public IPv4 destinations on ports 80 and 443 are supported. IPv6-only sites, private-network tests, and other ports are blocked outside `NODE_ENV=development`. Keep browser workers in a network-isolated environment as defense in depth; the proxy is not a substitute for Chromium security updates or OS isolation.

Laya URLs must exactly match the operator-configured `LAYA_BASE_URL` (default `http://127.0.0.1:8000`). Laya requests do not follow redirects; its health API requires a signed-in user.

Server AI keys are bound to exact HTTPS provider origins. `AI_API_KEY` is treated as the default Nebius key; configure `UNOROUTER_API_KEY` separately for UnoRouter. Custom gateways require a user-supplied key. AI gateway HTTP requests reject redirects. Provider names embedded in a path or hostname suffix do not qualify for server credentials.

The designs bucket's existing public-read policy is unchanged. Converting existing public URLs to private signed URLs requires a separate data-sharing migration, including updating existing database references and clients.
