import { createServer } from 'http';
import { initDb, closeDb } from './db.js';

async function testApi() {
  // Dynamically import server or launch a test instance
  const baseUrl = 'http://localhost:3000';

  console.log('--- E2E API Auth Testing ---');

  const testUser = {
    username: 'testpilot_' + Date.now().toString(36),
    email: 'pilot_' + Date.now().toString(36) + '@nearshare.local',
    password: 'SecurePassword2026!',
    displayName: 'Test Pilot'
  };

  // 1. Sign up
  console.log(`1. Testing /api/auth/signup with @${testUser.username}...`);
  const signupRes = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testUser)
  });
  const signupData = await signupRes.json();
  console.log('Signup status:', signupRes.status, signupData.success ? 'SUCCESS' : 'FAILED');
  if (signupRes.status !== 201 || !signupData.token) {
    throw new Error('Signup failed: ' + JSON.stringify(signupData));
  }
  const token = signupData.token;

  // 2. Duplicate signup check
  console.log('2. Testing duplicate signup rejection...');
  const dupRes = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testUser)
  });
  console.log('Duplicate status:', dupRes.status, dupRes.status === 409 ? 'PASS (409 Conflict)' : 'FAIL');
  if (dupRes.status !== 409) throw new Error('Duplicate username should be rejected with 409');

  // 3. Login with credentials
  console.log('3. Testing /api/auth/login with valid credentials...');
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      login: testUser.username,
      password: testUser.password
    })
  });
  const loginData = await loginRes.json();
  console.log('Login status:', loginRes.status, loginData.success ? 'SUCCESS' : 'FAILED');
  if (loginRes.status !== 200 || !loginData.token) throw new Error('Login failed');

  // 4. Login with bad password
  console.log('4. Testing /api/auth/login with wrong password...');
  const badLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      login: testUser.username,
      password: 'WrongPassword'
    })
  });
  console.log('Bad login status:', badLoginRes.status, badLoginRes.status === 401 ? 'PASS (401 Unauthorized)' : 'FAIL');
  if (badLoginRes.status !== 401) throw new Error('Bad password was not rejected');

  // 5. Test /api/auth/me
  console.log('5. Testing /api/auth/me (Protected route)...');
  const meRes = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const meData = await meRes.json();
  console.log('Me status:', meRes.status, meData.user?.username === testUser.username ? 'PASS' : 'FAIL');
  if (meRes.status !== 200 || meData.user?.username !== testUser.username) {
    throw new Error('Get me failed: ' + JSON.stringify(meData));
  }

  // 6. Test save transfer & fetch transfers
  console.log('6. Testing /api/auth/transfers (Record and fetch)...');
  const addTransferRes = await fetch(`${baseUrl}/api/auth/transfers`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}` 
    },
    body: JSON.stringify({
      sessionId: 'ROOM77',
      direction: 'sent',
      fileName: 'dataset_2026.zip',
      fileSize: 104857600
    })
  });
  const addTransferData = await addTransferRes.json();
  console.log('Add transfer status:', addTransferRes.status, addTransferData.success ? 'PASS' : 'FAIL');

  const getTransfersRes = await fetch(`${baseUrl}/api/auth/transfers`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const getTransfersData = await getTransfersRes.json();
  console.log('Get transfers count:', getTransfersData.transfers?.length, getTransfersData.transfers?.length >= 1 ? 'PASS' : 'FAIL');
  if (!getTransfersData.transfers || getTransfersData.transfers.length === 0) {
    throw new Error('Failed to retrieve saved transfer');
  }

  // 7. Test clear transfers
  console.log('7. Testing DELETE /api/auth/transfers (Clear history)...');
  const clearRes = await fetch(`${baseUrl}/api/auth/transfers`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const clearData = await clearRes.json();
  console.log('Clear transfers status:', clearRes.status, clearData.success ? 'PASS' : 'FAIL');

  console.log('\n=========================================');
  console.log(' ALL AUTHENTICATION E2E TESTS PASSED! ');
  console.log('=========================================');
}

// Start backend and run tests
import('./server.js').then(() => {
  // Give server 500ms to listen
  setTimeout(() => {
    testApi()
      .then(() => process.exit(0))
      .catch(err => {
        console.error('Test failure:', err);
        process.exit(1);
      });
  }, 600);
});
