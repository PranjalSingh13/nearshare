import { getTelemetryLogs } from './db.js';

// Set of file extensions that are already compressed and should not be re-compressed
const ALREADY_COMPRESSED_EXT = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'avi', 'mkv', 'mp3',
  'wav', 'zip', 'tar', 'gz', 'rar', '7z', 'pdf', 'dmg', 'exe', 'iso'
]);

/**
 * Predict optimal transfer parameters using a k-Nearest Neighbors (k-NN) approach on historical database telemetry.
 * 
 * @param {number} fileSize - File size in bytes
 * @param {string} fileExtension - File extension (e.g. '.mp4')
 * @param {number} numClients - Number of clients participating
 * @returns {Promise<{chunkSize: number, parallelStreams: number, useCompression: boolean, confidence: string, bestThroughputSeen: number|null}>}
 */
export async function predictOptimalSettings(fileSize, fileExtension, numClients) {
  const cleanExt = (fileExtension || '').toLowerCase().replace(/^\./, '');
  const isCompressedExt = ALREADY_COMPRESSED_EXT.has(cleanExt);
  
  // If the file extension is inherently compressed, never waste CPU compressing it
  let recommendedCompress = !isCompressedExt;

  try {
    const logs = await getTelemetryLogs();
    
    // Fallback if there are less than 5 logged transfer sessions (we need a baseline training set)
    if (!logs || logs.length < 5) {
      return getHeuristicSettings(fileSize, recommendedCompress, numClients, "Heuristic (Gathering data)");
    }

    // k-NN: We calculate Euclidean distance based on log10 of file size and client count.
    // Normalized dimensions are scale-compatible.
    const targetSizeLog = Math.log10(fileSize || 1);
    const targetClients = numClients || 1;

    const scoredLogs = logs.map(log => {
      const logSizeLog = Math.log10(log.file_size || 1);
      const logClients = log.num_clients || 1;
      
      const distance = Math.sqrt(
        Math.pow(targetSizeLog - logSizeLog, 2) + 
        Math.pow(targetClients - logClients, 2)
      );
      
      return { log, distance };
    });

    // Sort by proximity in feature space (closest first)
    scoredLogs.sort((a, b) => a.distance - b.distance);

    // Pick top K nearest neighbors (K = 5)
    const k = Math.min(5, scoredLogs.length);
    const nearestNeighbors = scoredLogs.slice(0, k).map(x => x.log);

    // Out of the K neighbors, pick the parameter set that achieved the HIGHEST transfer speed (throughput)
    let bestConfigLog = null;
    let maxThroughput = -1;
    
    for (const neighbor of nearestNeighbors) {
      if (neighbor.throughput_mbps > maxThroughput) {
        maxThroughput = neighbor.throughput_mbps;
        bestConfigLog = neighbor;
      }
    }

    if (bestConfigLog) {
      return {
        chunkSize: bestConfigLog.chunk_size_used,
        // If there are multiple clients, limit parallel socket streams per client to 1 to avoid local router congestion
        parallelStreams: numClients > 1 ? 1 : bestConfigLog.parallel_streams_used,
        useCompression: recommendedCompress ? (bestConfigLog.compression_used === 1) : false,
        confidence: `ML-Optimized (Based on ${logs.length} runs)`,
        bestThroughputSeen: bestConfigLog.throughput_mbps
      };
    }
  } catch (error) {
    console.error('Error executing ML prediction:', error);
  }

  // Fallback heuristic in case of errors
  return getHeuristicSettings(fileSize, recommendedCompress, numClients, "Heuristic (Predictor error fallback)");
}

/**
 * Baseline heuristic rules for transfer settings.
 */
function getHeuristicSettings(fileSize, recommendedCompress, numClients, reason) {
  let chunkSize = 256 * 1024; // Default 256 KB
  let parallelStreams = 2;    // Default 2 streams

  // Large files can handle larger chunk sizes
  if (fileSize > 50 * 1024 * 1024) { // >50MB
    chunkSize = 512 * 1024; // 512 KB
    parallelStreams = 3;
  }
  if (fileSize > 250 * 1024 * 1024) { // >250MB
    chunkSize = 1024 * 1024; // 1 MB
    parallelStreams = 3;
  }
  if (fileSize > 1024 * 1024 * 1024) { // >1GB
    chunkSize = 2 * 1024 * 1024; // 2 MB
    parallelStreams = 4;
  }

  // Multi-client logic: reduce parallel connections per client to preserve router bandwidth
  if (numClients > 1) {
    parallelStreams = 1;
    chunkSize = Math.min(chunkSize, 512 * 1024);
  }

  return {
    chunkSize,
    parallelStreams,
    useCompression: recommendedCompress,
    confidence: reason,
    bestThroughputSeen: null
  };
}
