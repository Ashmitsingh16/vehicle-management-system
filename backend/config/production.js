module.exports = function validateProduction(env = process.env) {
  if (env.NODE_ENV !== 'production') return;
  const missing = ['MONGO_URI', 'JWT_SECRET', 'FRONTEND_URL', 'CORS_ORIGIN'].filter(key => !env[key]);
  if (missing.length) throw new Error('Missing production settings: ' + missing.join(', '));
  if (env.JWT_SECRET.length < 32 || /your_|change_this|secret_key_here/i.test(env.JWT_SECRET)) throw new Error('Set a unique JWT_SECRET with at least 32 characters');
  if (env.DEMO_MODE === 'true') throw new Error('Disable DEMO_MODE in production');
  const origins = env.CORS_ORIGIN.split(',').map(value => value.trim());
  for (const value of [env.FRONTEND_URL, ...origins]) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Production origins must be HTTPS origins without paths or credentials');
  }
};
