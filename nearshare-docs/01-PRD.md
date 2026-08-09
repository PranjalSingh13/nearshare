# NearShare — Product Requirements Document

## One-liner
An offline, wireless, encrypted file-sharing app that transfers up to 50GB in under 30 minutes between one host and many clients on a local network — no internet required.

## Problem
Existing tools (AirDrop, Nearby Share, Xender) are either platform-locked, lack strong encryption, don't support one-to-many "classroom" broadcast, or don't support pause/resume for huge files.

## Target Users
- Students/teachers sharing large files across a class without internet (primary use case)
- Offices/labs transferring large datasets locally
- Anyone needing secure offline transfer of sensitive files

## Core Requirements
1. Works fully offline — local WiFi Direct / hotspot, no cloud relay
2. End-to-end encrypted (AES-256 payload, ECDH/RSA handshake)
3. Sustains ~28+ MB/s to hit 50GB in <30 min
4. One Host → many Clients (broadcast/multicast model)
5. Join via QR code, shareable link/code, or auto-discovery (like Nearby Share)
6. Pause transfer and resume later (even after an hour+), from the exact point left off
7. Smart compression (skip already-compressed files, use fast codecs)
8. At least one genuine ML-driven feature (see 06-ml-plan.md)
9. Resumable, chunk-based, integrity-checked (SHA-256 per chunk)

## Non-Goals (v1)
- Internet/cloud fallback transfer
- Cross-platform native apps for all OSes simultaneously (pick 1-2 to start)
- Deep learning / heavy models — ML should be lightweight and justifiable

## Success Metrics
- 50GB transfer completes in <30 min on local WiFi in testing
- Resume works correctly after simulated disconnect/hour-long pause
- Zero data corruption across 100 test transfers (hash-verified)
