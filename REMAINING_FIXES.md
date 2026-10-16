# Remaining Fixes To Apply

## Critical Security & Functionality Issues

### 1. Reconnection After Disconnect (Client)
**Location**: chat-script.js

**Current Issue**: After disconnect, socket gets new ID and user is outside rooms

**Fix**: Replace connect/connect_error handlers with:
```javascript
let hasConnectedBefore = false;
const DEFAULT_PLACEHOLDER = chatInput.placeholder;

socket.on('connect', () => {
    registerUserOnline();
    if (hasConnectedBefore) {
        // reconnect
        chatBox.innerHTML = '';
        joinRoom(currentRoom);
        socket.emit('getFriendsList', username);
        socket.emit('getPendingRequests', { username });
    }
    hasConnectedBefore = true;
});

socket.on('connect_error', (error) => {
    console.error('[SOCKET] Connection error:', error);
    // Removed: alert() that fires on every retry
});
```

**Remove**: EMERGENCY-FIX block at end of file (re-joins empty rooms)

---

### 2. AI Room Styling Persistence (Client)
**Location**: chat-script.js - handleRoomSwitch function

**Current Issue**: Blue color, placeholder, and hidden online count persist after leaving AI room

**Fix**: Add after `roomName.textContent = newRoom;`:
```javascript
roomName.style.color = '';
chatInput.placeholder = DEFAULT_PLACEHOLDER;
onlineUsersDisplay.style.display = 'flex';
```

---

### 3. @Mentions Not Working (Server)
**Location**: server.js - updateUserCount function

**Current Issue**: Server doesn't send roomUsers, so client can't @mention

**Fix**: Replace updateUserCount with:
```javascript
function updateUserCount(room) {
    const roomUsers = io.sockets.adapter.rooms.get(room);
    io.to(room).emit('roomUserCount', { room, count: roomUsers ? roomUsers.size : 0 });
    const users = roomUsers
        ? [...roomUsers].map(id => io.sockets.sockets.get(id)).filter(s => s && s.username).map(s => ({ username: s.username }))
        : [];
    io.to(room).emit('roomUsers', { room, users });
}
```

---

### 4. Friend Request System (Server)
**Location**: server.js - handleSendFriendRequest and handleGetFriendsList

**Current Issues**:
- sendFriendRequest doesn't use callback parameter
- getFriendsList doesn't handle string username
- No online status in friend lists

**Fixes**:

A) Add helpers at top of server.js:
```javascript
const getUsernameFrom = (data, socket) =>
    (typeof data === 'string' ? data : data?.username) || socket.username;

const withOnline = (list) => {
    const arr = Array.isArray(list) ? list : (list ? [list] : []);
    return arr.map(f => ({ ...f, friend_online: isUserOnline(f.friend_username || f.username) }));
};
```

B) Update handleGetFriendsList:
```javascript
const username = getUsernameFrom(data, socket);
// ...
friends: withOnline(friends)
```

C) Update handleSendFriendRequest signature:
```javascript
const handleSendFriendRequest = async (data, socket, callback) => {
```

Add at start:
```javascript
if (socket.username && from !== socket.username) return callback?.({ success: false, error: 'Invalid sender' });
if (from === to) return callback?.({ success: false, error: "You can't add yourself" });
```

After every `socket.emit('friendRequestSent', ...)`, add:
```javascript
callback?.({ success: true });
// or on error:
callback?.({ success: false, error: message });
```

D) Update socket.on registration:
```javascript
socket.on('sendFriendRequest', (data, cb) => handleSendFriendRequest(data, socket, cb));
```

E) Update updateFriendsListForUser:
```javascript
userSocket.emit('friendsListUpdated', withOnline(friendsList));
```

---

### 5. Voice Recorder Double Start (Client)
**Location**: chat-script.js - startVoiceRecording function

**Fix**: Add at very beginning:
```javascript
if (isRecording) return;
```

---

### 6. Empty Message Submit (Client)
**Location**: chat-script.js - form submit handler

**Current Issue**: Pressing Enter on empty input shows alert

**Fix**: Replace condition:
```javascript
if (!message) return;  // silent, no alert
if (message.length > CONFIG.MAX_MESSAGE_LENGTH) {
    alert(`Message must be at most ${CONFIG.MAX_MESSAGE_LENGTH} characters.`);
    return;
}
```

---

### 7. Context Menu Warnings (Client)
**Location**: chat-script.js - handleContextMenuAction

**Current Issue**: Edit/Delete on others' messages says "coming soon"

**Fix**: Replace the else clause:
```javascript
if (action === 'edit' || action === 'delete') {
    showNotification(`You can only ${action} your own messages`, { type: 'warning', sound: false });
} else {
    showNotification(`${action} feature coming soon!`, { type: 'info', duration: 2000 });
}
```

---

### 8. Logout Socket Disconnect (Client)
**Location**: chat-script.js - leaveRoomBtn click handler

**Fix**: Add before redirect:
```javascript
socket.disconnect();
```

---

### 9. AI Timeouts (Server & Client)
**Server**: server.js - callChatCompletion and keyless fetch

**Change**:
- `timeoutMs = 45000` → `20000`
- `timeoutMs: 30000` → `20000`

**Client**: chat-script.js - TIMEOUT_MS

**Change**: `120000` → `150000`

---

### 10. Trust Proxy (Server)
**Location**: server.js - after app creation

**Add if behind nginx/Cloudflare**:
```javascript
app.set('trust proxy', 1);
```

---

## Known Limitations

1. **Underscore in Usernames**: Guest names like `Guest_ab12cd` break private room message loading because rooms split on `_`. Need to see `getPrivateMessages` function to fix.

2. **No Real Authentication**: `/upload` and socket connections accept any username. Security decision for you.

3. **Pin/Forward**: Client-only, not persisted.

---

## Testing Checklist After All Fixes

- [ ] Send message in General → appears in other tab
- [ ] Edit message → updates in other tab, persists after refresh
- [ ] Delete message → removes in other tab, gone after refresh
- [ ] React to message → shows in other tab
- [ ] Send friend request → accept → both lists update, online status correct
- [ ] Private chat → send message while in General → red dot appears, notification shows, message NOT in General
- [ ] Disconnect network 10s → reconnect → send message → arrives
- [ ] Upload .exe file → error message
- [ ] Upload file with `"` in name → displays safely, no script execution
- [ ] Send link with `"` → displays as text link, no XSS
- [ ] @ai in AI room → get response → return to General → styling resets
- [ ] Press Enter on empty input → silent (no alert)
- [ ] Start voice record → press again immediately → ignored (no double)
