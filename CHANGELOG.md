# Changelog

All notable changes to NetDoctor are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-08-03

### Added

- Concurrent OS DNS and A/AAAA resolution diagnostics.
- TCP connectivity and latency probes with actionable failure guidance.
- TLS trust, hostname authorization, protocol, cipher, and certificate-expiry checks.
- HTTP status and bounded redirect-chain inspection without downloading response bodies.
- Proxy environment validation for `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, and `NO_PROXY`.
- Built-in GitHub, npm, PyPI, and Docker Hub presets plus custom URL and host targets.
- Color terminal summaries, versioned JSON reports, and shareable Markdown reports.
- Privacy-first redaction for URL/proxy credentials, sensitive query parameters, authorization and
  cookie-shaped text, explicit secret assignments, and user home-directory paths.
- Configurable timeouts, `--strict` behavior, and automation-friendly exit codes.
- Windows, macOS, and Linux CI coverage on supported Node.js release lines.

[0.1.0]: https://github.com/Guiiat/netdoctor/releases/tag/v0.1.0
