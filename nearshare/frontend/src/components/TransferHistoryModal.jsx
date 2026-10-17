import React, { useState, useEffect } from 'react';
import { 
  X, 
  Clock, 
  Send, 
  Download, 
  Trash2, 
  FolderDown, 
  HardDrive, 
  Layers, 
  FileText,
  AlertCircle,
  RefreshCw
} from 'lucide-react';

export default function TransferHistoryModal({ isOpen, onClose, token, user }) {
  const [transfers, setTransfers] = useState([]);
  const [filter, setFilter] = useState('all'); // 'all' | 'sent' | 'received'
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState('');

  const fetchHistory = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/transfers', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch transfer history.');
      }
      setTransfers(data.transfers || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen, token]);

  if (!isOpen) return null;

  const handleClearHistory = async () => {
    if (!window.confirm('Are you sure you want to clear your transfer history?')) return;
    setClearing(true);
    try {
      const res = await fetch('/api/auth/transfers', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        setTransfers([]);
      }
    } catch (err) {
      console.error('Clear history failed:', err);
    } finally {
      setClearing(false);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (isoStr) => {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString(undefined, { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch {
      return isoStr;
    }
  };

  const filteredTransfers = transfers.filter(item => {
    if (filter === 'all') return true;
    return item.direction === filter;
  });

  return (
    <div 
      className="auth-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="auth-modal-card history-modal-card">
        {/* Close button */}
        <button className="auth-modal-close" onClick={onClose} aria-label="Close modal">
          <X size={20} />
        </button>

        {/* Header */}
        <div className="history-modal-header">
          <div className="history-title-row">
            <div className="history-badge-icon">
              <Clock size={24} />
            </div>
            <div>
              <h2 className="history-title">Transfer History</h2>
              <p className="history-subtitle">
                Logged activity for <strong style={{ color: 'var(--text-primary)' }}>@{user?.username}</strong>
              </p>
            </div>
          </div>

          {transfers.length > 0 && (
            <button 
              className="history-clear-btn" 
              onClick={handleClearHistory}
              disabled={clearing}
              title="Clear transfer logs"
            >
              <Trash2 size={15} />
              <span>Clear History</span>
            </button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="history-filter-bar">
          <button 
            className={`history-filter-pill ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All Transfers ({transfers.length})
          </button>
          <button 
            className={`history-filter-pill ${filter === 'sent' ? 'active' : ''}`}
            onClick={() => setFilter('sent')}
          >
            <Send size={13} style={{ marginRight: '5px' }} />
            Sent ({transfers.filter(t => t.direction === 'sent').length})
          </button>
          <button 
            className={`history-filter-pill ${filter === 'received' ? 'active' : ''}`}
            onClick={() => setFilter('received')}
          >
            <Download size={13} style={{ marginRight: '5px' }} />
            Received ({transfers.filter(t => t.direction === 'received').length})
          </button>
        </div>

        {/* Content Body */}
        <div className="history-list-container">
          {loading ? (
            <div className="history-loading">
              <RefreshCw className="auth-spinner-icon" size={28} />
              <span>Loading transfer records...</span>
            </div>
          ) : error ? (
            <div className="auth-alert error">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          ) : filteredTransfers.length === 0 ? (
            <div className="history-empty">
              <div className="history-empty-icon">
                <FileText size={36} />
              </div>
              <h4 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>
                No transfers found
              </h4>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '320px' }}>
                {filter === 'all' 
                  ? 'Send or receive files while logged in to build your secure transfer history.'
                  : `You have no ${filter} file transfers recorded yet.`}
              </p>
            </div>
          ) : (
            <div className="history-list">
              {filteredTransfers.map((item) => (
                <div key={item.id} className="history-item">
                  <div className={`history-item-icon ${item.direction}`}>
                    {item.direction === 'sent' ? <Send size={18} /> : <Download size={18} />}
                  </div>
                  <div className="history-item-details">
                    <div className="history-item-name" title={item.file_name}>
                      {item.file_name}
                    </div>
                    <div className="history-item-meta">
                      <span className="history-size">{formatBytes(item.file_size)}</span>
                      <span className="history-dot">&bull;</span>
                      <span className="history-date">{formatDate(item.created_at)}</span>
                      {item.session_id && (
                        <>
                          <span className="history-dot">&bull;</span>
                          <span className="history-session">Room: {item.session_id}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className={`history-direction-tag ${item.direction}`}>
                    {item.direction === 'sent' ? 'Sent' : 'Received'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="history-footer">
          <span>Integrity guaranteed with ECDH + AES-256-GCM verification</span>
          <button className="btn-secondary history-close-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
