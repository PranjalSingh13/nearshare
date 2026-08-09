import crypto from 'crypto';

// Generate ECDH Keypair for Host
export function generateKeypair() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    publicKey: ecdh.getPublicKey('hex'),
    ecdhInstance: ecdh
  };
}

// Compute Shared AES-256 Key from Host ECDH Instance and Client Public Key (Hex)
export function deriveSharedKey(ecdhInstance, clientPublicKeyHex) {
  const clientKeyBuffer = Buffer.from(clientPublicKeyHex, 'hex');
  const sharedSecret = ecdhInstance.computeSecret(clientKeyBuffer);
  
  // Hash the shared secret to derive a consistent 256-bit key
  return crypto.createHash('sha256').update(sharedSecret).digest();
}

// Encrypt payload using AES-256-GCM
// key: Buffer (32 bytes)
// payload: Buffer or String
export function encryptChunk(key, payload) {
  const iv = crypto.randomBytes(12); // 12-byte IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  const bufferPayload = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const encrypted = Buffer.concat([cipher.update(bufferPayload), cipher.final()]);
  const tag = cipher.getAuthTag();
  
  return {
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    ciphertext: encrypted.toString('hex')
  };
}

// Decrypt payload using AES-256-GCM
// key: Buffer (32 bytes)
// iv: Hex string
// tag: Hex string
// ciphertext: Hex string
export function decryptChunk(key, iv, tag, ciphertext) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'hex')),
    decipher.final()
  ]);
  
  return decrypted;
}

// Calculate SHA-256 checksum for integrity check
// data: Buffer
export function calculateHash(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}
