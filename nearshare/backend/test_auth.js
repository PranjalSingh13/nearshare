import { initDb, closeDb } from './db.js';
import { hashPassword, verifyPassword, generateToken, verifyToken } from './auth.js';

async function runTests() {
  console.log('--- Testing Auth Cryptography ---');
  const password = 'SecretPassword123!';
  const { hash, salt } = hashPassword(password);
  console.log('Hashed password successfully. Salt length:', salt.length, 'Hash length:', hash.length);

  const isValid = verifyPassword(password, hash, salt);
  console.log('Password verification with correct password:', isValid ? 'PASS' : 'FAIL');
  if (!isValid) throw new Error('Password verification failed');

  const isInvalid = verifyPassword('WrongPassword', hash, salt);
  console.log('Password verification with wrong password:', !isInvalid ? 'PASS' : 'FAIL');
  if (isInvalid) throw new Error('Wrong password matched unexpectedly');

  console.log('--- Testing Token Signing & Verification ---');
  const token = generateToken({ id: 'usr_test123', username: 'alice', email: 'alice@test.com' });
  console.log('Generated JWT token:', token.substring(0, 30) + '...');

  const verified = verifyToken(token);
  console.log('Token verified payload:', verified);
  if (!verified || verified.username !== 'alice') throw new Error('Token verification failed');

  const tamperedToken = token.slice(0, -3) + 'abc';
  const tamperedVerified = verifyToken(tamperedToken);
  console.log('Tampered token verification result:', tamperedVerified === null ? 'PASS (rejected)' : 'FAIL');
  if (tamperedVerified !== null) throw new Error('Tampered token was not rejected');

  console.log('All auth unit tests passed successfully!');
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
