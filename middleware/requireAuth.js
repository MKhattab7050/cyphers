const { readToken, verifyToken } = require('../config/auth');
const db = require('../dbp');
module.exports = async function requireAuth(req, res, next) {
 try {
  const identity = verifyToken(readToken(req.headers));
  const [rows] = await db.execute('SELECT id, username, name, email FROM users WHERE id = ?', [identity.userId]);
  if (!rows[0]) return res.status(401).json({ message: 'User no longer exists' });
  req.user = rows[0];
  next();
 } catch (error) {
  if (error.code) return res.status(503).json({ message: 'Database unavailable' });
  return res.status(401).json({ message: 'Please log in again' });
 }
};
