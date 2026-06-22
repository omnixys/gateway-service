import { handleAuth } from '../../dist/app.module.js';
import { ContextAccessor } from '@omnixys/context';
import assert from 'node:assert/strict';
import test from 'node:test';

test('parallel gateway requests retain isolated request identifiers', async () => {
  const run = (requestId, delay) =>
    ContextAccessor.run(
      { requestId, correlationId: `correlation-${requestId}` },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return handleAuth({ headers: {}, body: { query: 'query { me { id } }' } });
      },
    );

  const [first, second] = await Promise.all([
    run('first', 10),
    run('second', 1),
  ]);
  assert.equal(first.requestId, 'first');
  assert.equal(second.requestId, 'second');
  assert.equal(first.correlationId, 'correlation-first');
  assert.equal(second.correlationId, 'correlation-second');
});
