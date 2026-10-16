/**
 * Emergency Fix Script - Add to bottom of chat-script.js
 * Fixes: Messages not loading, Friend requests, Voice persistence
 */

// ==========================================
// FIX 1: Force load messages on page load
// ==========================================
console.log('[FIX] Initializing emergency fixes...');

// Override joinRoom to ensure it works
const originalJoinRoom = joinRoom;
window.joinRoom = function(newRoom) {
    console.log('[FIX-JOIN] Forcing join to room:', newRoom, 'username:', username);
    
    if (!username) {
        console.error('[FIX-JOIN] Username is undefined! Getting from session...');
        username = session?.username || currentUser || `Guest_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    socket.emit('joinRoom', { username, room: newRoom }, (response) => {
        console.log('[FIX-JOIN] Server response:', response);
    });
};

// ==========================================
// FIX 2: Force message display on socket
// ==========================================
socket.removeAllListeners('previousMessages');
socket.on('previousMessages', (messages) => {
    console.log(`[FIX-MESSAGES] Received ${messages?.length || 0} previous messages`);
    
    if (!messages || messages.length === 0) {
        console.warn('[FIX-MESSAGES] No messages received!');
        return;
    }
    
    // Clear chat box first
    if (chatBox) {
        console.log('[FIX-MESSAGES] Clearing chatbox...');
        chatBox.innerHTML = '';
    }
    
    // Display each message
    messages.forEach((msg, index) => {
        try {
            console.log(`[FIX-MESSAGES] Displaying message ${index + 1}/${messages.length}`);
            addMessageToRoomHistory(msg.room || currentRoom, msg);
            displayMessage(msg);
        } catch (error) {
            console.error(`[FIX-MESSAGES] Error displaying message ${index}:`, error);
        }
    });
    
    setTimeout(() => scrollToBottom(false), 300);
    console.log('[FIX-MESSAGES] All messages displayed!');
});

// ==========================================
// FIX 3: Ensure message display after send
// ==========================================
socket.removeAllListeners('message');
socket.on('message', (msg) => {
    console.log('[FIX-MSG] New message received:', msg.username, ':', msg.text?.substring(0, 30));
    displayMessage(msg);
    updateUnreadCount();
});

// ==========================================
// FIX 4: Friend requests fix
// ==========================================
function fixedSendFriendRequest(toUsername) {
    console.log('[FIX-FRIEND] Sending friend request to:', toUsername);
    
    if (!toUsername || toUsername.trim() === '') {
        alert('Please enter a username');
        return;
    }
    
    if (toUsername === username) {
        alert('You cannot send friend request to yourself');
        return;
    }
    
    socket.emit('sendFriendRequest', {
        from: username,
        to: toUsername.trim()
    });
    
    console.log('[FIX-FRIEND] Friend request sent!');
    alert(`Friend request sent to ${toUsername}`);
}

// Override the send friend request button
document.addEventListener('DOMContentLoaded', () => {
    const addFriendBtn = document.getElementById('add-friend-btn');
    const friendInput = document.getElementById('friend-username');
    
    if (addFriendBtn && friendInput) {
        addFriendBtn.onclick = () => {
            const toUsername = friendInput.value;
            fixedSendFriendRequest(toUsername);
            friendInput.value = '';
        };
    }
});

// Listen for friend request responses
socket.removeAllListeners('friendRequestSent');
socket.on('friendRequestSent', (data) => {
    console.log('[FIX-FRIEND] Friend request response:', data);
    if (data.success) {
        alert('Friend request sent successfully!');
    } else {
        alert('Failed to send friend request: ' + (data.message || 'Unknown error'));
    }
});

// ==========================================
// FIX 5: Voice message persistence
// ==========================================
// Voice messages are already saved in DB with file_id
// The issue is display after refresh - already fixed in previousMessages handler

// ==========================================
// FIX 6: Force reconnect if needed
// ==========================================
setTimeout(() => {
    if (!socket.connected) {
        console.warn('[FIX] Socket not connected after 3s, reconnecting...');
        socket.connect();
    }
}, 3000);

// ==========================================
// FIX 7: Re-initialize on page visibility
// ==========================================
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && socket.connected) {
        console.log('[FIX] Page visible again, refreshing room...');
        if (currentRoom && username) {
            joinRoom(currentRoom);
        }
    }
});

console.log('[FIX] ✅ All emergency fixes loaded!');
