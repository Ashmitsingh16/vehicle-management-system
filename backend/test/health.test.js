const test = require('node:test');
const assert = require('node:assert/strict');
const health = require('../middleware/health');

async function check(connection) {
  const result = { code: 200, headers: {} };
  const res = {
    set(k, v) { result.headers[k] = v; return this; },
    status(code) { result.code = code; return this; },
    json(body) { result.body = body; return this; }
  };
  await health(connection)({}, res);
  return result;
}
test('readiness reports disconnected and failed databases without exposing errors', async () => {
  for (const connection of [
    { readyState: 0 },
    { readyState: 1, db: { command: async () => { throw Error('sensitive details'); } } }
  ]) {
    const result = await check(connection);
    assert.equal(result.code, 503);
    assert.deepEqual(result.body, { status: 'unavailable' });
    assert.equal(result.headers['Cache-Control'], 'no-store');
  }
});
test('readiness pings the connected database with a deadline', async () => {
  const result = await check({ readyState: 1, db: { command: async (cmd, options) => {
    assert.deepEqual(cmd, { ping: 1 });
    assert.equal(options.timeoutMS, 2000);
  } } });
  assert.equal(result.code, 200);
  assert.deepEqual(result.body, { status: 'OK' });
});
