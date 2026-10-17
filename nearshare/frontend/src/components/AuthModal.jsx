import React, { useState } from 'react';
import { 
  X, 
  LogIn, 
  UserPlus, 
  Mail, 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  Sparkles,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';

export default function AuthModal({ isOpen, onClose, onAuthSuccess }) {
  const [tab, setTab] = useState('login'); // 'login' | 'signup'
  
  // Login fields
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  // Signup fields
  const [signupUsername, setSignupUsername] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupDisplayName, setSignupDisplayName] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  
  // UI states
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  const resetForm = () => {
    setError('');
    setSuccessMsg('');
  };

  const handleSwitchTab = (newTab) => {
    setTab(newTab);
    resetForm();
  };

  // Quick autofill demo credentials for testing
  const fillDemoAccount = () => {
    if (tab === 'login') {
      setLoginIdentifier('pilot');
      setLoginPassword('nearshare2026');
    } else {
      const rand = Math.floor(Math.random() * 899 + 100);
      setSignupUsername(`user_${rand}`);
      setSignupEmail(`user${rand}@nearshare.local`);
      setSignupDisplayName(`P2P Explorer ${rand}`);
      setSignupPassword('nearshare2026');
      setSignupConfirmPassword('nearshare2026');
    }
    setError('');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!loginIdentifier.trim() || !loginPassword) {
      setError('Please fill in both username/email and password.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          login: loginIdentifier.trim(),
          password: loginPassword
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login failed. Please check your credentials.');
      }

      setSuccessMsg(`Welcome back, ${data.user.displayName || data.user.username}!`);
      setTimeout(() => {
        onAuthSuccess(data.user, data.token);
        onClose();
      }, 600);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!signupUsername.trim()) {
      setError('Username is required.');
      return;
    }
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(signupUsername.trim())) {
      setError('Username must be 3-30 alphanumeric characters or underscores.');
      return;
    }
    if (!signupEmail.trim() || !signupEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (signupPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (signupPassword !== signupConfirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: signupUsername.trim(),
          email: signupEmail.trim(),
          displayName: signupDisplayName.trim() || signupUsername.trim(),
          password: signupPassword
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Registration failed.');
      }

      setSuccessMsg(`Account created! Welcome to NearShare, ${data.user.displayName || data.user.username}!`);
      setTimeout(() => {
        onAuthSuccess(data.user, data.token);
        onClose();
      }, 700);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="auth-modal-overlay" 
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="auth-modal-card">
        {/* Close Button */}
        <button className="auth-modal-close" onClick={onClose} aria-label="Close modal">
          <X size={20} />
        </button>

        {/* Modal Header */}
        <div className="auth-modal-header">
          <div className="auth-modal-icon-badge">
            <ShieldCheck size={28} className="auth-shield-icon" />
          </div>
          <h2 className="auth-modal-title">
            {tab === 'login' ? 'Sign In to NearShare' : 'Create Your Account'}
          </h2>
          <p className="auth-modal-subtitle">
            {tab === 'login' 
              ? 'Access saved transfer histories, custom identity & seamless P2P rooms'
              : 'Join NearShare for encrypted peer transfers with saved activity logs'}
          </p>
        </div>

        {/* Tabs */}
        <div className="auth-tabs">
          <button 
            type="button"
            className={`auth-tab-btn ${tab === 'login' ? 'active' : ''}`}
            onClick={() => handleSwitchTab('login')}
          >
            <LogIn size={16} />
            <span>Sign In</span>
          </button>
          <button 
            type="button"
            className={`auth-tab-btn ${tab === 'signup' ? 'active' : ''}`}
            onClick={() => handleSwitchTab('signup')}
          >
            <UserPlus size={16} />
            <span>Register</span>
          </button>
        </div>

        {/* Error / Success Notifications */}
        {error && (
          <div className="auth-alert error">
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="auth-alert success">
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form Body */}
        {tab === 'login' ? (
          <form onSubmit={handleLogin} className="auth-form">
            <div className="auth-input-group">
              <label>Username or Email</label>
              <div className="auth-input-wrapper">
                <User size={18} className="auth-input-icon" />
                <input 
                  type="text"
                  placeholder="e.g. pilot or pilot@nearshare.local"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  autoFocus
                  required
                />
              </div>
            </div>

            <div className="auth-input-group">
              <label>Password</label>
              <div className="auth-input-wrapper">
                <Lock size={18} className="auth-input-icon" />
                <input 
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                />
                <button 
                  type="button" 
                  className="auth-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button 
              type="submit" 
              className="auth-submit-btn" 
              disabled={loading}
            >
              {loading ? (
                <div className="auth-spinner" />
              ) : (
                <>
                  <LogIn size={18} />
                  <span>Sign In</span>
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignup} className="auth-form">
            <div className="auth-input-row">
              <div className="auth-input-group">
                <label>Username</label>
                <div className="auth-input-wrapper">
                  <User size={18} className="auth-input-icon" />
                  <input 
                    type="text"
                    placeholder="e.g. alex_p2p"
                    value={signupUsername}
                    onChange={(e) => setSignupUsername(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
              </div>

              <div className="auth-input-group">
                <label>Display Name (optional)</label>
                <div className="auth-input-wrapper">
                  <Sparkles size={18} className="auth-input-icon" />
                  <input 
                    type="text"
                    placeholder="Alex Mercer"
                    value={signupDisplayName}
                    onChange={(e) => setSignupDisplayName(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="auth-input-group">
              <label>Email Address</label>
              <div className="auth-input-wrapper">
                <Mail size={18} className="auth-input-icon" />
                <input 
                  type="email"
                  placeholder="alex@domain.com"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="auth-input-row">
              <div className="auth-input-group">
                <label>Password (min 6 chars)</label>
                <div className="auth-input-wrapper">
                  <Lock size={18} className="auth-input-icon" />
                  <input 
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    required
                  />
                  <button 
                    type="button" 
                    className="auth-password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="auth-input-group">
                <label>Confirm Password</label>
                <div className="auth-input-wrapper">
                  <Lock size={18} className="auth-input-icon" />
                  <input 
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={signupConfirmPassword}
                    onChange={(e) => setSignupConfirmPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            <button 
              type="submit" 
              className="auth-submit-btn" 
              disabled={loading}
            >
              {loading ? (
                <div className="auth-spinner" />
              ) : (
                <>
                  <UserPlus size={18} />
                  <span>Create Free Account</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* Demo Quick-Fill Bar */}
        <div className="auth-demo-bar">
          <span>Testing?</span>
          <button type="button" onClick={fillDemoAccount} className="auth-demo-btn">
            <Sparkles size={14} />
            <span>Auto-fill {tab === 'login' ? 'Test Credentials' : 'New Sample User'}</span>
          </button>
        </div>

        {/* Guest Note */}
        <div className="auth-guest-note">
          Guest sharing is always available without an account. Sign in to save transfer history across sessions.
        </div>
      </div>
    </div>
  );
}
