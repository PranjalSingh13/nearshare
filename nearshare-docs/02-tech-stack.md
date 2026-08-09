# Tech Stack

## Recommended (solo-buildable, cross-platform-ish)

**App layer:** Flutter (Dart)
- Single codebase for Android + Windows + Linux (and iOS/macOS later)
- Good plugin support for WiFi Direct / hotspot / QR scanning

**Alternative (Android-first, faster to prototype):** Kotlin + Android's WiFi P2P (Nearby Connections API as reference, but build your own protocol for control)

**Transport/Networking:**
- WiFi Direct (Android `WifiP2pManager`) or local hotspot mode
- mDNS/Bonjour (NSD) for auto-discovery on same network
- Raw TCP sockets for chunked file transfer (don't use HTTP — too much overhead per chunk)
- Bluetooth LE only for initial handshake/beacon, not payload

**Encryption:**
- AES-256-GCM for chunk payload (authenticated encryption — gives integrity + confidentiality together)
- X25519 (ECDH) for session key exchange
- libsodium / Tink (battle-tested crypto libs — never hand-roll AES)

**Compression:**
- Zstd (fast, good ratio, streaming-friendly) via bindings
- Skip list for already-compressed extensions (jpg, mp4, zip, png, etc.) via magic-byte + extension check

**QR / Link:**
- `qr_flutter` (generate) + `mobile_scanner` (scan)
- Link encodes: host IP/port, session token, public key fingerprint

**Local persistence (manifest/state):**
- SQLite (via `sqflite` or `drift`) — chunk status table survives app kill/restart

**ML component:**
- Start with scikit-learn (Python) offline to train a small decision tree / gradient boosted model on logged transfer sessions
- Export to ONNX or TFLite for on-device inference (lightweight, no heavy runtime)
- Alternative for v1: rule-based heuristic first, swap in trained model once you have logged data

**Backend:** None required — this is fully P2P/local, no server infra needed for MVP

## Why not X?
- Not using HTTP/REST for transfer: too much per-request overhead for chunk-level throughput targets
- Not using cloud relay: breaks "offline" requirement and adds latency/bandwidth cost
- Not using heavy DL models: unjustifiable for the tabular, low-feature-count prediction task here
