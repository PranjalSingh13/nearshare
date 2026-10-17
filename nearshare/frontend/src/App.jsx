import React, { useState, useEffect, useRef } from 'react';
import { 
  Share2, 
  Download, 
  Send, 
  Wifi, 
  Shield, 
  Cpu, 
  FolderDown, 
  User, 
  LogIn, 
  LogOut, 
  Clock, 
  ChevronDown, 
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import HostDashboard from './components/HostDashboard';
import ClientView from './components/ClientView';
import AuthModal from './components/AuthModal';
import TransferHistoryModal from './components/TransferHistoryModal';
import './App.css';

export default function App() {
  const [view, setView] = useState('selection'); // 'selection' | 'host-send' | 'host-receive' | 'client'
  const [prefilledSessionId, setPrefilledSessionId] = useState('');

  // Authentication State
  const [token, setToken] = useState(() => localStorage.getItem('nearshare_token') || '');
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('nearshare_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Check URL parameters for QR join links on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinId = params.get('join');
    if (joinId) {
      setPrefilledSessionId(joinId);
      setView('client');
    }
  }, []);

  // Validate authentication token with backend on boot
  useEffect(() => {
    if (token) {
      fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => {
        if (!res.ok) throw new Error('Token expired or invalid');
        return res.json();
      })
      .then(data => {
        if (data.user) {
          setUser(data.user);
          localStorage.setItem('nearshare_user', JSON.stringify(data.user));
        }
      })
      .catch(() => {
        // Clear invalid token
        setToken('');
        setUser(null);
        localStorage.removeItem('nearshare_token');
        localStorage.removeItem('nearshare_user');
      });
    }
  }, [token]);

  // Close user dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAuthSuccess = (newUser, newToken) => {
    setUser(newUser);
    setToken(newToken);
    localStorage.setItem('nearshare_user', JSON.stringify(newUser));
    localStorage.setItem('nearshare_token', newToken);
  };

  const handleLogout = () => {
    setUser(null);
    setToken('');
    setUserMenuOpen(false);
    localStorage.removeItem('nearshare_user');
    localStorage.removeItem('nearshare_token');
  };

  return (
    <div className="app-container">
      {/* Top Navigation Bar */}
      <header className="app-navbar">
        <div className="logo-section" style={{ cursor: 'pointer' }} onClick={() => setView('selection')}>
          <Share2 className="logo-icon" size={26} />
          <span className="logo-text">NearShare</span>
        </div>

        <div className="nav-right-section">
          <div className="badge-offline">
            <Wifi size={14} style={{ marginRight: '6px' }} />
            Local Offline Network
          </div>

          {user ? (
            <div className="user-menu-container" ref={dropdownRef}>
              <button 
                className="user-profile-btn" 
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                aria-expanded={userMenuOpen}
              >
                <div 
                  className="user-avatar-circle" 
                  style={{ background: user.avatarColor || 'linear-gradient(135deg, #a855f7, #6366f1)' }}
                >
                  {(user.displayName || user.username || 'U').charAt(0).toUpperCase()}
                </div>
                <span className="user-name-text">
                  {user.displayName || user.username}
                </span>
                <ChevronDown size={14} style={{ opacity: 0.7 }} />
              </button>

              {userMenuOpen && (
                <div className="user-dropdown-menu">
                  <div className="user-dropdown-header">
                    <div className="dropdown-user-name">{user.displayName || user.username}</div>
                    <div className="dropdown-user-email">@{user.username} &bull; {user.email}</div>
                  </div>
                  <button 
                    className="user-dropdown-item" 
                    onClick={() => {
                      setUserMenuOpen(false);
                      setIsHistoryModalOpen(true);
                    }}
                  >
                    <Clock size={16} />
                    <span>Transfer History</span>
                  </button>
                  <button 
                    className="user-dropdown-item logout" 
                    onClick={handleLogout}
                  >
                    <LogOut size={16} />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="guest-badge" title="Guest transfers enabled with zero friction">
                <span>Guest Mode</span>
              </div>
              <button 
                className="nav-auth-btn" 
                onClick={() => setIsAuthModalOpen(true)}
              >
                <LogIn size={15} />
                <span>Sign In / Register</span>
              </button>
            </div>
          )}
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
              {user && (
                <div style={{ 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  padding: '6px 16px', 
                  borderRadius: '20px', 
                  background: 'rgba(168, 85, 247, 0.1)', 
                  border: '1px solid rgba(168, 85, 247, 0.3)',
                  marginTop: '16px',
                  fontSize: '13px',
                  color: 'var(--text-primary)'
                }}>
                  <Sparkles size={15} style={{ color: 'var(--accent-violet)' }} />
                  <span>Logged in as <strong>@{user.username}</strong> &bull; Transfers automatically logged to your account</span>
                </div>
              )}
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
          <HostDashboard 
            initialMode="send" 
            onBack={() => setView('selection')} 
            token={token}
            user={user}
          />
        )}

        {view === 'host-receive' && (
          <HostDashboard 
            initialMode="receive" 
            onBack={() => setView('selection')} 
            token={token}
            user={user}
          />
        )}

        {view === 'client' && (
          <ClientView 
            prefilledSessionId={prefilledSessionId} 
            token={token}
            user={user}
            onBack={() => {
              setView('selection');
              setPrefilledSessionId('');
              // Clean query string from browser bar
              window.history.pushState({}, document.title, window.location.pathname);
            }} 
          />
        )}
      </main>

      {/* Auth Modal */}
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
      />

      {/* Transfer History Modal */}
      <TransferHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        token={token}
        user={user}
      />

      {/* Footer */}
      <footer style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px', borderTop: '1px solid rgba(255,255,255,0.02)' }}>
        NearShare File-sharing System &bull; 100% Local &bull; No internet required
      </footer>
    </div>
  );
}
