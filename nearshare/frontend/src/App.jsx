import React, { useState, useEffect } from 'react';
import { Share2, Download, Send, Wifi, Shield, Cpu, FolderDown } from 'lucide-react';
import HostDashboard from './components/HostDashboard';
import ClientView from './components/ClientView';
import './App.css';

export default function App() {
  const [view, setView] = useState('selection'); // 'selection' | 'host-send' | 'host-receive' | 'client'
  const [prefilledSessionId, setPrefilledSessionId] = useState('');

  // Check URL parameters for QR join links on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinId = params.get('join');
    if (joinId) {
      setPrefilledSessionId(joinId);
      setView('client');
    }
  }, []);

  return (
    <div className="app-container">
      {/* Top Navigation Bar */}
      <header className="app-navbar">
        <div className="logo-section">
          <Share2 className="logo-icon" size={26} />
          <span className="logo-text">NearShare</span>
        </div>
        <div className="badge-offline">
          <Wifi size={14} style={{ marginRight: '6px' }} />
          Local Offline Network
        </div>
      </header>

      {/* Main Container */}
      <main className="app-main">
        {view === 'selection' && (
          <>
            <section className="hero-section">
              <h1 className="hero-title">Local P2P File Sharing</h1>
              <p className="hero-subtitle">
                Transfer files across local networks securely. Uses application-layer ECDH handshakes, AES-256 payload encryption, and an adaptive ML optimizer for high throughput.
              </p>
            </section>

            <div className="choices-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', maxWidth: '1000px' }}>
              {/* Host Send Choice */}
              <div className="choice-panel host" onClick={() => setView('host-send')}>
                <div className="choice-icon-wrapper">
                  <Send size={32} />
                </div>
                <h3 className="choice-title">Send Files (Host)</h3>
                <p className="choice-desc">
                  Select files on this Laptop to share. Generates a QR code and join link for clients.
                </p>
              </div>

              {/* Host Receive Choice */}
              <div className="choice-panel host" onClick={() => setView('host-receive')} style={{ borderColor: 'rgba(16, 185, 129, 0.2)' }}>
                <div className="choice-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-emerald)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <FolderDown size={32} />
                </div>
                <h3 className="choice-title">Receive Files (Host)</h3>
                <p className="choice-desc">
                  Open a receive room on this Laptop. Scan from your mobile to upload files here.
                </p>
              </div>

              {/* Client Choice */}
              <div className="choice-panel client" onClick={() => setView('client')}>
                <div className="choice-icon-wrapper">
                  <Download size={32} />
                </div>
                <h3 className="choice-title">Join Session (Client)</h3>
                <p className="choice-desc">
                  Scan QR / visit join link on your phone to download files or upload to this Laptop.
                </p>
              </div>
            </div>

            {/* Quality Badges */}
            <div style={{ display: 'flex', gap: '30px', marginTop: '60px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                <Shield size={18} style={{ color: 'var(--accent-cyan)' }} />
                <span>ECDH/AES-256 Cryptography</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                <Cpu size={18} style={{ color: 'var(--accent-violet)' }} />
                <span>Feedback ML Parameter Tuning</span>
              </div>
            </div>
          </>
        )}

        {view === 'host-send' && (
          <HostDashboard initialMode="send" onBack={() => setView('selection')} />
        )}

        {view === 'host-receive' && (
          <HostDashboard initialMode="receive" onBack={() => setView('selection')} />
        )}

        {view === 'client' && (
          <ClientView 
            prefilledSessionId={prefilledSessionId} 
            onBack={() => {
              setView('selection');
              setPrefilledSessionId('');
              // Clean query string from browser bar
              window.history.pushState({}, document.title, window.location.pathname);
            }} 
          />
        )}
      </main>

      {/* Footer */}
      <footer style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px', borderTop: '1px solid rgba(255,255,255,0.02)' }}>
        NearShare File-sharing System &bull; 100% Local &bull; No internet required
      </footer>
    </div>
  );
}
