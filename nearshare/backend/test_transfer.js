import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

import { initDb, saveSession, getSession, closeDb } from './db.js';
import { generateKeypair, deriveSharedKey, encryptChunk, decryptChunk, calculateHash } from './crypto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testFilePath = path.join(__dirname, 'test_source.bin');
const testOutPath = path.join(__dirname, 'test_output.bin');

async function runTest() {
  console.log('====================================================');
  console.log('STARTING INTEGRATION TEST FOR NEARSHARE PIPELINE');
  console.log('====================================================');

  try {
    // 1. Initialize SQLite Database
    console.log('[1/7] Initializing temporary test database...');
    await initDb();
    console.log('SQLite database initialized successfully.');

    // 2. Generate a 5MB random dummy file to test chunk boundary splits
    console.log('[2/7] Generating 5MB random file...');
    const fileSize = 5 * 1024 * 1024; // 5 MB
    const fileContent = crypto.randomBytes(fileSize);
    fs.writeFileSync(testFilePath, fileContent);
    const sourceHash = calculateHash(fileContent);
    console.log(`Created file: ${testFilePath}`);
    console.log(`Original file SHA-256: ${sourceHash}`);

    // 3. Create Session with ML parameter predictions
    console.log('[3/7] Setting up session parameters...');
    const sessionId = 'TEST01';
    const chunkSize = 256 * 1024; // 256 KB chunks
    const totalChunks = Math.ceil(fileSize / chunkSize);
    const useCompression = true;

    await saveSession({
      sessionId,
      filePath: testFilePath,
      fileName: 'test_source.bin',
      fileSize,
      chunkSize,
      totalChunks
    });
    console.log(`Created DB Session ${sessionId}: ${totalChunks} chunks of size ${chunkSize} bytes.`);

    // 4. Perform ECDH Key Exchange Handshake Simulation
    console.log('[4/7] Simulating ECDH handshake...');
    
    // Host Keypair
    const hostKeypair = generateKeypair();
    
    // Client Keypair (Node.js native representation for test)
    const clientEcdh = crypto.createECDH('prime256v1');
    clientEcdh.generateKeys();
    const clientPublicKey = clientEcdh.getPublicKey('hex');

    // Both sides derive the identical 256-bit symmetric AES key
    const hostSharedAesKey = deriveSharedKey(hostKeypair.ecdhInstance, clientPublicKey);
    const clientSharedAesKey = clientEcdh.computeSecret(Buffer.from(hostKeypair.publicKey, 'hex'));
    const clientHashedAesKey = crypto.createHash('sha256').update(clientSharedAesKey).digest();

    // Verify key parity
    if (hostSharedAesKey.compare(clientHashedAesKey) !== 0) {
      throw new Error('Cryptographic Keys mismatch! ECDH key derivation failed.');
    }
    console.log('ECDH handshake completed successfully. Derived symmetric AES-256 keys match.');

    // 5. Chunk Transfer Simulation
    console.log('[5/7] Simulating chunk transfer loop...');
    const clientDecryptedChunks = [];

    for (let i = 0; i < totalChunks; i++) {
      const offset = i * chunkSize;
      const size = Math.min(chunkSize, fileSize - offset);
      
      // SENDER SIDE (Host)
      const chunkBuffer = Buffer.alloc(size);
      const fd = fs.openSync(testFilePath, 'r');
      fs.readSync(fd, chunkBuffer, 0, size, offset);
      fs.closeSync(fd);

      // Verify source chunk hash
      const chunkHash = calculateHash(chunkBuffer);

      // Compress chunk
      let payload = chunkBuffer;
      let isCompressed = false;
      if (useCompression) {
        payload = zlib.deflateSync(chunkBuffer);
        isCompressed = true;
      }

      // Encrypt chunk
      const { iv, tag, ciphertext } = encryptChunk(hostSharedAesKey, payload);

      // RECEIVER SIDE (Client)
      // Decrypt
      const decryptedPayload = decryptChunk(clientHashedAesKey, iv, tag, ciphertext);

      // Decompress
      let finalDecryptedChunk = decryptedPayload;
      if (isCompressed) {
        finalDecryptedChunk = zlib.inflateSync(decryptedPayload);
      }

      // Verify integrity checksum matches original chunk
      const decryptedChunkHash = calculateHash(finalDecryptedChunk);
      if (chunkHash !== decryptedChunkHash) {
        throw new Error(`Integrity check failed at chunk ${i}! Hash mismatch.`);
      }

      clientDecryptedChunks.push(finalDecryptedChunk);
    }
    console.log(`Transferred and verified all ${totalChunks} chunks without any packet failure.`);

    // 6. File Reassembly & Hash Verification
    console.log('[6/7] Reassembling final file...');
    const assembledBuffer = Buffer.concat(clientDecryptedChunks);
    fs.writeFileSync(testOutPath, assembledBuffer);
    const assembledHash = calculateHash(assembledBuffer);

    console.log(`Source Hash:    ${sourceHash}`);
    console.log(`Assembled Hash: ${assembledHash}`);

    if (sourceHash !== assembledHash) {
      throw new Error('Verification failed! Assembled file is corrupted.');
    }
    console.log('SUCCESS: Cryptographic reassembly check passed. Hashes are 100% identical.');

    // 7. Cleanup
    console.log('[7/7] Cleaning up files...');
    fs.unlinkSync(testFilePath);
    fs.unlinkSync(testOutPath);
    await closeDb();
    console.log('Cleanup complete.');
    console.log('====================================================');
    console.log('ALL TESTS PASSED SUCCESSFULLY! NearShare is fully functional.');
    console.log('====================================================');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ TEST RUN FAILED with error:', error);
    // Cleanup on error
    try {
      if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
      if (fs.existsSync(testOutPath)) fs.unlinkSync(testOutPath);
      await closeDb();
    } catch {}
    console.log('====================================================');
    process.exit(1);
  }
}

runTest();
