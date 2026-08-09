# Architecture

## High-level flow
1. Host creates a Session (WiFi Direct group owner / local hotspot)
2. Host generates: session token, keypair, QR code + short link encoding {IP, port, token, pubkey fingerprint}
3. Clients join via QR scan / link / auto-discovery (mDNS broadcast on LAN)
4. Handshake: ECDH key exchange → derive per-session AES-256-GCM key
5. Host builds chunk manifest for selected file(s): {chunk_id, offset, size, sha256}
6. ML module predicts: chunk size, parallel stream count, compress-or-not per file
7. Transfer begins: multiple TCP streams send encrypted, (optionally compressed) chunks
8. Receiver writes each chunk directly to pre-allocated file at correct offset, verifies hash, updates local SQLite state
9. On pause/disconnect: state persists on disk (both sides)
10. On resume (any time later): receiver reports missing chunk IDs → sender seeks and resends only those

## Components

```
┌─────────────┐        Discovery (mDNS / QR / Link)        ┌─────────────┐
│    Host     │ ───────────────────────────────────────▶  │   Client 1   │
│  (Sender)   │                                             └─────────────┘
│             │        Handshake (ECDH) + Session Token     ┌─────────────┐
│  - Manifest │ ───────────────────────────────────────▶  │   Client 2   │
│  - ML model │                                             └─────────────┘
│  - Chunker  │        Encrypted chunk stream (parallel)          ...
│  - Encryptor│ ───────────────────────────────────────▶  ┌─────────────┐
└─────────────┘                                             │   Client N   │
                                                             └─────────────┘
```

## Module breakdown
- **Discovery module** — mDNS beacon, QR generator/scanner, link parser
- **Session module** — token generation, key exchange, session state (active/paused/expired)
- **Manifest module** — chunking, hashing, manifest serialization (JSON/SQLite)
- **Transfer engine** — multi-threaded socket send/receive, chunk scheduler, retry logic
- **Crypto module** — AES-256-GCM encrypt/decrypt per chunk, key derivation
- **Compression module** — file-type detection, zstd wrapper, skip logic
- **ML module** — feature extraction (network/file stats) → predict chunk size/parallelism/compress flag
- **State/persistence module** — SQLite manifest + status, survives app restart
- **UI layer** — host dashboard (connected clients, progress per client), client view (join, progress, pause/resume button)

## Data flow for one-to-many broadcast
Host maintains one manifest per file, streams chunks to each connected client independently (separate socket per client) so one slow client doesn't block others. Track per-client chunk-ack state separately.
