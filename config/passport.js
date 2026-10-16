const GoogleStrategy = require('passport-google-oauth20').Strategy;
const passport = require('passport');
const jwt = require('jsonwebtoken');
const db = require('../dbp'); // تأكد من المسار الصحيح
require('dotenv').config();

// إنشاء JWT Token
const { createToken } = require('./auth');
const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

// Google Strategy
if (googleEnabled) passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL
}, async (accessToken, refreshToken, profile, done) => {
  try {
    if (!profile.emails?.[0]?.value) return done(new Error('Google account has no email'));
    // البحث عن المستخدم أولاً
    const [existingUser] = await db.execute(
      'SELECT * FROM users WHERE google_id = ? OR email = ?', 
      [profile.id, profile.emails?.[0]?.value]
    );

    if (existingUser.length > 0) {
      // المستخدم موجود، قم بتحديث google_id إذا لم يكن موجود
      if (!existingUser[0].google_id) {
        await db.execute(
          'UPDATE users SET google_id = ? WHERE id = ?',
          [profile.id, existingUser[0].id]
        );
      }
      if (!existingUser[0].username) {
        existingUser[0].username = 'Google-' + profile.id;
        await db.execute('UPDATE users SET username = ? WHERE id = ?', [existingUser[0].username, existingUser[0].id]);
      }
      return done(null, existingUser[0]);
    }

    // إنشاء مستخدم جديد
    const [result] = await db.execute(
      'INSERT INTO users (name, email, google_id, username, created_at) VALUES (?, ?, ?, ?, NOW())',
      [
        profile.displayName,
        profile.emails[0].value,
        profile.id
      ]
    );

    const newUser = {
      id: result.insertId,
      name: profile.displayName,
      email: profile.emails[0].value,
      username: 'Google-' + profile.id,
      google_id: profile.id
    };

    return done(null, newUser);
  } catch (error) {
    console.error('Google OAuth Error:', error);
    return done(error, null);
  }
}));

// Serialize user (for session, if needed)
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [id]);
    done(null, rows[0]);
  } catch (error) {
    done(error, null);
  }
});

module.exports = { passport, createToken, googleEnabled }; 