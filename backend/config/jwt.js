function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32 || secret === 'your_very_strong_secret_key_here') {
    throw new Error('JWT_SECRET must be a unique random secret of at least 32 characters');
  }
  return secret;
}
module.exports = { getJwtSecret };
