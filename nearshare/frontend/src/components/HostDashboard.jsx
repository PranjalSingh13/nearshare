import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { 
  UploadCloud, 
  File, 
  Copy, 
  Check, 
  Sparkles, 
  Users, 
  Wifi, 
  Cpu, 
  Hourglass,
  Layers,
  ArrowRight
} from 'lucide-react';

export default function HostDashboard({ onBack }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [sessionData, setSessionData] = useState(null);
  const [connectedClients, setConnectedClients] = useState([]);
  const [copied, setCopied] = useState(false);
  const [config, setConfig] = useState({ ip: 'localhost', port: 3000 });

  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const wsRef = useRef(null);

  // Fetch host IP config on mount
  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => setConfig(data))
      .catch(err => console.error('Failed to load host config:', err));

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // Render QR Code when session data is loaded
  useEffect(() => {
    if (sessionData && canvasRef.current) {
      QRCode.toCanvas(
        canvasRef.current, 
        sessionData.downloadUrl, 
        {
          width: 180,
          margin: 1,
          color: {
            dark: '#140d1c',
            light: '#ffffff'
          }
        }, 
        (err) => {
          if (err) console.error('Failed to draw QR code:', err);
        }
      );
    }
  }, [sessionData]);

  // Connect to backend WebSocket once session is established
  const connectWebSocket = (sessionId) => {
    const wsUrl = `ws://${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[Host WS] Connected to server.');
      // Join room as HOST
      ws.send(JSON.stringify({
        type: 'join',
        clientId: 'HOST_DASHBOARD',
        sessionId
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'clients_update') {
          // Filter out host self representation
          const clients = msg.clients.filter(c => c !== 'HOST_DASHBOARD');
          setConnectedClients(clients);
        }
      } catch (err) {
        console.error('Error parsing WS message:', err);
      }
    };

    ws.onclose = () => {
      console.log('[Host WS] Closed.');
    };
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const triggerBrowse = () => {
    fileInputRef.current.click();
  };

  const handleStartSharing = async () => {
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/sessions', true);

      // Track upload percentage
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          const resData = JSON.parse(xhr.responseText);
          setSessionData(resData);
          setUploading(false);
          connectWebSocket(resData.sessionId);
        } else {
          alert('Upload failed: ' + xhr.statusText);
          setUploading(false);
        }
      };

      xhr.onerror = () => {
        alert('An error occurred during file upload.');
        setUploading(false);
      };

      xhr.send(formData);
    } catch (err) {
      console.error(err);
      setUploading(false);
    }
  };

  const handleCopyLink = () => {
    if (!sessionData) return;
    navigator.clipboard.writeText(sessionData.downloadUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div style={{ width: '100%' }}>
      <button className="btn-back" onClick={onBack}>
        &larr; Back to Selection
      </button>

      {!sessionData ? (
        <div className="glass-card" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '20px', textAlign: 'center' }}>
            Host a Share Session
          </h2>

          <div 
            className="drop-zone" 
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={triggerBrowse}
            style={{ marginBottom: '24px' }}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileSelect} 
              className="file-input-hidden" 
            />
            <UploadCloud className="drop-zone-icon" size={48} />
            <p className="drop-zone-title">
              {file ? file.name : 'Drag & drop a file here'}
            </p>
            <p className="drop-zone-subtitle">
              {file ? formatBytes(file.size) : 'Or click to browse your disk'}
            </p>
          </div>

          {uploading && (
            <div style={{ marginBottom: '24px' }}>
              <div className="progress-container">
                <div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }}></div>
              </div>
              <div className="progress-labels">
                <span>Uploading local file...</span>
                <span>{uploadProgress}%</span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button 
              className="btn-primary" 
              onClick={handleStartSharing} 
              disabled={!file || uploading}
              style={{ width: '100%' }}
            >
              Start Session & Initialize ML Optimizer
            </button>
          </div>
        </div>
      ) : (
        <div className="dashboard-grid">
          {/* Left Panel: Active Status */}
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
                  <span className="stat-label">Clients Connected</span>
                  <span className="stat-value highlight-violet">{connectedClients.length}</span>
                </div>
                <div className="stat-mini-card">
                  <span className="stat-label">Host Port</span>
                  <span className="stat-value">{config.port}</span>
                </div>
              </div>

              {/* Connected Clients */}
              <div className="connected-clients-card">
                <span className="client-list-title">
                  <Users size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                  Active Client Sockets
                </span>
                <div className="client-list">
                  {connectedClients.length === 0 ? (
                    <p className="empty-clients">Waiting for clients to scan QR code and connect...</p>
                  ) : (
                    connectedClients.map((client, index) => (
                      <div key={index} className="client-list-item">
                        <div className="client-status-indicator"></div>
                        <span className="client-name">{client}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* ML Optimization metrics panel */}
            <div className="glass-card ml-panel">
              <div className="ml-header">
                <Cpu size={20} />
                <span>Adaptive Transfer ML Optimizer</span>
                <span className="ml-badge">Active</span>
              </div>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '15px' }}>
                The local telemetry feedback loop selected optimal settings by correlating payload sizes and connection logs.
              </p>
              
              <div className="ml-metric-row">
                <span className="ml-metric-label">Decision Strategy</span>
                <span className="ml-metric-value" style={{ color: 'var(--accent-violet)' }}>
                  {sessionData.mlConfidence}
                </span>
              </div>
              <div className="ml-metric-row">
                <span className="ml-metric-label">Predicted Optimal Chunk Size</span>
                <span className="ml-metric-value">{formatBytes(sessionData.chunkSize)}</span>
              </div>
              <div className="ml-metric-row">
                <span className="ml-metric-label">Optimal Parallel Socket Count</span>
                <span className="ml-metric-value">{sessionData.parallelStreams} Streams</span>
              </div>
              <div className="ml-metric-row">
                <span className="ml-metric-label">Payload Compression (zlib-deflate)</span>
                <span className="ml-metric-value" style={{ color: sessionData.useCompression ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>
                  {sessionData.useCompression ? 'ENABLED' : 'DISABLED'}
                </span>
              </div>
              <div className="ml-metric-row">
                <span className="ml-metric-label">Handshake Exchange Schema</span>
                <span className="ml-metric-value">ECDH Prime256v1</span>
              </div>
            </div>
          </div>

          {/* Right Panel: Join Credentials */}
          <div className="glass-card qr-card" style={{ height: 'fit-content' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '600' }}>Scan or Click to Join</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
              Clients on the same local network (WiFi / Hotspot) can join instantly by scanning this code.
            </p>

            <div className="qr-canvas-container">
              <canvas ref={canvasRef}></canvas>
            </div>

            <div className="join-link-box">
              <input 
                type="text" 
                readOnly 
                value={sessionData.downloadUrl} 
                className="join-link-input" 
              />
              <button className="btn-copy" onClick={handleCopyLink} title="Copy link">
                {copied ? <Check size={18} style={{ color: 'var(--accent-emerald)' }} /> : <Copy size={18} />}
              </button>
            </div>
            
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Layers size={14} />
              <span>Total chunks to broadcast: {sessionData.totalChunks}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
