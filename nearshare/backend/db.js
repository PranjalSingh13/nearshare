import sqlite3 from 'sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, 'nearshare.db');

let db;

export function initDb() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Failed to open SQLite database:', err);
        return reject(err);
      }
      
      db.serialize(() => {
        // Sessions table
        db.run(`
          CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            file_path TEXT,
            file_name TEXT,
            file_size INTEGER,
            chunk_size INTEGER,
            total_chunks INTEGER,
            created_at TEXT
          )
        `);

        // Chunks status table
        db.run(`
          CREATE TABLE IF NOT EXISTS chunk_status (
            client_id TEXT,
            session_id TEXT,
            chunk_index INTEGER,
            status TEXT,
            sha256 TEXT,
            PRIMARY KEY (client_id, session_id, chunk_index)
          )
        `);

        // Users table
        db.run(`
          CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL COLLATE NOCASE,
            email TEXT UNIQUE NOT NULL COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            display_name TEXT,
            avatar_color TEXT,
            created_at TEXT
          )
        `);

        // User transfers history table
        db.run(`
          CREATE TABLE IF NOT EXISTS user_transfers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            session_id TEXT,
            direction TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_size INTEGER,
            created_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `);

        // Safe migration: Add user_id column to sessions if not present
        db.run(`ALTER TABLE sessions ADD COLUMN user_id TEXT`, () => {
          // Ignore error if column already exists
        });

        // Telemetry logs for ML
        db.run(`
          CREATE TABLE IF NOT EXISTS telemetry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_extension TEXT,
            file_size INTEGER,
            num_clients INTEGER,
            chunk_size_used INTEGER,
            compression_used INTEGER,
            throughput_mbps REAL,
            timestamp TEXT
          )
        `, (err) => {
          if (err) return reject(err);
          resolve(db);
        });
      });
    });
  });
}

// Session queries
export function saveSession({ sessionId, filePath, fileName, fileSize, chunkSize, totalChunks, userId = null }) {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT OR REPLACE INTO sessions (session_id, file_path, file_name, file_size, chunk_size, total_chunks, created_at, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    db.run(query, [sessionId, filePath, fileName, fileSize, chunkSize, totalChunks, new Date().toISOString(), userId], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

export function getSession(sessionId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM sessions WHERE session_id = ?', [sessionId], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

// Chunk status queries
export function saveChunkStatus({ clientId, sessionId, chunkIndex, status, sha256 }) {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT OR REPLACE INTO chunk_status (client_id, session_id, chunk_index, status, sha256)
      VALUES (?, ?, ?, ?, ?)
    `;
    db.run(query, [clientId, sessionId, chunkIndex, status, sha256], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

export function getClientProgress(clientId, sessionId) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT chunk_index, status, sha256 
      FROM chunk_status 
      WHERE client_id = ? AND session_id = ?
    `;
    db.all(query, [clientId, sessionId], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

export function resetClientProgress(clientId, sessionId) {
  return new Promise((resolve, reject) => {
    const query = 'DELETE FROM chunk_status WHERE client_id = ? AND session_id = ?';
    db.run(query, [clientId, sessionId], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

// Telemetry/ML logs queries
export function saveTelemetry({ fileExtension, fileSize, numClients, chunkSizeUsed, compressionUsed, throughputMbps }) {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO telemetry (file_extension, file_size, num_clients, chunk_size_used, compression_used, throughput_mbps, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    db.run(query, [fileExtension, fileSize, numClients, chunkSizeUsed, compressionUsed, throughputMbps, new Date().toISOString()], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

export function getTelemetryLogs() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM telemetry ORDER BY id DESC', [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

// User Management Queries
export function createUser({ id, username, email, passwordHash, salt, displayName, avatarColor }) {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO users (id, username, email, password_hash, salt, display_name, avatar_color, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    db.run(query, [id, username, email, passwordHash, salt, displayName || username, avatarColor, new Date().toISOString()], function(err) {
      if (err) return reject(err);
      resolve({ id, username, email, displayName: displayName || username, avatarColor });
    });
  });
}

export function getUserByUsername(username) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [username], (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

export function getUserByEmail(email) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE email = ? COLLATE NOCASE', [email], (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

export function getUserByLogin(login) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE (username = ? OR email = ?) COLLATE NOCASE', [login, login], (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

export function getUserById(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT id, username, email, display_name, avatar_color, created_at FROM users WHERE id = ?', [id], (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

// User Transfer History Queries
export function saveUserTransfer({ userId, sessionId, direction, fileName, fileSize }) {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO user_transfers (user_id, session_id, direction, file_name, file_size, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    db.run(query, [userId, sessionId || null, direction, fileName, fileSize || 0, new Date().toISOString()], function(err) {
      if (err) return reject(err);
      resolve({ id: this.lastID });
    });
  });
}

export function getUserTransfers(userId) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT id, session_id, direction, file_name, file_size, created_at 
      FROM user_transfers 
      WHERE user_id = ? 
      ORDER BY id DESC 
      LIMIT 100
    `;
    db.all(query, [userId], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

export function clearUserTransfers(userId) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM user_transfers WHERE user_id = ?', [userId], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

export function closeDb() {
  return new Promise((resolve, reject) => {
    if (!db) return resolve();
    db.close((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}
