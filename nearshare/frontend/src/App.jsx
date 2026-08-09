import React, { useState, useEffect } from 'react';
import { Share2, Download, Send, Wifi, Shield, Cpu } from 'lucide-react';
import HostDashboard from './components/HostDashboard';
import ClientView from './components/ClientView';
import './App.css';

export default function App() {
  const [view, setView] = useState('selection'); // 'selection' | 'host' | 'client'
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

            <div className="choices-grid">
              {/* Host Choice */}
              <div className="choice-panel host" onClick={() => setView('host')}>
                <div className="choice-icon-wrapper">
                  <Send size={32} />
                </div>
                <h3 className="choice-title">Host a Session</h3>
                <p className="choice-desc">
                  Select a local file to share. We will spin up a session and generate a scan-to-download QR code.
                </p>
              </div>

              {/* Client Choice */}
              <div className="choice-panel client" onClick={() => setView('client')}>
                <div className="choice-icon-wrapper">
                  <Download size={32} />
                </div>
                <h3 className="choice-title">Join a Session</h3>
                <p className="choice-desc">
                  Enter a 6-character room code or connect via scanned links to securely pull active file packets.
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

        {view === 'host' && (
          <HostDashboard onBack={() => setView('selection')} />
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
