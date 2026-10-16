const db = require('../config/db');
const FriendRequest = require('./friendRequestModel');
const Friend = require('./friendModel');
const crypto = require('crypto');
async function createUser(name, email, password) {
 const username = 'User-' + crypto.randomBytes(8).toString('hex');
 const result = await db.query('INSERT INTO users (name, username, email, password) VALUES (?, ?, ?, ?)', [name, username, email, password]);
 return result.insertId;
}
async function findUserByEmail(email) { return (await db.query('SELECT * FROM users WHERE email = ?', [email]))[0] || null; }
async function findUserById(id) { return (await db.query('SELECT * FROM users WHERE id = ?', [id]))[0] || null; }
async function getUserByUsername(username) { return (await db.query('SELECT * FROM users WHERE username = ?', [username]))[0] || null; }
async function usernameFor(id) {
 const user = await findUserById(id);
 if (!user?.username) throw new Error('User not found');
 return user.username;
}
async function pair(a,b) { return Promise.all([usernameFor(a), usernameFor(b)]); }
async function areFriends(a,b) { return FriendRequest.areFriends(...await pair(a,b)); }
async function hasPendingRequest(a,b) { return Boolean(await FriendRequest.getExistingRequest(...await pair(a,b))); }
async function saveFriendRequest(a,b) { return FriendRequest.sendFriendRequest(...await pair(a,b)); }
async function updateFriendRequest(a,b,accepted) {
 const id = await FriendRequest.getRequestIdByUsers(...await pair(a,b));
 if (!id) throw new Error('Friend request not found');
 return FriendRequest.respondToRequest(id, accepted ? 'accepted' : 'declined');
}
async function addFriendship(a,b) { return FriendRequest.addFriendship(...await pair(a,b)); }
async function removeFriendship(a,b) { return FriendRequest.removeFriend(...await pair(a,b)); }
async function getFriendsList(id) { return Friend.getFriends(await usernameFor(id)); }
async function getFriendRequests(id) { return FriendRequest.getIncomingRequests(await usernameFor(id)); }
async function getPendingRequests(id) { return FriendRequest.getOutgoingRequests(await usernameFor(id)); }
async function createNotification(userId,type,content,relatedId) {
 return db.query('INSERT INTO notifications (user_id, type, content, related_id) VALUES (?, ?, ?, ?)', [userId,type,content,relatedId]);
}
module.exports = { createUser, findUserByEmail, findUserById, getUserByUsername, areFriends, hasPendingRequest, saveFriendRequest, updateFriendRequest, addFriendship, removeFriendship, getFriendsList, getFriendRequests, getPendingRequests, createNotification };
