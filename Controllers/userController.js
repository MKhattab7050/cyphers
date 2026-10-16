const bcrypt = require('bcryptjs');
const validator = require('validator');
const crypto = require('crypto');
const db = require('../dbp');
const { passport, googleEnabled } = require('../config/passport');
const { createToken, setAuthCookie } = require('../config/auth');
function signedIn(res, user) {
 const token = createToken(user.id);
 setAuthCookie(res, token);
 return res.json({ _id: user.id, id: user.id, name: user.name, username: user.username, email: user.email, token });
}
async function registerUser(req, res) {
 const { name, email, password } = req.body || {};
 if (typeof name !== 'string' || !name.trim() || name.length > 100 || typeof email !== 'string' || !validator.isEmail(email) || typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 72) {
  return res.status(400).json({ message: 'Enter a name, valid email and a password of 8–72 bytes.' });
 }
 try {
  const username = 'User-' + crypto.randomBytes(8).toString('hex');
  const hash = await bcrypt.hash(password, 10);
  const [result] = await db.execute('INSERT INTO users (name, username, email, password) VALUES (?, ?, ?, ?)', [name.trim(), username, email.trim().toLowerCase(), hash]);
  return signedIn(res, { id: result.insertId, name: name.trim(), username, email: email.trim().toLowerCase() });
 } catch (error) {
  return res.status(error.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ message: error.code === 'ER_DUP_ENTRY' ? 'Email already registered' : 'Registration failed' });
 }
}
async function loginUser(req, res) {
 const { email, password } = req.body || {};
 if (typeof email !== 'string' || typeof password !== 'string') return res.status(400).json({ message: 'Email and password are required' });
 try {
  const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);
  const user = rows[0];
  if (!user?.password || !await bcrypt.compare(password, user.password)) return res.status(401).json({ message: 'Invalid email or password' });
  if (!user.username) {
   user.username = 'User-' + user.id + '-' + crypto.randomBytes(5).toString('hex');
   await db.execute('UPDATE users SET username = ? WHERE id = ?', [user.username, user.id]);
  }
  return signedIn(res, user);
 } catch { return res.status(500).json({ message: 'Login failed' }); }
}
async function guestUser(req, res) {
 try {
  const username = 'Guest-' + crypto.randomUUID();
  const [result] = await db.execute('INSERT INTO users (username, name) VALUES (?, ?)', [username, username]);
  return signedIn(res, { id: result.insertId, username, name: username });
 } catch { return res.status(503).json({ message: 'Unable to start guest session. Check the database connection.' }); }
}
const getProfile = (req, res) => res.json(req.user);
async function findUser(req, res) {
 try {
  const [rows] = await db.execute('SELECT id, username, name, avatar, status FROM users WHERE id = ?', [req.params.userId]);
  return rows[0] ? res.json({ user: rows[0] }) : res.status(404).json({ message: 'User not found' });
 } catch { return res.status(500).json({ message: 'Unable to fetch user' }); }
}
async function getAllUsers(req, res) {
 try {
  const [rows] = await db.execute('SELECT id, username, name, avatar, status FROM users LIMIT 100');
  return res.json(rows);
 } catch { return res.status(500).json({ message: 'Unable to fetch users' }); }
}
function authGoogle(req, res, next) {
 if (!googleEnabled) return res.status(503).json({ message: 'Google login is not configured' });
 return passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
}
function authGoogleCallback(req, res, next) {
 if (!googleEnabled) return res.redirect('/login?error=google_not_configured');
 passport.authenticate('google', { session: false }, (err, user) => {
  if (err || !user) return res.redirect('/login?error=google_auth_failed');
  setAuthCookie(res, createToken(user.id));
  res.redirect('/chat');
 })(req, res, next);
}
module.exports = { registerUser, loginUser, guestUser, getProfile, findUser, getAllUsers, authGoogle, authGoogleCallback };
