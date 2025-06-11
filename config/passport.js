const GoogleStrategy = require('passport-google-oauth20').Strategy;
const passport = require('passport');
const jwt = require('jsonwebtoken');
const db = require('../config/db'); // تأكد من المسار الصحيح
require('dotenv').config();

// إنشاء JWT Token
const createToken = (userId) => {
  return jwt.sign(
    { userId }, 
    process.env.JWT_SECRET_KEY, 
    { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
  );
};

// Google Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // البحث عن المستخدم أولاً
    const [existingUser] = await db.execute(
      'SELECT * FROM users WHERE google_id = ? OR email = ?', 
      [profile.id, profile.emails[0].value]
    );

    if (existingUser.length > 0) {
      // المستخدم موجود، قم بتحديث google_id إذا لم يكن موجود
      if (!existingUser[0].google_id) {
        await db.execute(
          'UPDATE users SET google_id = ? WHERE id = ?',
          [profile.id, existingUser[0].id]
        );
      }
      return done(null, existingUser[0]);
    }

    // إنشاء مستخدم جديد
    const [result] = await db.execute(
      'INSERT INTO users (name, email, google_id, created_at) VALUES (?, ?, ?, NOW())',
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

module.exports = { passport, createToken }; 