# Feature List

## MVP (v1)
- [ ] Host mode: create session, generate QR + link
- [ ] Client mode: join via QR / link / auto-discovery
- [ ] AES-256-GCM encrypted transfer, ECDH handshake
- [ ] Chunked transfer with SHA-256 integrity check per chunk
- [ ] Pause and resume (including after app restart / hours later)
- [ ] Smart compression (skip already-compressed types, zstd for the rest)
- [ ] One host → multiple clients broadcast
- [ ] Progress UI: per-file, per-client progress bars
- [ ] Transfer speed target: 50GB in <30 min on local WiFi

## v1.1 — ML integration
- [ ] Logging pipeline: capture transfer sessions (network conditions, file type, throughput, chunk size used)
- [ ] Train lightweight model (decision tree / gradient boosting) on logged data
- [ ] On-device inference: predict chunk size + parallel stream count + compress flag
- [ ] Fallback to heuristic rules when insufficient training data

## v2 — nice-to-haves
- [ ] Folder/multi-file batch transfer as single job
- [ ] Bandwidth throttling / priority control
- [ ] Transfer history log with checksums (audit trail)
- [ ] Password-protected sessions (extra layer beyond key exchange)
- [ ] Anomaly detection: flag unusual sender/transfer behavior
- [ ] Cross-platform expansion (iOS, macOS, Linux)
- [ ] Dark mode / accessibility polish

## Explicitly deferred / not planned
- Cloud relay or internet-based transfer
- Heavy deep-learning features ("AI organizer" etc.) — flagged as low-value in this app's context
