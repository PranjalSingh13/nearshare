import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { 
  UploadCloud, 
  Copy, 
  Check, 
  Users, 
  Wifi, 
  Cpu, 
  Layers,
  FolderDown,
  CheckCircle2,
  Clock,
  HardDrive
} from 'lucide-react';

// ─────────────────────────────────────────────────────────
// HOST DASHBOARD — supports initialMode: 'send' | 'receive'
// ─────────────────────────────────────────────────────────
export default function HostDashboard({ onBack, initialMode = 'send' }) {
  // ── Send-mode state
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // ── Shared state
  const [sessionData, setSessionData] = useState(null);
  const [connectedClients, setConnectedClients] = useState([]);
  const [copied, setCopied] = useState(false);
  const [config, setConfig] = useState({ ip: 'localhost', port: 3000 });

  // ── Receive-mode state
  const [receiveStatus, setReceiveStatus] = useState('waiting');  // waiting | uploading | completed
  const [receivedBytes, setReceivedBytes] = useState(0);
  const [receiveTotalBytes, setReceiveTotalBytes] = useState(0);
  const [receivedFile, setReceivedFile] = useState(null);   // { name, size }
  const [receiveSpeed, setReceiveSpeed] = useState(0);       // Mbps
  const receiveStartTimeRef = useRef(null);
  const lastReceivedBytesRef = useRef(0);

  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const wsRef = useRef(null);

  // ── Fetch host config
  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => setConfig(data))
      .catch(err => console.error('Failed to load host config:', err));

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // ── Auto-create receive session on mount when in receive mode
  useEffect(() => {
    if (initialMode === 'receive' && !sessionData) {
      createReceiveSession();
    }
  }, [initialMode]);

  // ── Render QR after session is set
  useEffect(() => {
    if (sessionData && canvasRef.current) {
      QRCode.toCanvas(
        canvasRef.current,
        sessionData.downloadUrl,
        { width: 180, margin: 1, color: { dark: '#140d1c', light: '#ffffff' } },
        (err) => { if (err) console.error('QR error:', err); }
      );
    }
  }, [sessionData]);

  // ── Create a Receive session via backend
  const createReceiveSession = async () => {
    try {
      const res = await fetch('/api/sessions/receive', { method: 'POST' });
      const data = await res.json();
      setSessionData(data);
      connectWebSocket(data.sessionId);
    } catch (err) {
      console.error('Failed to create receive session:', err);
    }
  };

  // ── WebSocket connection
  const connectWebSocket = (sessionId) => {
    const ws = new WebSocket(`ws://${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', clientId: 'HOST_DASHBOARD', sessionId }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'clients_update') {
          setConnectedClients(msg.clients.filter(c => c !== 'HOST_DASHBOARD'));
        }

        // ── Receive-mode messages
        if (msg.type === 'upload_progress') {
          if (!receiveStartTimeRef.current) receiveStartTimeRef.current = Date.now();
          setReceiveStatus('uploading');
          setReceivedBytes(msg.uploadedBytes);
          setReceiveTotalBytes(msg.totalBytes);

          // Live speed calculation
          const elapsed = (Date.now() - receiveStartTimeRef.current) / 1000;
          if (elapsed > 0) {
            const bits = msg.uploadedBytes * 8;
            setReceiveSpeed(((bits / elapsed) / (1024 * 1024)).toFixed(1));
          }
        }

        if (msg.type === 'upload_complete') {
          setReceiveStatus('completed');
          setReceivedFile({ name: msg.fileName, size: msg.fileSize });
          setReceivedBytes(msg.fileSize);
          setReceiveTotalBytes(msg.fileSize);
        }
      } catch (err) {
        console.error('WS message error:', err);
      }
    };

    ws.onclose = () => console.log('[Host WS] Closed.');
  };

  // ── Send-mode: file drag & drop
  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files?.[0]) setFile(e.dataTransfer.files[0]);
  };
  const handleFileSelect = (e) => {
    if (e.target.files?.[0]) setFile(e.target.files[0]);
  };

  // ── Send-mode: initiate session
  const handleStartSharing = async () => {
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/sessions', true);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        setSessionData(data);
        setUploading(false);
        connectWebSocket(data.sessionId);
      } else {
        alert('Upload failed: ' + xhr.statusText);
        setUploading(false);
      }
    };
    xhr.onerror = () => { alert('Upload error.'); setUploading(false); };
    xhr.send(formData);
  };

  const handleCopyLink = () => {
    if (!sessionData) return;
    navigator.clipboard.writeText(sessionData.downloadUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const receivePercent = receiveTotalBytes > 0
    ? Math.min(100, Math.round((receivedBytes / receiveTotalBytes) * 100))
    : 0;

  // ══════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════
  return (
    <div style={{ width: '100%' }}>
      <button className="btn-back" onClick={onBack}>← Back to Selection</button>

      {/* ── SEND MODE ─────────────────────────────────────── */}
      {initialMode === 'send' && (
        <>
          {!sessionData ? (
            // File picker
            <div className="glass-card" style={{ maxWidth: '600px', margin: '0 auto' }}>
              <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '20px', textAlign: 'center' }}>
                Host a Send Session
              </h2>

              <div
                className="drop-zone"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current.click()}
                style={{ marginBottom: '24px' }}
              >
                <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="file-input-hidden" />
                <UploadCloud className="drop-zone-icon" size={48} />
                <p className="drop-zone-title">{file ? file.name : 'Drag & drop a file here'}</p>
                <p className="drop-zone-subtitle">{file ? formatBytes(file.size) : 'Or click to browse your disk'}</p>
              </div>

              {uploading && (
                <div style={{ marginBottom: '24px' }}>
                  <div className="progress-container">
                    <div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }}></div>
                  </div>
                  <div className="progress-labels">
                    <span>Uploading to server...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                </div>
              )}

              <button
                className="btn-primary"
                onClick={handleStartSharing}
                disabled={!file || uploading}
                style={{ width: '100%' }}
              >
                Start Session & Initialize ML Optimizer
              </button>
            </div>
          ) : (
            // Active send dashboard
            <div className="dashboard-grid">
              <div className="dashboard-panel-left">
                <div className="glass-card">
                  <div className="dashboard-header-info">
                    <div className="file-info-header">
                      <div className="badge-offline" style={{ marginBottom: '10px', display: 'inline-flex' }}>
                        <Wifi size={14} /> Local Session Active
                      </div>
                      <h2>{sessionData.fileName}</h2>
                      <span className="file-size-badge">{formatBytes(sessionData.fileSize)}</span>
                    </div>
                  </div>

                  <div className="stats-cards-grid">
                    <div className="stat-mini-card">
                      <span className="stat-label">Session ID</span>
                      <span className="stat-value highlight">{sessionData.sessionId}</span>
                    </div>
                    <div className="stat-mini-card">
                      <span className="stat-label">Clients</span>
                      <span className="stat-value highlight-violet">{connectedClients.length}</span>
                    </div>
                    <div className="stat-mini-card">
                      <span className="stat-label">Port</span>
                      <span className="stat-value">{config.port}</span>
                    </div>
                  </div>

                  <div className="connected-clients-card">
                    <span className="client-list-title">
                      <Users size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                      Active Clients
                    </span>
                    <div className="client-list">
                      {connectedClients.length === 0 ? (
                        <p className="empty-clients">Waiting for clients to scan QR code...</p>
                      ) : connectedClients.map((client, i) => (
                        <div key={i} className="client-list-item">
                          <div className="client-status-indicator"></div>
                          <span className="client-name">{client}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="glass-card ml-panel">
                  <div className="ml-header">
                    <Cpu size={20} />
                    <span>Adaptive ML Optimizer</span>
                    <span className="ml-badge">Active</span>
                  </div>
                  <div className="ml-metric-row">
                    <span className="ml-metric-label">Strategy</span>
                    <span className="ml-metric-value" style={{ color: 'var(--accent-violet)' }}>{sessionData.mlConfidence}</span>
                  </div>
                  <div className="ml-metric-row">
                    <span className="ml-metric-label">Chunk Size</span>
                    <span className="ml-metric-value">{formatBytes(sessionData.chunkSize)}</span>
                  </div>
                  <div className="ml-metric-row">
                    <span className="ml-metric-label">Parallel Streams</span>
                    <span className="ml-metric-value">{sessionData.parallelStreams}</span>
                  </div>
                  <div className="ml-metric-row">
                    <span className="ml-metric-label">Compression</span>
                    <span className="ml-metric-value" style={{ color: sessionData.useCompression ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>
                      {sessionData.useCompression ? 'ENABLED' : 'DISABLED'}
                    </span>
                  </div>
                  <div className="ml-metric-row">
                    <span className="ml-metric-label">Handshake</span>
                    <span className="ml-metric-value">ECDH Prime256v1</span>
                  </div>
                </div>
              </div>

              {/* QR Panel */}
              <QrPanel sessionData={sessionData} canvasRef={canvasRef} copied={copied} onCopy={handleCopyLink} totalChunks={sessionData.totalChunks} />
            </div>
          )}
        </>
      )}

      {/* ── RECEIVE MODE ───────────────────────────────────── */}
      {initialMode === 'receive' && (
        <>
          {!sessionData ? (
            <div className="glass-card" style={{ maxWidth: '500px', margin: '0 auto', textAlign: 'center', padding: '50px 30px' }}>
              <FolderDown size={48} style={{ color: 'var(--accent-emerald)', marginBottom: '16px' }} />
              <h2 style={{ fontSize: '22px', fontWeight: '600', marginBottom: '10px' }}>Opening Receive Room…</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Generating a session ID and QR code for your mobile.</p>
            </div>
          ) : (
            <div className="dashboard-grid">
              {/* Left: status panel */}
              <div className="dashboard-panel-left">
                <div className="glass-card">
                  <div className="badge-offline" style={{ marginBottom: '16px', display: 'inline-flex', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--accent-emerald)' }}>
                    <FolderDown size={14} /> Receive Room Active
                  </div>

                  <h2 style={{ fontSize: '22px', fontWeight: '600', marginBottom: '20px' }}>
                    {receiveStatus === 'completed' ? 'File Received!' : receiveStatus === 'uploading' ? 'Receiving File…' : 'Waiting for Mobile Upload…'}
                  </h2>

                  {/* Stats */}
                  <div className="stats-cards-grid">
                    <div className="stat-mini-card">
                      <span className="stat-label">Session ID</span>
                      <span className="stat-value highlight">{sessionData.sessionId}</span>
                    </div>
                    <div className="stat-mini-card">
                      <span className="stat-label">Status</span>
                      <span className="stat-value" style={{
                        color: receiveStatus === 'completed' ? 'var(--accent-emerald)' :
                               receiveStatus === 'uploading' ? 'var(--accent-cyan)' : 'var(--text-muted)',
                        fontSize: '14px'
                      }}>
                        {receiveStatus === 'waiting' ? 'Waiting…' : receiveStatus === 'uploading' ? 'Uploading' : '✓ Done'}
                      </span>
                    </div>
                    <div className="stat-mini-card">
                      <span className="stat-label">Speed</span>
                      <span className="stat-value highlight-violet">{receiveStatus === 'uploading' ? `${receiveSpeed} Mbps` : '—'}</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {receiveStatus !== 'waiting' && (
                    <div style={{ marginBottom: '20px' }}>
                      <div className="progress-container" style={{ height: '14px' }}>
                        <div
                          className="progress-bar-fill"
                          style={{
                            width: `${receivePercent}%`,
                            background: receiveStatus === 'completed'
                              ? 'linear-gradient(90deg, var(--accent-emerald), #34d399)'
                              : 'linear-gradient(90deg, var(--accent-cyan), var(--accent-violet))'
                          }}
                        ></div>
                      </div>
                      <div className="progress-labels">
                        <span>{formatBytes(receivedBytes)} received</span>
                        <span>{receivePercent}%</span>
                      </div>
                    </div>
                  )}

                  {/* Completed summary */}
                  {receiveStatus === 'completed' && receivedFile && (
                    <div style={{
                      background: 'rgba(16,185,129,0.06)',
                      border: '1px solid rgba(16,185,129,0.2)',
                      borderRadius: 'var(--radius-md)',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--accent-emerald)' }}>
                        <CheckCircle2 size={22} />
                        <span style={{ fontWeight: '600', fontSize: '16px' }}>Transfer Complete</span>
                      </div>
                      <div className="ml-metric-row">
                        <span className="ml-metric-label">File Name</span>
                        <span className="ml-metric-value" style={{ maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{receivedFile.name}</span>
                      </div>
                      <div className="ml-metric-row">
                        <span className="ml-metric-label">File Size</span>
                        <span className="ml-metric-value">{formatBytes(receivedFile.size)}</span>
                      </div>
                      <div className="ml-metric-row">
                        <span className="ml-metric-label">Saved To</span>
                        <span className="ml-metric-value" style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>backend/shared_files/</span>
                      </div>
                    </div>
                  )}

                  {/* Connected clients */}
                  <div className="connected-clients-card" style={{ marginTop: '20px' }}>
                    <span className="client-list-title">
                      <Users size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                      Connected Clients
                    </span>
                    <div className="client-list">
                      {connectedClients.length === 0 ? (
                        <p className="empty-clients">Waiting for your mobile to scan and connect…</p>
                      ) : connectedClients.map((client, i) => (
                        <div key={i} className="client-list-item">
                          <div className="client-status-indicator"></div>
                          <span className="client-name">{client}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Instructions panel */}
                <div className="glass-card" style={{ background: 'rgba(6,182,212,0.03)', border: '1px solid rgba(6,182,212,0.15)' }}>
                  <h4 style={{ color: 'var(--accent-cyan)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={18} /> How It Works
                  </h4>
                  {[
                    '1. Scan the QR code on your mobile phone',
                    '2. Select the ZIP folder or any file you want to send',
                    '3. Tap "Upload" — the file transfers to this Laptop',
                    '4. Find the received file in backend/shared_files/',
                  ].map((step, i) => (
                    <p key={i} style={{ color: 'var(--text-secondary)', fontSize: '14px', padding: '6px 0', borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
                      {step}
                    </p>
                  ))}
                </div>
              </div>

              {/* QR Panel */}
              <QrPanel
                sessionData={sessionData}
                canvasRef={canvasRef}
                copied={copied}
                onCopy={handleCopyLink}
                label="Scan to Upload a File to This Laptop"
                desc="Your mobile browser will open a simple upload page. Select any file — it will be saved securely on this device."
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Shared QR Code panel component
function QrPanel({ sessionData, canvasRef, copied, onCopy, label, desc, totalChunks }) {
  return (
    <div className="glass-card qr-card" style={{ height: 'fit-content' }}>
      <h3 style={{ fontSize: '20px', fontWeight: '600' }}>{label || 'Scan or Click to Join'}</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
        {desc || 'Clients on the same local network (WiFi / Hotspot) can join instantly by scanning this code.'}
      </p>

      <div className="qr-canvas-container">
        <canvas ref={canvasRef}></canvas>
      </div>

      <div className="join-link-box">
        <input type="text" readOnly value={sessionData.downloadUrl} className="join-link-input" />
        <button className="btn-copy" onClick={onCopy} title="Copy link">
          {copied ? <Check size={18} style={{ color: 'var(--accent-emerald)' }} /> : <Copy size={18} />}
        </button>
      </div>

      {totalChunks && (
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Layers size={14} />
          <span>Total chunks to broadcast: {totalChunks}</span>
        </div>
      )}
    </div>
  );
}
