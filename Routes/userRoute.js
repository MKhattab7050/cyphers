const express = require('express');
const router = express.Router();
const userController = require('../Controllers/userController');
const requireAuth = require('../middleware/requireAuth');

// Authentication routes
router.post('/signup', userController.registerUser);
router.post('/guest', userController.guestUser);
router.post('/login', userController.loginUser);

// Profile route (protected)
router.get('/profile', requireAuth, userController.getProfile);

// User routes
router.get('/:userId', requireAuth, userController.findUser);
router.get('/', requireAuth, userController.getAllUsers);

// Google OAuth routes
router.get('/auth/google', userController.authGoogle);
router.get('/auth/google/callback', userController.authGoogleCallback, (req, res) => {
  res.redirect('/chat');
});

module.exports = router;