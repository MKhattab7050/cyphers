const jwt = require('jsonwebtoken');
function secret() {
 const value = process.env.JWT_SECRET_KEY || process.env.JWT_SECRET;
 if (!value) throw new Error('JWT_SECRET_KEY must be configured');
 return value;
}
function readToken(headers = {}) {
 if (headers.authorization?.startsWith('Bearer ')) return headers.authorization.slice(7);
 const cookie = (headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('jwt='));
 try { return cookie ? decodeURIComponent(cookie.slice(4)) : null; } catch { return null; }
}
function createToken(userId) { return jwt.sign({ userId }, secret(), { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }); }
function verifyToken(token) {
 const payload = jwt.verify(token, secret(), { algorithms: ['HS256'] });
 const userId = payload.userId || payload.id;
 if (!userId) throw new Error('Invalid user identity');
 return { ...payload, id: userId, userId };
}
function setAuthCookie(res, token) {
 res.cookie('jwt', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
}
module.exports = { readToken, createToken, verifyToken, setAuthCookie };
