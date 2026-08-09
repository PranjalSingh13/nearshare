import React, { useState, useEffect, useRef } from 'react';
import { 
  Wifi, 
  Download, 
  Pause, 
  Play, 
  RotateCcw, 
  CheckCircle, 
  CheckCircle2,
  ShieldAlert, 
  Lock,
  FileCheck,
  UploadCloud
} from 'lucide-react';

// IndexedDB Helper to persist chunks locally for pause/resume without RAM overflow
const DB_NAME = 'NearShareClientDB';
const STORE_NAME = 'chunks';

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function saveChunkToDB(key, buffer) {
  const db = await openIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(buffer, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getChunkFromDB(key) {
  const db = await openIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteChunksFromDB(keys) {
  const db = await openIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    for (const key of keys) {
      store.delete(key);
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// Convert ArrayBuffer to Hex String
function arrayBufferToHex(buffer) {
  return Array.prototype.map.call(new Uint8Array(buffer), x => ('0' + x.toString(16)).slice(-2)).join('');
}

// Convert Hex String to Uint8Array
function hexToUint8Array(hexString) {
  const result = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < hexString.length; i += 2) {
    result[i / 2] = parseInt(hexString.substring(i, i + 2), 16);
  }
  return result;
}

export default function ClientView({ prefilledSessionId, onBack }) {
  const [sessionIdInput, setSessionIdInput] = useState(prefilledSessionId || '');
  const [session, setSession] = useState(null);
  const [joined, setJoined] = useState(false);
  const [handshakeComplete, setHandshakeComplete] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progressArray, setProgressArray] = useState([]); // 'pending', 'completed'
  const [speed, setSpeed] = useState(0); // Mbps
  const [eta, setEta] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  // ── Upload state (receive mode)
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadDone, setUploadDone] = useState(false);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const uploadStartRef = useRef(null);
  const uploadFileInputRef = useRef(null);

  // Web Crypto Key References
  const clientKeyPairRef = useRef(null);
  const derivedAesKeyRef = useRef(null);
  
  // Connection References
  const wsRef = useRef(null);
  const clientId = useRef(`CLIENT_${Math.random().toString(36).substring(2, 6).toUpperCase()}`);
  
  // Queue Control state variables (using refs to avoid stale closures in WS listener)
  const isDownloadingRef = useRef(false);
  const progressArrayRef = useRef([]);
  const activeRequestsCountRef = useRef(0);
  const downloadedBytesCountRef = useRef(0);
  const downloadStartTimeRef = useRef(null);

  // Auto-join if prefilled sessionId is available
  useEffect(() => {
    if (prefilledSessionId) {
      handleJoin(prefilledSessionId);
    }
    return () => {
      isDownloadingRef.current = false;
      if (wsRef.current) wsRef.current.close();
    };
  }, [prefilledSessionId]);

  const handleJoin = async (idToJoin = sessionIdInput) => {
    const sId = (idToJoin || '').trim().toUpperCase();
    if (!sId) return;

    setErrorMsg('');
    try {
      // 1. Fetch metadata session info
      const res = await fetch(`/api/sessions/${sId}`);
      if (!res.ok) {
        throw new Error('Session not found on local host network');
      }
      const data = await res.json();
      setSession(data);
      setJoined(true);

      // 2. Initialize WebSocket control channel
      connectWebSocket(sId, data);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message);
    }
  };

  const connectWebSocket = (sId, sessionDetails) => {
    const wsUrl = `ws://${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      console.log('[Client WS] Connected to backend signaling channel.');
      ws.send(JSON.stringify({
        type: 'join',
        clientId: clientId.current,
        sessionId: sId
      }));
    };

    ws.onmessage = async (event) => {
      // Check if message is binary frame (ArrayBuffer)
      if (event.data instanceof ArrayBuffer) {
        await handleBinaryChunkFrame(event.data, sessionDetails);
        return;
      }

      // Handle JSON control frames
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'joined': {
            console.log('[Client WS] Joined room. Triggering ECDH crypto handshake...');
            await triggerHandshake(sessionDetails);
            break;
          }

          case 'handshake_response': {
            console.log('[Client WS] Handshake responded. Generating shared symmetric key...');
            await computeSharedAesKey(msg.hostPublicKey);
            setHandshakeComplete(true);

            // Fetch missing chunks database status to implement pause/resume
            wsRef.current.send(JSON.stringify({ type: 'get_resume_state' }));
            break;
          }

          case 'resume_state': {
            const { downloadedIndices } = msg;
            const initProgress = Array(sessionDetails.totalChunks).fill('pending');
            
            let recoveredBytes = 0;
            downloadedIndices.forEach(idx => {
              if (idx < initProgress.length) {
                initProgress[idx] = 'completed';
                recoveredBytes += sessionDetails.chunkSize;
              }
            });

            setProgressArray(initProgress);
            progressArrayRef.current = initProgress;
            downloadedBytesCountRef.current = recoveredBytes;
            break;
          }

          case 'error': {
            setErrorMsg(msg.message);
            setDownloading(false);
            isDownloadingRef.current = false;
            break;
          }
        }
      } catch (err) {
        console.error('Error handling JSON WS message:', err);
      }
    };

    ws.onclose = () => {
      console.log('[Client WS] Closed.');
      setDownloading(false);
      isDownloadingRef.current = false;
    };
  };

  // Secure Handshake Phase: Generate client ECDH Keypair
  const triggerHandshake = async (sessionDetails) => {
    try {
      const keyPair = await window.crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveKey', 'deriveBits']
      );
      clientKeyPairRef.current = keyPair;

      const rawPublicKey = await window.crypto.subtle.exportKey('raw', keyPair.publicKey);
      const publicKeyHex = arrayBufferToHex(rawPublicKey);

      wsRef.current.send(JSON.stringify({
        type: 'handshake',
        clientPublicKey: publicKeyHex
      }));
    } catch (err) {
      console.error('Crypto initialization failed:', err);
      setErrorMsg('Failed to initialize local cryptographic keys.');
    }
  };

  // Secure Handshake Phase: Compute symmetric AES key
  const computeSharedAesKey = async (hostPublicKeyHex) => {
    try {
      const hostPublicKeyBuffer = hexToUint8Array(hostPublicKeyHex);
      
      const hostPublicKey = await window.crypto.subtle.importKey(
        'raw',
        hostPublicKeyBuffer,
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        []
      );

      // Derive shared bits
      const sharedSecretBits = await window.crypto.subtle.deriveBits(
        { name: 'ECDH', public: hostPublicKey },
        clientKeyPairRef.current.privateKey,
        256
      );

      // Hash the shared bits using SHA-256 to create the AES-GCM 256 key
      const hashedKeyMaterial = await window.crypto.subtle.digest('SHA-256', sharedSecretBits);

      // Import the key material as an AES-GCM CryptoKey
      const aesKey = await window.crypto.subtle.importKey(
        'raw',
        hashedKeyMaterial,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      );

      derivedAesKeyRef.current = aesKey;
      console.log('[Crypto] Derived secure local symmetric AES-GCM key successfully.');
    } catch (err) {
      console.error('Shared key derivation failed:', err);
      setErrorMsg('Failed to derive cryptographic symmetric key.');
    }
  };

  // Decompress zlib-deflate buffers natively
  const decompressDeflate = async (arrayBuffer) => {
    const ds = new DecompressionStream('deflate');
    const stream = new Blob([arrayBuffer]).stream();
    const decompressedStream = stream.pipeThrough(ds);
    const response = new Response(decompressedStream);
    return await response.arrayBuffer();
  };

  // Binary WebSocket Packet Assembler and decrypter
  const handleBinaryChunkFrame = async (dataBuffer, sessionDetails) => {
    try {
      const view = new DataView(dataBuffer);
      
      // Parse header layout
      const chunkIndex = view.getUint32(0);
      const isCompressed = view.getUint8(4);
      
      const iv = dataBuffer.slice(5, 17);
      const tag = dataBuffer.slice(17, 33);
      const ciphertext = dataBuffer.slice(33);

      const aesKey = derivedAesKeyRef.current;
      if (!aesKey) return;

      // Reassemble ciphertext + tag for Web Crypto GCM input
      const decryptInputBuffer = new Uint8Array(ciphertext.byteLength + tag.byteLength);
      decryptInputBuffer.set(new Uint8Array(ciphertext), 0);
      decryptInputBuffer.set(new Uint8Array(tag), ciphertext.byteLength);

      // Decrypt chunk
      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(iv), tagLength: 128 },
        aesKey,
        decryptInputBuffer
      );

      // Decompress if flag set
      let finalChunkData = decryptedBuffer;
      if (isCompressed === 1) {
        finalChunkData = await decompressDeflate(decryptedBuffer);
      }

      // Persist to browser-safe IndexedDB
      const chunkDbKey = `${sessionDetails.sessionId}_${chunkIndex}`;
      await saveChunkToDB(chunkDbKey, finalChunkData);

      // Update state markers
      progressArrayRef.current[chunkIndex] = 'completed';
      const updatedProgress = [...progressArrayRef.current];
      setProgressArray(updatedProgress);

      downloadedBytesCountRef.current += finalChunkData.byteLength;
      activeRequestsCountRef.current = Math.max(0, activeRequestsCountRef.current - 1);

      // Live speeds calculating
      if (downloadStartTimeRef.current) {
        const elapsedSeconds = (Date.now() - downloadStartTimeRef.current) / 1000;
        if (elapsedSeconds > 0) {
          const loadedMb = (downloadedBytesCountRef.current * 8) / (1024 * 1024);
          const currentSpeedMbps = loadedMb / elapsedSeconds;
          setSpeed(currentSpeedMbps);

          // Calculate ETA
          const remainingBytes = sessionDetails.fileSize - downloadedBytesCountRef.current;
          if (currentSpeedMbps > 0 && remainingBytes > 0) {
            const speedBytesPerSec = (currentSpeedMbps * 1024 * 1024) / 8;
            setEta(Math.round(remainingBytes / speedBytesPerSec));
          } else {
            setEta(0);
          }
        }
      }

      // Check if download completed
      const allDone = updatedProgress.every(status => status === 'completed');
      if (allDone) {
        handleDownloadFinished(sessionDetails);
      } else {
        // Refill queue
        fillDownloadQueue(sessionDetails);
      }
    } catch (err) {
      console.error(`Decryption or hash verification failed for chunk`, err);
      // Retry chunk
      activeRequestsCountRef.current = Math.max(0, activeRequestsCountRef.current - 1);
      fillDownloadQueue(sessionDetails);
    }
  };

  // Pipeline manager: streams chunks keeping the socket filled up to client parallel stream count limit
  const fillDownloadQueue = (sessionDetails) => {
    if (!isDownloadingRef.current || !wsRef.current) return;

    const limit = sessionDetails.parallelStreams || 2;
    const progress = progressArrayRef.current;

    while (activeRequestsCountRef.current < limit) {
      // Find next pending chunk index
      const nextPendingIndex = progress.findIndex(status => status === 'pending');
      
      if (nextPendingIndex === -1) {
        // No more pending chunks
        break;
      }

      // Mark as transferring in UI state
      progress[nextPendingIndex] = 'transferring';
      progressArrayRef.current[nextPendingIndex] = 'transferring';
      setProgressArray([...progress]);

      activeRequestsCountRef.current += 1;

      // Ask host for chunk over WebSocket
      wsRef.current.send(JSON.stringify({
        type: 'request_chunk',
        chunkIndex: nextPendingIndex
      }));
    }
  };

  const handleStartDownload = () => {
    if (!session || !handshakeComplete) return;

    setDownloading(true);
    isDownloadingRef.current = true;
    if (!downloadStartTimeRef.current) {
      downloadStartTimeRef.current = Date.now();
    }

    fillDownloadQueue(session);
  };

  const handlePauseDownload = () => {
    setDownloading(false);
    isDownloadingRef.current = false;
    
    // Convert transferring chunks back to pending so they can be re-requested on resume
    const progress = progressArrayRef.current.map(status => 
      status === 'transferring' ? 'pending' : status
    );
    progressArrayRef.current = progress;
    setProgressArray(progress);
    activeRequestsCountRef.current = 0;
  };

  const handleDownloadFinished = async (sessionDetails) => {
    setDownloading(false);
    isDownloadingRef.current = false;
    setEta(0);

    // Notify backend to save ML log telemetry
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'transfer_complete' }));
    }

    console.log('[Client] File completely downloaded. Reassembling chunks from IndexedDB...');

    try {
      const chunks = [];
      const keysToDelete = [];
      
      for (let i = 0; i < sessionDetails.totalChunks; i++) {
        const dbKey = `${sessionDetails.sessionId}_${i}`;
        const chunkData = await getChunkFromDB(dbKey);
        
        if (!chunkData) {
          throw new Error(`Missing chunk data in database at index ${i}`);
        }
        
        chunks.push(chunkData);
        keysToDelete.push(dbKey);
      }

      // Assemble into single file Blob
      const fileBlob = new Blob(chunks, { type: 'application/octet-stream' });
      const downloadUrl = URL.createObjectURL(fileBlob);

      // Trigger automatic save
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = sessionDetails.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Cleanup IndexedDB
      await deleteChunksFromDB(keysToDelete);
      console.log('[Client] Cleanup of IndexedDB buffers completed.');
    } catch (err) {
      console.error('Assembly failure:', err);
      alert('Assembly error: ' + err.message);
    }
  };

  const handleResetProgress = () => {
    if (!window.confirm('Reset local progress and restart download from chunk 0?')) return;
    
    // Clear browser IndexedDB chunks
    const keysToDelete = [];
    for (let i = 0; i < session.totalChunks; i++) {
      keysToDelete.push(`${session.sessionId}_${i}`);
    }
    deleteChunksFromDB(keysToDelete);

    // Clear server side chunk logs
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'reset_progress' }));
    }

    const clearedProgress = Array(session.totalChunks).fill('pending');
    progressArrayRef.current = clearedProgress;
    setProgressArray(clearedProgress);
    downloadedBytesCountRef.current = 0;
    downloadStartTimeRef.current = null;
    setSpeed(0);
    setEta(null);
  };

  const getPercentProgress = () => {
    if (progressArray.length === 0) return 0;
    const completedCount = progressArray.filter(s => s === 'completed').length;
    return Math.round((completedCount / progressArray.length) * 100);
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatEta = (seconds) => {
    if (seconds === null) return '--:--';
    if (seconds === 0) return 'Finished';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  return (
    <div style={{ width: '100%' }}>
      <button className="btn-back" onClick={onBack}>
        &larr; Back to Selection
      </button>

      {!joined ? (
        <div className="glass-card" style={{ maxWidth: '500px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '10px', textAlign: 'center' }}>
            Join Share Session
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px', textAlign: 'center' }}>
            Input the Session ID code generated by the Host system to start.
          </p>

          <div className="join-form">
            <div className="input-group">
              <label className="input-label">Enter 6-Character Session ID</label>
              <input 
                type="text" 
                placeholder="E.G. A4B9X2" 
                value={sessionIdInput} 
                onChange={(e) => setSessionIdInput(e.target.value)} 
                className="input-field" 
                maxLength={6}
                style={{ textTransform: 'uppercase', textAlign: 'center', letterSpacing: '2px', fontWeight: '600' }}
              />
            </div>

            {errorMsg && (
              <div style={{ display: 'flex', gap: '8px', color: 'var(--accent-rose)', fontSize: '14px', background: 'rgba(244, 63, 94, 0.1)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(244, 63, 94, 0.2)' }}>
                <ShieldAlert size={18} />
                <span>{errorMsg}</span>
              </div>
            )}

            <button className="btn-primary" onClick={() => handleJoin()} disabled={!sessionIdInput}>
              Connect & Validate Hash handshake
            </button>
          </div>
        </div>
      ) : (
        // ── Receive session: show upload panel for mobile
        session.type === 'receive' ? (
          <div className="glass-card" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <div className="badge-offline" style={{ marginBottom: '16px', display: 'inline-flex', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--accent-emerald)' }}>
              <Wifi size={14} /> Connected — Upload Room
            </div>

            <h2 style={{ fontSize: '22px', fontWeight: '600', marginBottom: '8px' }}>
              {uploadDone ? 'Upload Complete!' : uploading ? 'Uploading File…' : 'Send a File to Laptop'}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
              {uploadDone
                ? 'Your file has been saved on the Laptop successfully.'
                : 'Select the ZIP folder or any file you want to transfer to the Laptop.'
              }
            </p>

            {!uploadDone ? (
              <>
                {/* File picker */}
                <div
                  className="drop-zone"
                  onClick={() => uploadFileInputRef.current?.click()}
                  style={{ marginBottom: '20px', cursor: 'pointer' }}
                >
                  <input
                    type="file"
                    ref={uploadFileInputRef}
                    className="file-input-hidden"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  />
                  <UploadCloud size={44} style={{ color: uploadFile ? 'var(--accent-emerald)' : 'var(--text-muted)', marginBottom: '12px', transition: 'color 0.3s' }} />
                  <p className="drop-zone-title" style={{ color: uploadFile ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {uploadFile ? uploadFile.name : 'Tap to select a file'}
                  </p>
                  <p className="drop-zone-subtitle">
                    {uploadFile ? formatBytes(uploadFile.size) : 'ZIP, images, videos, any format'}
                  </p>
                </div>

                {/* Upload progress */}
                {uploading && (
                  <div style={{ marginBottom: '20px' }}>
                    <div className="stats-cards-grid" style={{ marginBottom: '12px' }}>
                      <div className="stat-mini-card">
                        <span className="stat-label">Progress</span>
                        <span className="stat-value highlight">{uploadProgress}%</span>
                      </div>
                      <div className="stat-mini-card">
                        <span className="stat-label">Speed</span>
                        <span className="stat-value highlight-violet">{uploadSpeed} Mbps</span>
                      </div>
                    </div>
                    <div className="progress-container">
                      <div className="progress-bar-fill" style={{
                        width: `${uploadProgress}%`,
                        background: 'linear-gradient(90deg, var(--accent-emerald), var(--accent-cyan))'
                      }}></div>
                    </div>
                    <div className="progress-labels">
                      <span>Uploading to Laptop…</span>
                      <span>{uploadProgress}%</span>
                    </div>
                  </div>
                )}

                <button
                  className="btn-primary"
                  disabled={!uploadFile || uploading}
                  style={{ width: '100%', background: 'linear-gradient(135deg, var(--accent-emerald) 0%, var(--accent-cyan) 100%)' }}
                  onClick={() => {
                    if (!uploadFile || !session) return;
                    setUploading(true);
                    uploadStartRef.current = Date.now();
                    const formData = new FormData();
                    formData.append('file', uploadFile);
                    const xhr = new XMLHttpRequest();
                    xhr.open('POST', `/api/upload-to-host/${session.sessionId}`, true);
                    xhr.upload.onprogress = (e) => {
                      if (e.lengthComputable) {
                        const pct = Math.round((e.loaded / e.total) * 100);
                        setUploadProgress(pct);
                        const elapsed = (Date.now() - uploadStartRef.current) / 1000;
                        if (elapsed > 0) {
                          const spd = ((e.loaded * 8) / elapsed / (1024 * 1024)).toFixed(1);
                          setUploadSpeed(spd);
                        }
                      }
                    };
                    xhr.onload = () => {
                      setUploading(false);
                      setUploadDone(true);
                    };
                    xhr.onerror = () => {
                      setUploading(false);
                      alert('Upload failed. Check your connection.');
                    };
                    xhr.send(formData);
                  }}
                >
                  {uploading ? `Uploading ${uploadProgress}%…` : uploadFile ? `Upload "${uploadFile.name}"` : 'Select a File First'}
                </button>
              </>
            ) : (
              // Success state
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{
                  width: '80px', height: '80px', borderRadius: '50%',
                  background: 'rgba(16,185,129,0.15)', border: '2px solid rgba(16,185,129,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 20px', color: 'var(--accent-emerald)'
                }}>
                  <CheckCircle2 size={40} />
                </div>
                <h3 style={{ fontSize: '20px', fontWeight: '600', color: 'var(--accent-emerald)', marginBottom: '8px' }}>
                  File Sent Successfully!
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '15px', marginBottom: '24px' }}>
                  <strong>{uploadFile?.name}</strong> ({formatBytes(uploadFile?.size)}) has been received by your Laptop.
                </p>
                <button className="btn-secondary" onClick={() => { setUploadFile(null); setUploadDone(false); setUploadProgress(0); setUploadSpeed(0); }}>
                  Send Another File
                </button>
              </div>
            )}
          </div>
        ) : (
        // ── Send session: show download panel
        <div className="glass-card" style={{ maxWidth: '750px', margin: '0 auto' }}>
          {/* Header */}
          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '20px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '15px' }}>
              <div>
                <div className="badge-offline" style={{ marginBottom: '10px', display: 'inline-flex' }}>
                  <Wifi size={14} /> Connected to host
                </div>
                <h2 style={{ fontSize: '22px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileCheck size={22} className="logo-icon" />
                  {session.fileName}
                </h2>
              </div>
              <span className="file-size-badge" style={{ fontSize: '14px' }}>{formatBytes(session.fileSize)}</span>
            </div>
          </div>

          {!handshakeComplete ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <Lock className="logo-icon" size={40} style={{ animation: 'pulse 1s infinite alternate', marginBottom: '15px' }} />
              <h3>Deriving Elliptic Curve Shared Key...</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                Performing ECDH Prime256v1 handshake with host to secure the AES channel.
              </p>
            </div>
          ) : (
            <div className="speed-telemetry-panel">
              <div className="stats-cards-grid">
                <div className="stat-mini-card">
                  <span className="stat-label">Progress</span>
                  <span className="stat-value highlight">{getPercentProgress()}%</span>
                </div>
                <div className="stat-mini-card">
                  <span className="stat-label">Transfer Speed</span>
                  <span className="stat-value highlight-violet">{speed.toFixed(1)} Mbps</span>
                </div>
                <div className="stat-mini-card">
                  <span className="stat-label">Time Remaining</span>
                  <span className="stat-value">{formatEta(eta)}</span>
                </div>
              </div>

              <div>
                <div className="progress-container">
                  <div className="progress-bar-fill" style={{ width: `${getPercentProgress()}%` }}></div>
                </div>
                <div className="progress-labels">
                  <span>{formatBytes(downloadedBytesCountRef.current)} received</span>
                  <span>{getPercentProgress()}% complete</span>
                </div>
              </div>

              <div className="controls-row">
                {!downloading ? (
                  <button className="btn-primary" onClick={handleStartDownload} style={{ flex: '1' }}>
                    <Play size={18} /> {getPercentProgress() > 0 ? 'Resume Transfer' : 'Download Now'}
                  </button>
                ) : (
                  <button className="btn-secondary" onClick={handlePauseDownload} style={{ flex: '1', background: 'rgba(244, 63, 94, 0.05)', borderColor: 'rgba(244, 63, 94, 0.2)', color: 'var(--accent-rose)' }}>
                    <Pause size={18} /> Pause Transfer
                  </button>
                )}
                <button className="btn-secondary" onClick={handleResetProgress} disabled={downloading} title="Reset Progress">
                  <RotateCcw size={18} />
                </button>
              </div>

              <div>
                <h4 className="chunk-grid-title">Verification Hash Matrix ({session.totalChunks} chunks)</h4>
                <div className="chunk-visual-grid">
                  {progressArray.map((status, index) => (
                    <div key={index} className={`chunk-cell ${status}`} title={`Chunk #${index}: ${status}`}></div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        )
      )}
    </div>
  );
}
