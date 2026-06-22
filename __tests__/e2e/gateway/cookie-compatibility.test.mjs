import { appendCookieHeaders } from '../../../dist/app.module.js';
import assert from 'node:assert/strict';
import test from 'node:test';

test('federated authentication results set compatibility cookies', () => {
  const headers = new Map();
  appendCookieHeaders({
    response: {
      http: { headers: { set: (name, value) => headers.set(name, value) } },
      body: {
        singleResult: {
          data: {
            credentialsLogin: {
              accessToken: 'access',
              refreshToken: 'refresh',
              expiresIn: 300,
              refreshExpiresIn: 1800,
            },
          },
        },
      },
    },
  });

  const cookies = headers.get('set-cookie');
  assert.equal(cookies.length, 3);
  assert.match(cookies[0], /^access_token=access;/);
  assert.match(cookies[1], /^refresh_token=refresh;/);
});

test('federated logout clears all compatibility cookies', () => {
  const headers = new Map();
  appendCookieHeaders({
    response: {
      http: { headers: { set: (name, value) => headers.set(name, value) } },
      body: { singleResult: { data: { logout: { ok: true } } } },
    },
  });
  const cookies = headers.get('set-cookie');
  assert.equal(cookies.length, 3);
  assert.ok(cookies.every((cookie) => cookie.includes('Max-Age=0')));
});
