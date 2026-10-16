// ==========================================
// EMERGENCY COMPREHENSIVE FIX - FINAL
// ==========================================

console.log('[EMERGENCY-FINAL] Installing comprehensive fixes...');

// Wait for everything to load
setTimeout(() => {

// 1. Force previousMessages to work
socket.removeAllListeners('previousMessages');
socket.on('previousMessages', function(messages) {
    console.log(`[EMERGENCY-FINAL] Received ${messages?.length || 0} previous messages`);
    
    if (!messages || !Array.isArray(messages)) {
        console.error('[EMERGENCY-FINAL] Invalid messages format');
        return;
    }
    
    if (messages.length === 0) {
        console.warn('[EMERGENCY-FINAL] No messages to display');
        return;
    }
    
    // Clear chatbox
    const chatBox = document.getElementById('chat-box');
    if (chatBox) {
        console.log('[EMERGENCY-FINAL] Clearing chatbox...');
        chatBox.innerHTML = '';
    }
    
    // Display each message
    let displayed = 0;
    messages.forEach((msg, index) => {
        try {
            if (msg && msg.username && typeof displayMessage === 'function') {
                displayMessage(msg);
                displayed++;
            }
        } catch (error) {
            console.error(`[EMERGENCY-FINAL] Error displaying message ${index}:`, error);
        }
    });
    
    console.log(`[EMERGENCY-FINAL] Successfully displayed ${displayed}/${messages.length} messages`);
    
    // Scroll to bottom
    setTimeout(() => {
        if (chatBox) {
            chatBox.scrollTop = chatBox.scrollHeight;
        }
    }, 300);
});

// 2. Force message event to work
socket.removeAllListeners('message');
socket.on('message', function(msg) {
    console.log('[EMERGENCY-FINAL] New message:', msg.username);
    try {
        if (typeof displayMessage === 'function') {
            displayMessage(msg);
        }
    } catch (error) {
        console.error('[EMERGENCY-FINAL] Error displaying new message:', error);
    }
});

// 3. Friend request fix
socket.removeAllListeners('friendRequestSent');
socket.on('friendRequestSent', function(data) {
    console.log('[EMERGENCY-FINAL] Friend request sent:', data);
    if (data.success) {
        alert('✅ Friend request sent successfully!');
        const input = document.getElementById('friend-username');
        if (input) input.value = '';
    } else {
        alert('❌ Failed to send friend request: ' + (data.message || 'Unknown error'));
    }
});

socket.removeAllListeners('newFriendRequest');
socket.on('newFriendRequest', function(request) {
    console.log('[EMERGENCY-FINAL] New friend request received:', request);
    alert(`👋 New friend request from ${request.from_user}!`);
    
    // Add to requests list
    if (typeof friends !== 'undefined' && friends.requests) {
        friends.requests.push(request);
        if (typeof updateFriendRequests === 'function') {
            updateFriendRequests();
        }
    }
});

// 4. Override send friend request button
const addFriendBtn = document.getElementById('add-friend-btn');
if (addFriendBtn) {
    addFriendBtn.onclick = function(e) {
        e.preventDefault();
        const input = document.getElementById('friend-username');
        const toUsername = input ? input.value.trim() : '';
        
        if (!toUsername) {
            alert('Please enter a username');
            return;
        }
        
        // Get current username
        const from = typeof username !== 'undefined' ? username : 
                     (typeof currentUser !== 'undefined' ? currentUser : null);
        
        if (!from) {
            alert('Error: Current user not found');
            return;
        }
        
        if (toUsername === from) {
            alert('You cannot send friend request to yourself');
            return;
        }
        
        console.log('[EMERGENCY-FINAL] Sending friend request:', from, '→', toUsername);
        socket.emit('sendFriendRequest', {
            from: from,
            to: toUsername
        });
    };
    console.log('[EMERGENCY-FINAL] Friend request button override installed');
}

// 5. Force reload messages if empty after 3 seconds
setTimeout(function() {
    const chatBox = document.getElementById('chat-box');
    const messageCount = chatBox ? chatBox.children.length : 0;
    console.log('[EMERGENCY-FINAL] Message count after 3s:', messageCount);
    
    if (messageCount === 0) {
        const room = typeof currentRoom !== 'undefined' ? currentRoom : 'General';
        const user = typeof username !== 'undefined' ? username : 
                     (typeof currentUser !== 'undefined' ? currentUser : null);
                     
        if (user) {
            console.warn('[EMERGENCY-FINAL] No messages loaded! Forcing reload...');
            socket.emit('joinRoom', { username: user, room: room });
        }
    }
}, 3000);

// 6. Periodic connection check
setInterval(function() {
    if (!socket.connected) {
        console.warn('[EMERGENCY-FINAL] Socket disconnected! Reconnecting...');
        socket.connect();
    }
}, 15000);

console.log('[EMERGENCY-FINAL] ✅ All fixes installed successfully!');

}, 500); // Wait 500ms for everything to load
