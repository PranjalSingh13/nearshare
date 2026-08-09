# ML Plan — Adaptive Transfer Optimizer

## Goal
Predict, per transfer session, the best: chunk size, parallel stream count, and compress-or-not decision — instead of hardcoding fixed values.

## Why this is legitimate ML (not just a checkbox feature)
Naive apps use fixed chunk size regardless of conditions. Real throughput depends on signal strength, file type, and number of connected clients — a model that adapts to these measurably beats a fixed constant. This is the same principle behind adaptive bitrate streaming (Netflix/YouTube), applied to local file transfer.

## Data to log from day 1 (even before you have the model)
Per transfer session, log:
- file_type / extension
- file_size
- wifi_rssi (signal strength)
- num_connected_clients
- chunk_size_used
- parallel_streams_used
- compression_used (bool)
- measured_throughput_mbps
- device CPU/battery state (optional)

Store as rows in local SQLite or export to CSV — this becomes your training set.

## Model approach
1. **Phase 1 (no model yet):** rule-based heuristics — e.g. skip compression for jpg/mp4/zip, fixed chunk size by file size bracket. Ship this first so the app works.
2. **Phase 2 (once you have ~500+ logged sessions):** train a small model offline:
   - scikit-learn `DecisionTreeRegressor` or `GradientBoostingRegressor` predicting optimal chunk size / stream count
   - Simple classifier (logistic regression or small tree) for compress yes/no
3. **Phase 3:** export trained model to ONNX or TFLite, run on-device for inference (lightweight, no internet needed — keeps app fully offline)

## Evaluation
- A/B compare: fixed heuristic vs ML-predicted settings, measure actual throughput on same file/network conditions
- Keep the heuristic as a fallback if the model's confidence is low or input is out-of-distribution

## Talking points for reports/demos
- Be upfront: this is a lightweight, tabular-data ML model (not deep learning) — appropriate because the feature set is small and interpretable, and on-device inference needs to be fast and low-power
- Explain the honest scope: it optimizes transfer parameters, not "AI magic" — this is the credible way to present it to evaluators/recruiters
