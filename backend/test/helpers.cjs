const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const path = require('node:path');
function load(file, overrides = {}) {
  const pass = (req, res, next) => next();
  overrides = { '../middleware/rateLimit': { authIpLimiter: pass, authAccountLimiter: pass,
    resetAccountLimiter: pass, notificationLimiter: pass, notificationIpLimiter: pass, contactIpLimiter: pass }, ...overrides };
  const filename = path.resolve(file);
  const requireReal = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, require: name => name in overrides ? overrides[name] : requireReal(name),
    process, console: { log() {}, error() {} }, Buffer, Date, Map, setTimeout, clearTimeout
  }, { filename });
  return module.exports;
}
async function serve(t, express, router) {
  const app = express(); app.use(express.json()); app.use(router);
  app.use((err, req, res, next) => res.status(500).json({ message: err.message }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return async (method, url, body, headers = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${url}`, {
      method, headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  };
}
const guard = (req, res, next) => {
  if (!req.headers.authorization) return res.status(401).json({ message: 'Login required' });
  req.user = { _id: '111111111111111111111111', userType: 'farmer' };
  req.userId = '111111111111111111111111';
  req.companyId = '222222222222222222222222';
  req.companyRole = 'admin';
  next();
};
module.exports = { load, serve, guard };
