import assert from 'node:assert/strict';
import test from 'node:test';
import { corsOptions } from '../../dist/config/cors.js';

test('CORS allows the Omnimail production origin with credentials', () => {
  assert.equal(Array.isArray(corsOptions.origin), true);
  assert.equal(corsOptions.origin.includes('https://webmail.omnixys.com'), true);
  assert.equal(corsOptions.credentials, true);
});

test('CORS does not allow unknown or wildcard origins', () => {
  assert.equal(Array.isArray(corsOptions.origin), true);
  assert.equal(corsOptions.origin.includes('https://unknown.example.test'), false);
  assert.equal(corsOptions.origin.includes('*'), false);
});
