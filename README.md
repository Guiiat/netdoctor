# NetDoctor

**Know exactly where a network request breaks.** NetDoctor is a dependency-free-at-runtime,
cross-platform CLI that checks DNS, TCP, TLS, HTTP, redirects, and proxy environment settings
in one concurrent diagnostic run.

[简体中文](./README.zh-CN.md) · [Contributing](./CONTRIBUTING.md) · [Security](./SECURITY.md)

> Project status: early but usable (`0.1.0`). Reports have a versioned JSON schema, and the CLI
> treats network failures as results instead of crashes.

## Why NetDoctor?

“GitHub is down” can mean a broken DNS resolver, a blocked port, an expired certificate, a proxy
that only one package manager understands, or an HTTP authentication response. NetDoctor tests
those layers separately, at the same time, and returns a compact explanation with a next action.

- Concurrent OS DNS, A/AAAA DNS, TCP, TLS, HTTP, and proxy endpoint checks
- TLS trust, hostname validation, negotiated protocol/cipher, and certificate expiry
- HTTP status and redirect-chain inspection (up to a configurable limit)
- Built-in `github`, `npm`, `pypi`, and `docker` presets
- Custom `http(s)://` URLs and `host[:port]` targets, including IPv6
- Human-friendly color output, stable JSON, and shareable Markdown
- Credential-aware output: URL userinfo, proxy passwords, sensitive query parameters,
  Authorization/Cookie values, and home-directory paths are scrubbed
- Useful automation semantics and a strict mode
- No runtime dependencies; Node.js standard library only

## Quick start

Node.js 22 or newer is required.

```bash
# From a cloned repository
npm install
npm run build
npm link

netdoctor github
```

Once published to npm, it can also be run with `npx netdoctor-cli github` or installed globally.

## Usage

```text
netdoctor [preset | URL | host[:port] ...] [options]
```

```bash
# Diagnose GitHub and npm
netdoctor github npm

# Diagnose every built-in preset (also the default when no target is supplied)
netdoctor all

# Inspect a custom API, preserving a machine-readable report
netdoctor --url https://api.example.com/health --json > diagnosis.json

# Check DNS/TCP/TLS for an MQTT TLS endpoint
netdoctor --host broker.example.com:8883 --timeout 8000

# Produce a report suitable for a GitHub issue
netdoctor pypi --markdown > netdoctor-report.md

# Make warnings fail CI as well
netdoctor npm --strict --json
```

Important options:

| Option | Meaning |
| --- | --- |
| `-p, --preset <name>` | Add a preset; repeat it or use comma-separated names |
| `-u, --url <url>` | Add an HTTP(S) URL |
| `-H, --host <host[:port]>` | Add a host; the default port is 443 |
| `-t, --timeout <ms>` | Per-check timeout from 250 to 60,000 ms (default 5,000) |
| `--max-redirects <n>` | Follow 0–20 redirects (default 5) |
| `--json` | Write exactly one JSON document to stdout |
| `--markdown`, `--md` | Write a shareable Markdown report to stdout |
| `--strict` | Treat warnings as an exit-code failure |
| `--no-color` | Disable ANSI color |
| `--list-presets` | List built-in presets |

Run `netdoctor --help` for the complete help text.

## What gets checked?

Each target runs its applicable checks concurrently:

1. **DNS** — `dns.lookup({ all: true })` follows the operating system path, including hosts files,
   VPNs, and split DNS. Separate A and AAAA queries expose differences between OS and DNS answers.
2. **TCP** — opens the destination port and records connection latency and the remote address.
3. **TLS** — checks SNI, trust, hostname authorization, protocol/cipher, and days until expiry on
   HTTPS and common secure ports (`443`, `8443`, `8883`).
4. **HTTP** — records status, selected safe response metadata, and each redirect without downloading
   the response body.
5. **Proxy environment** — inspects `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, and `NO_PROXY`, then
   resolves and opens configured proxy endpoints.

The default presets currently probe:

| Preset | Services |
| --- | --- |
| `github` | Web, REST API, object/release delivery |
| `npm` | Registry ping and website |
| `pypi` | PyPI JSON API and package files |
| `docker` | Docker Hub registry and authentication |

Some services intentionally return `401` or `404` at their probe path. Presets encode those expected
statuses so reachability is not misreported as an outage.

## Exit codes

| Code | Meaning |
| ---: | --- |
| `0` | No failed checks; warnings are non-blocking by default |
| `1` | At least one check failed, or a warning occurred with `--strict` |
| `2` | Invalid arguments or target configuration |
| `3` | Unexpected internal error |

All ordinary DNS, socket, TLS, HTTP, and proxy failures are diagnostic results, not internal errors.

## Privacy and safe sharing

> [!WARNING]
> **Sanitized does not mean anonymous. Review every report before sharing it publicly.** Target
> hostnames, IP addresses, certificate names, redirect destinations, and `NO_PROXY` entries can
> reveal internal infrastructure even when credentials have been removed.

Reports are sanitized before rendering. NetDoctor masks:

- URL usernames/passwords and proxy credentials
- common secret-bearing query parameters such as `token`, `api_key`, `password`, and `signature`
- Authorization and Cookie header-shaped text
- explicit secret assignments in error text
- the current home-directory path

NetDoctor does **not** read request or response bodies. Redaction is defense in depth, not permission
to publish a report without human review.

## Current proxy boundary

The proxy check validates configuration syntax plus DNS/TCP reachability of proxy endpoints. Target
DNS, TCP, TLS, and HTTP probes are deliberately direct in `0.1.x`; they do not tunnel through the
configured proxy. The report calls this out so “proxy reachable” is never confused with “request used
the proxy.” A future release may add explicit HTTP CONNECT and SOCKS transport probes.

## JSON stability

JSON reports include `schemaVersion: 1`, tool version, sanitized targets, all checks, summary counts,
and the suggested process exit code. Fields may be added within a schema version; consumers should
ignore unknown fields. Breaking changes will increment `schemaVersion`.

## Development

```bash
npm install
npm run check
npm test
npm run build
```

Tests use Node's built-in test runner and local ephemeral servers, so they do not require internet
access. See [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request.

## License

[MIT](./LICENSE)
