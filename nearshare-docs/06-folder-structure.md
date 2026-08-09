# Suggested Folder Structure (Flutter-based)

```
nearshare/
├── lib/
│   ├── main.dart
│   ├── core/
│   │   ├── crypto/              # AES-GCM, ECDH key exchange
│   │   ├── networking/          # sockets, mDNS discovery, WiFi Direct wrapper
│   │   ├── compression/         # zstd wrapper, file-type detection
│   │   └── ml/                  # feature extraction, model inference (ONNX/TFLite)
│   ├── manifest/
│   │   ├── chunker.dart         # split file into chunks
│   │   ├── manifest_model.dart  # chunk/session data models
│   │   └── state_store.dart     # SQLite persistence for pause/resume
│   ├── transfer/
│   │   ├── host_engine.dart     # sender-side transfer logic
│   │   ├── client_engine.dart   # receiver-side transfer logic
│   │   └── scheduler.dart       # chunk scheduling, retry logic
│   ├── session/
│   │   ├── qr_generator.dart
│   │   ├── qr_scanner.dart
│   │   └── link_handler.dart
│   └── ui/
│       ├── host_dashboard.dart
│       ├── client_view.dart
│       └── progress_widgets.dart
├── ml_training/                  # separate Python project, not shipped in app
│   ├── logs/                     # exported CSV session logs
│   ├── train_model.py
│   └── export_to_tflite.py
├── test/
├── docs/                         # this folder's contents
└── pubspec.yaml
```

## Notes
- Keep `ml_training/` as a separate Python workspace — it's offline tooling, not part of the shipped app
- `core/ml/` in the app only does inference (loading a small exported model), not training
