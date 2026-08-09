import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

import {
  initDb,
  saveSession,
  getSession,
  saveChunkStatus,
  getClientProgress,
  resetClientProgress,
  saveTelemetry
} from './db.js';
import { generateKeypair, deriveSharedKey, encryptChunk, calculateHash } from './crypto.js';
import { predictOptimalSettings } from './ml_optimizer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure shared directory exists
const uploadDir = path.join(__dirname, 'shared_files');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ noServer: true });

app.use(cors());
app.use(express.json());

// Serve static build of frontend in production
const frontendBuildPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(frontendBuildPath)) {
  app.use(express.static(frontendBuildPath));
}

// Multer disk storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate safe filename with timestamp
    const safeName = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, safeName);
  }
});
const upload = multer({ storage });

// In-memory active session stores
// sessionId -> { sessionDetails, ecdhInstance, ecdhPublicKey }
const activeSessions = new Map();

// Client connection associations
// ws -> { clientId, sessionId }
const connections = new Map();

// Derived cryptographic symmetric keys
// key: "clientId_sessionId" -> Buffer (AES key)
const clientSymmetricKeys = new Map();

// Keep track of active speed stats per client
// key: "clientId_sessionId" -> { startTime, loadedBytes }
const transferStats = new Map();

// Get local IPv4 address
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const interfaceName of Object.keys(interfaces)) {
    for (const iface of interfaces[interfaceName]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// HTTP API: Get Host local IP & port configuration
app.get('/api/config', (req, res) => {
  const ip = getLocalIpAddress();
  res.json({ ip, port: 3000 });
});

// HTTP API: Upload file and create session
app.post('/api/sessions', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { path: filePath, originalname: fileName, size: fileSize } = req.file;
    const fileExtension = path.extname(fileName);
    
    // Generate a clean session ID
    const sessionId = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // Run the ML optimizer to decide optimal parameters based on history
    // Since this is the initial setup, we assume 1 client to begin with
    const numClients = 1;
    const mlSettings = await predictOptimalSettings(fileSize, fileExtension, numClients);
    
    const { chunkSize, parallelStreams, useCompression, confidence } = mlSettings;
    const totalChunks = Math.ceil(fileSize / chunkSize);

    // Generate ECDH cryptographic keypair for this session
    const { publicKey, ecdhInstance } = generateKeypair();

    const sessionData = {
      sessionId,
      filePath,
      fileName,
      fileSize,
      chunkSize,
      totalChunks,
      useCompression,
      parallelStreams,
      mlConfidence: confidence
    };

    // Persist to database
    await saveSession(sessionData);

    // Store ECDH instance and public key in active memory
    activeSessions.set(sessionId, {
      ...sessionData,
      ecdhInstance,
      ecdhPublicKey: publicKey
    });

    console.log(`[Host] Created session ${sessionId} for ${fileName}. ML Choice: Chunks=${chunkSize}B, Streams=${parallelStreams}, Compress=${useCompression} (${confidence})`);

    res.json({
      sessionId,
      fileName,
      fileSize,
      chunkSize,
      totalChunks,
      useCompression,
      parallelStreams,
      hostPublicKey: publicKey,
      mlConfidence: confidence,
      downloadUrl: `http://${getLocalIpAddress()}:3000/?join=${sessionId}`
    });
  } catch (error) {
    console.error('Failed to create session:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// HTTP API: Get active session info
app.get('/api/sessions/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const memorySession = activeSessions.get(sessionId);
  
  if (memorySession) {
    return res.json({
      sessionId: memorySession.sessionId,
      fileName: memorySession.fileName,
      fileSize: memorySession.fileSize,
      chunkSize: memorySession.chunkSize,
      totalChunks: memorySession.totalChunks,
      useCompression: memorySession.useCompression,
      parallelStreams: memorySession.parallelStreams,
      hostPublicKey: memorySession.ecdhPublicKey,
      mlConfidence: memorySession.mlConfidence
    });
  }

  // Fallback to SQLite (if server restarted)
  try {
    const dbSession = await getSession(sessionId);
    if (!dbSession) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Since server restarted, we generate a fresh ECDH keypair for the active memory
    const { publicKey, ecdhInstance } = generateKeypair();
    const sessionData = {
      sessionId: dbSession.session_id,
      filePath: dbSession.file_path,
      fileName: dbSession.file_name,
      fileSize: dbSession.file_size,
      chunkSize: dbSession.chunk_size,
      totalChunks: dbSession.total_chunks,
      useCompression: false, // fallback to safe default
      parallelStreams: 2,
      mlConfidence: 'Restored from database'
    };

    activeSessions.set(sessionId, {
      ...sessionData,
      ecdhInstance,
      ecdhPublicKey: publicKey
    });

    res.json({
      ...sessionData,
      hostPublicKey: publicKey
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve session' });
  }
});

// HTTP upgrade logic to route /ws connections
httpServer.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Broadcast active client list to the Host dashboard and clients
function broadcastSessionUpdate(sessionId) {
  const clients = [];
  connections.forEach((info, ws) => {
    if (info.sessionId === sessionId) {
      clients.push(info.clientId);
    }
  });

  const updateMessage = JSON.stringify({
    type: 'clients_update',
    clients
  });

  // Notify everyone in the session
  connections.forEach((info, ws) => {
    if (info.sessionId === sessionId && ws.readyState === WebSocket.OPEN) {
      ws.send(updateMessage);
    }
  });
}

// WebSocket Event Listeners
wss.on('connection', (ws) => {
  console.log('[WS] New WebSocket connection established.');

  ws.on('message', async (message) => {
    try {
      // Handle JSON control frames
      if (typeof message === 'string' || Buffer.isBuffer(message)) {
        const textContent = message.toString();
        let data;
        try {
          data = JSON.parse(textContent);
        } catch {
          // Ignore binary chunk buffers or malformed json
          return;
        }

        switch (data.type) {
          case 'join': {
            const { clientId, sessionId } = data;
            connections.set(ws, { clientId, sessionId });
            
            console.log(`[WS] Client ${clientId} joined session ${sessionId}`);
            broadcastSessionUpdate(sessionId);
            
            // Send join ACK
            ws.send(JSON.stringify({ type: 'joined', success: true }));
            break;
          }

          case 'handshake': {
            const connInfo = connections.get(ws);
            if (!connInfo) return;
            const { clientId, sessionId } = connInfo;
            const { clientPublicKey } = data;

            const session = activeSessions.get(sessionId);
            if (!session) {
              ws.send(JSON.stringify({ type: 'error', message: 'Session expired or not active' }));
              return;
            }

            // Derive shared symmetric key (AES-256)
            const sharedKey = deriveSharedKey(session.ecdhInstance, clientPublicKey);
            clientSymmetricKeys.set(`${clientId}_${sessionId}`, sharedKey);

            console.log(`[Crypto] Secure ECDH handshake completed with client ${clientId} for session ${sessionId}`);

            // Respond with host key to complete client key derivation
            ws.send(JSON.stringify({
              type: 'handshake_response',
              hostPublicKey: session.ecdhPublicKey
            }));
            break;
          }

          case 'request_chunk': {
            const connInfo = connections.get(ws);
            if (!connInfo) return;
            const { clientId, sessionId } = connInfo;
            const { chunkIndex } = data;

            const session = activeSessions.get(sessionId);
            const aesKey = clientSymmetricKeys.get(`${clientId}_${sessionId}`);

            if (!session || !aesKey) {
              ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized. Execute handshake first.' }));
              return;
            }

            // Read the specific chunk from local file
            const offset = chunkIndex * session.chunkSize;
            const size = Math.min(session.chunkSize, session.fileSize - offset);

            if (size <= 0 || offset >= session.fileSize) {
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid chunk index' }));
              return;
            }

            // Track transfer start time for telemetry
            if (!transferStats.has(`${clientId}_${sessionId}`)) {
              transferStats.set(`${clientId}_${sessionId}`, {
                startTime: Date.now(),
                loadedBytes: 0
              });
            }

            const fd = fs.openSync(session.filePath, 'r');
            const buffer = Buffer.alloc(size);
            fs.readSync(fd, buffer, 0, size, offset);
            fs.closeSync(fd);

            // Compute hash for integrity verification
            const hash = calculateHash(buffer);

            // Compress payload optionally
            let payload = buffer;
            let isCompressed = 0;
            if (session.useCompression) {
              payload = zlib.deflateSync(buffer);
              isCompressed = 1;
            }

            // Encrypt payload using AES key
            const { iv, tag, ciphertext } = encryptChunk(aesKey, payload);

            // Create high-efficiency binary WebSocket packet
            const ivBuffer = Buffer.from(iv, 'hex');   // 12 bytes
            const tagBuffer = Buffer.from(tag, 'hex'); // 16 bytes
            const ciphertextBuffer = Buffer.from(ciphertext, 'hex');

            // Format layout:
            // 0-3: chunkIndex (UInt32BE)
            // 4: isCompressed (UInt8)
            // 5-16: IV (12 bytes)
            // 17-32: TAG (16 bytes)
            // 33+: encrypted payload ciphertext
            const header = Buffer.alloc(33);
            header.writeUInt32BE(chunkIndex, 0);
            header.writeUInt8(isCompressed, 4);
            ivBuffer.copy(header, 5);
            tagBuffer.copy(header, 17);

            const binaryFrame = Buffer.concat([header, ciphertextBuffer]);

            if (ws.readyState === WebSocket.OPEN) {
              ws.send(binaryFrame);
            }

            // Update local SQLite db state to track progress
            await saveChunkStatus({
              clientId,
              sessionId,
              chunkIndex,
              status: 'completed',
              sha256: hash
            });

            // Update loaded stats
            const stats = transferStats.get(`${clientId}_${sessionId}`);
            stats.loadedBytes += size;
            break;
          }

          case 'get_resume_state': {
            const connInfo = connections.get(ws);
            if (!connInfo) return;
            const { clientId, sessionId } = connInfo;

            // Fetch list of chunk IDs that this client has already successfully downloaded
            const progress = await getClientProgress(clientId, sessionId);
            const downloadedIndices = progress.map(p => p.chunk_index);

            ws.send(JSON.stringify({
              type: 'resume_state',
              downloadedIndices
            }));
            break;
          }

          case 'reset_progress': {
            const connInfo = connections.get(ws);
            if (!connInfo) return;
            const { clientId, sessionId } = connInfo;
            await resetClientProgress(clientId, sessionId);
            ws.send(JSON.stringify({ type: 'reset_success' }));
            break;
          }

          case 'transfer_complete': {
            const connInfo = connections.get(ws);
            if (!connInfo) return;
            const { clientId, sessionId } = connInfo;

            const session = activeSessions.get(sessionId);
            const stats = transferStats.get(`${clientId}_${sessionId}`);

            if (session && stats) {
              const elapsedSeconds = (Date.now() - stats.startTime) / 1000;
              const sizeMb = (stats.loadedBytes * 8) / (1024 * 1024); // Megabits
              const throughputMbps = elapsedSeconds > 0 ? (sizeMb / elapsedSeconds) : 0;

              console.log(`[Telemetry] Client ${clientId} finished session ${sessionId}. Speed: ${throughputMbps.toFixed(2)} Mbps. Logged to ML table.`);

              // Log results to ML table
              await saveTelemetry({
                fileExtension: path.extname(session.fileName),
                fileSize: session.fileSize,
                numClients: 1, // log relative to individual connections
                chunkSizeUsed: session.chunkSize,
                compressionUsed: session.useCompression ? 1 : 0,
                throughputMbps: parseFloat(throughputMbps.toFixed(2))
              });

              transferStats.delete(`${clientId}_${sessionId}`);
            }
            break;
          }
        }
      }
    } catch (err) {
      console.error('[WS] Error processing WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    const info = connections.get(ws);
    if (info) {
      console.log(`[WS] Client ${info.clientId} disconnected.`);
      connections.delete(ws);
      broadcastSessionUpdate(info.sessionId);
    } else {
      console.log('[WS] Connection closed.');
    }
  });
});

// Handle graceful server shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  process.exit(0);
});

// Boot Database first, then launch Web Server
const PORT = 3000;
initDb()
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`================================================================`);
      console.log(`NearShare backend server is live on http://localhost:${PORT}`);
      console.log(`Clients can join via: http://${getLocalIpAddress()}:${PORT}`);
      console.log(`================================================================`);
    });
  })
  .catch((err) => {
    console.error('Failed to boot application database:', err);
  });
