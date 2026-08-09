# Roadmap

## Phase 1 — Core transfer (2-3 weeks)
- Basic host/client session creation over local WiFi
- Manual IP entry (skip QR/discovery initially) to prove transfer works
- Single-file, single-client transfer with AES encryption
- Chunking + SHA-256 verification

## Phase 2 — Resume + persistence (1 week)
- SQLite manifest/state store
- Pause/resume logic, test with simulated disconnects and app restarts

## Phase 3 — Discovery & UX (1-2 weeks)
- QR code generation/scanning
- Link-based join
- mDNS auto-discovery
- Host dashboard with multi-client progress

## Phase 4 — One-to-many broadcast (1 week)
- Multi-client concurrent transfer
- Per-client independent chunk tracking

## Phase 5 — Compression (3-5 days)
- File-type detection + skip logic
- zstd integration, benchmark speed impact

## Phase 6 — ML integration (1-2 weeks, can run in parallel)
- Logging pipeline from Phase 1 onward
- Train first model once enough data collected
- On-device inference integration

## Phase 7 — Polish & test (1-2 weeks)
- 50GB real-world throughput test
- Corruption/integrity stress test
- UI polish, error handling, documentation

## Suggested total: ~8-10 weeks solo, part-time
