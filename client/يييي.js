const socket = io(window.location.origin);

// Configuration
const CONFIG = {
    STORAGE_KEY: 'chat_user_session',
    DEFAULT_ROOM: 'General',
    MAX_MESSAGE_LENGTH: 500,
    MAX_MESSAGES_DISPLAY: 200,
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_FILE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'audio/mpeg', 'application/pdf'],
    MESSAGE_HISTORY_KEY: 'chat_message_history'
};

// Utility Functions
const sanitizeHTML = (text) => {
    if (!text) return '';
    const temp = document.createElement('div');
    temp.textContent = text;
    return temp.innerHTML;
};

// Elements
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatBox = document.getElementById('chat-box');
const roomName = document.getElementById('room-name');
const rooms = document.querySelectorAll('.room-btn');
const usernameDisplay = document.getElementById('username-display');
const replyContainer = document.getElementById('reply-container');
const replyCancelBtn = document.getElementById('reply-cancel');
const leaveRoomBtn = document.getElementById('leave-room');
const sendButton = document.getElementById("send-btn");
const fileInput = document.getElementById("file-input");
const uploadButton = document.getElementById("upload");
const onlineUsersElement = document.getElementById('online-users');

// Session Management
function createOrGetSession() {
    try {
        let sessionData = sessionStorage.getItem(CONFIG.STORAGE_KEY);
        if (sessionData) {
            try {
                const parsedData = JSON.parse(sessionData);
                if (parsedData && parsedData.username && parsedData.room) {
                    return parsedData;
                }
            } catch (error) {
                console.error('Failed to parse session data:', error);
            }
        }

        const localStorageUser = localStorage.getItem('user');
        if (localStorageUser) {
            try {
                const userData = JSON.parse(localStorageUser);
                if (userData && userData.name && typeof userData.name === 'string') {
                    const sessionInfo = {
                        username: userData.name.trim(),
                        room: CONFIG.DEFAULT_ROOM,
                        loginTimestamp: Date.now(),
                    };
                    sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(sessionInfo));
                    return sessionInfo;
                }
            } catch (error) {
                console.error('Failed to parse user data:', error);
            }
        }

        const guestUsername = `Guest_${Math.random().toString(36).substring(2, 11)}`;
        const guestSession = {
            username: guestUsername,
            room: CONFIG.DEFAULT_ROOM,
            loginTimestamp: Date.now(),
        };
        sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(guestSession));
        return guestSession;
    } catch (error) {
        console.error('Session creation error:', error);
        return null;
    }
}

// Message Storage
function saveMessageToHistory(room, message) {
    try {
        const history = getMessageHistory();
        if (!history[room]) {
            history[room] = [];
        }
        
        const exists = history[room].some(msg => 
            msg.id === message.id || 
            (msg.timestamp === message.timestamp && msg.username === message.username)
        );
        
        if (!exists) {
            history[room].push(message);
            
            if (history[room].length > CONFIG.MAX_MESSAGES_DISPLAY) {
                history[room] = history[room].slice(-CONFIG.MAX_MESSAGES_DISPLAY);
            }
            
            localStorage.setItem(CONFIG.MESSAGE_HISTORY_KEY, JSON.stringify(history));
        }
    } catch (error) {
        console.error('Error saving message to history:', error);
    }
}

function getMessageHistory() {
    try {
        const history = localStorage.getItem(CONFIG.MESSAGE_HISTORY_KEY);
        return history ? JSON.parse(history) : {};
    } catch (error) {
        console.error('Error getting message history:', error);
        return {};
    }
}

function clearMessageHistory(room) {
    try {
        const history = getMessageHistory();
        if (history[room]) {
            delete history[room];
            localStorage.setItem(CONFIG.MESSAGE_HISTORY_KEY, JSON.stringify(history));
        }
    } catch (error) {
        console.error('Error clearing message history:', error);
    }
}

// Initialize Session
const session = createOrGetSession();
if (!session || !session.username || !session.room) {
    alert('Unable to create session. Please try refreshing the page.');
    throw new Error('Session creation failed');
}

let username = session.username;
let currentRoom = session.room;
let currentReplyMessage = null;

// Update UI
if (usernameDisplay) usernameDisplay.textContent = username;
if (roomName) roomName.textContent = currentRoom;

// Smooth Scrolling
function smoothScroll() {
    if (chatBox) {
        chatBox.scrollTop = chatBox.scrollHeight;
    }
}

// Display Message function
function displayMessage(msg, isHistory = false) {
    try {
        if (!msg || !msg.username || !chatBox) return;

        if (!isHistory) {
            saveMessageToHistory(currentRoom, msg);
        }

        const messageElement = document.createElement('div');
        messageElement.classList.add(
            'message',
            msg.username === username ? 'sent' : 'received'
        );
        messageElement.dataset.messageId = msg.id || Date.now();

        let replyData = null;
        if (msg.replyTo) {
            try {
                replyData = typeof msg.replyTo === 'string' ? JSON.parse(msg.replyTo) : msg.replyTo;
                if (!replyData.username || !replyData.text) {
                    replyData = null;
                }
            } catch (error) {
                console.error('Error parsing reply data:', error);
                replyData = null;
            }
        }

        const safeUsername = sanitizeHTML(msg.username);
        const safeText = sanitizeHTML(msg.text || '');
        const timestamp = new Date(msg.timestamp || Date.now()).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });

        let mediaHTML = '';
        if (msg.mediaUrl && msg.mediaType) {
            if (msg.mediaType.startsWith('image/')) {
                mediaHTML = `
                    <div class="message-media">
                        <img src="${msg.mediaUrl}" alt="Uploaded image" class="chat-image">
                    </div>
                `;
            } else if (msg.mediaType.startsWith('video/')) {
                mediaHTML = `
                    <div class="message-media">
                        <video controls class="chat-video">
                            <source src="${msg.mediaUrl}" type="${msg.mediaType}">
                        </video>
                    </div>
                `;
            } else if (msg.mediaType.startsWith('audio/')) {
                mediaHTML = `
                    <div class="message-media">
                        <audio controls class="chat-audio">
                            <source src="${msg.mediaUrl}" type="${msg.mediaType}">
                        </audio>
                    </div>
                `;
            } else {
                mediaHTML = `
                    <div class="message-media">
                        <a href="${msg.mediaUrl}" target="_blank" class="chat-file">
                            📎 Download File (${msg.mediaType})
                        </a>
                    </div>
                `;
            }
        }

        messageElement.innerHTML = `
            <div class="message-header">
                <span class="username">${safeUsername}</span>
                <span class="timestamp">${timestamp}</span>
            </div>
            ${replyData ? `
                <div class="replied-message">
                    <span class="replied-username">${safeUsername}</span>
                    <span class="replied-text">${safeText}</span>
                </div>
            ` : ''}
            <div class="message-content">
                ${mediaHTML}
                ${safeText ? `<div class="message-text">${safeText}</div>` : ''}
            </div>
            <div class="message-actions">
                <button class="reply-btn">Reply</button>
            </div>
        `;

// إضافة class جديد للزر Reply
// إضافة class جديد للزر Reply
const replyBtn = messageElement.querySelector('.reply-btn');
if (replyBtn) {
    replyBtn.classList.add('custom-reply-btn');  // إضافة class جديد للزر

    // إخفاء الزر في البداية
    replyBtn.style.display = 'none';  // إخفاء الزر عند البداية
  

    // عند مرور الماوس يظهر الزر
    messageElement.addEventListener('mouseenter', () => {
        replyBtn.style.display = 'none';
    });

    // عند خروج الماوس يختفي الزر
    messageElement.addEventListener('mouseleave', () => {
        if (!currentReplyMessage) {
            replyBtn.style.opacity = 0;  // إخفاء الزر مرة تانية
        }
    });

    // عند الضغط على الزر
    replyBtn.addEventListener('click', () => {
        currentReplyMessage = {
            id: msg.id || Date.now(),
            username: msg.username,
            text: msg.text || ''
        };

        if (replyContainer) {
            replyContainer.innerHTML = `
                <div class="reply-preview">
                    <span>Replying to ${msg.username}</span>
                </div>
                <button id="reply-cancel" class="cancel-btn">×</button>
            `;
            replyContainer.style.display = 'flex';

            const newCancelBtn = document.getElementById('reply-cancel');
            if (newCancelBtn) {
                newCancelBtn.addEventListener('click', () => {
                    currentReplyMessage = null;
                    replyContainer.style.display = 'none';
                    replyBtn.style.opacity = 0;  // إخفاء الزر بعد الرد
                });
            }
        }
    


// CSS لتنسيق زر الـ Reply
const style = document.createElement('style');
style.innerHTML = `
    .message-actions .reply-btn {
        display-'none';
    }

    .message-actions .reply-btn.custom-reply-btn:hover {
        color: white;  /* لما الماوس عليه يظهر النص */
        position: absolute;
        right: 10px;
        bottom: 10px;
        font-size: 8px;  /* تكبير حجم الخط عند المرور */
    }


`;
document.head.appendChild(style);




            

        
                
                if (chatInput) chatInput.focus();
            });
        }

        chatBox.appendChild(messageElement);
        smoothScroll();
    } catch (error) {
        console.error('Error displaying message:', error);
    }
}

// Load Message History
function loadMessageHistory(room) {
    try {
        if (!chatBox) return;
        
        chatBox.innerHTML = '';
        const history = getMessageHistory();
        const roomMessages = history[room] || [];
        
        roomMessages.forEach(msg => {
            displayMessage(msg, true);
        });
    } catch (error) {
        console.error('Error loading message history:', error);
    }
}

// Join Room
function joinRoom(newRoom) {
    if (!socket || !newRoom) return;
    
    if (currentRoom && currentRoom !== newRoom) {
        socket.emit('leaveRoom', currentRoom);
    }
    
    loadMessageHistory(newRoom);
    
    socket.emit('joinRoom', { username, room: newRoom }, (response) => {
        if (response && response.error) {
            console.error('Failed to join room:', response.error);
            alert(`Failed to join room: ${response.error}`);
        } else {
            currentRoom = newRoom;
            if (roomName) roomName.textContent = newRoom;
            
            if (session) {
                session.room = newRoom;
                try {
                    sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(session));
                } catch (error) {
                    console.error('Failed to update session storage:', error);
                }
            }
        }
    });
}

// Leave Room
function leaveRoom() {
    if (!socket || !currentRoom) return;
    socket.emit('leaveRoom', currentRoom);
}

// Handle Room Switch
function handleRoomSwitch(newRoom) {
    if (!newRoom || newRoom === currentRoom) return;
    joinRoom(newRoom);
}

// File Upload Handler
async function handleFileUpload(file) {
    if (!file) return null;
    
    const isValidType = CONFIG.ALLOWED_FILE_TYPES.some(type => file.type === type);
    
    if (!isValidType) {
        alert(`File type not allowed. Allowed types: ${CONFIG.ALLOWED_FILE_TYPES.join(', ')}`);
        return null;
    }
    
    if (file.size > CONFIG.MAX_FILE_SIZE) {
        alert(`File too large. Maximum size is ${CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB`);
        return null;
    }
    
    try {
        const uploadIndicator = document.createElement('div');
        uploadIndicator.className = 'message upload-indicator';
        uploadIndicator.textContent = `Uploading ${file.name}...`;
        chatBox.appendChild(uploadIndicator);
        smoothScroll();
        
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        chatBox.removeChild(uploadIndicator);
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to upload file');
        }
        
        return {
            mediaUrl: data.filePath,
            mediaType: file.type
        };
    } catch (error) {
        console.error('Upload error:', error);
        alert(`Upload failed: ${error.message}`);
        return null;
    }
}

// Send Message Handler
async function sendMessage() {
    if (!socket || !currentRoom) return;

    const text = chatInput ? chatInput.value.trim() : '';
    const file = fileInput ? fileInput.files[0] : null;

    if (!text && !file) {
        console.warn('Nothing to send.');
        return; // مفيش حاجة تبعتها
    }

    try {
        let mediaData = null;
        if (file) {
            mediaData = await handleFileUpload(file);
            if (!mediaData) return; // فشل رفع الملف
            fileInput.value = ''; // نمسح الاختيار
        }

        // لو مفيش text ولا media بعد الرفع يبقى مانبعتش
        if (!text && !mediaData) {
            console.warn('No text or media to send.');
            return;
        }

        const messageData = {
            room: currentRoom,
            username: username,
            timestamp: new Date().toISOString(),
            text: text || '', // نخلي النص موجود حتى لو فاضي
            ...(mediaData && {
                mediaUrl: mediaData.mediaUrl,
                mediaType: mediaData.mediaType
            })
        };

        if (currentReplyMessage) {
            messageData.replyTo = {
                id: currentReplyMessage.id,
                username: currentReplyMessage.username,
                text: currentReplyMessage.text
            };
        }

        socket.emit('chatMessage', messageData, (response) => {
            if (response && response.error) {
                console.error('Failed to send message:', response.error);
                alert(`Failed to send message: ${response.error}`);
            } else {
                if (chatInput) chatInput.value = '';
                currentReplyMessage = null;
                if (replyContainer) replyContainer.style.display = 'none';
            }
        });
    } catch (error) {
        console.error('Error sending message:', error);
        alert(`Error sending message: ${error.message}`);
    }
}



// Setup Event Listeners
function setupEventListeners() {
    if (rooms && rooms.length) {
        rooms.forEach((room) => {
            room.addEventListener('click', () => {
                const newRoom = room.getAttribute('data-room');
                if (newRoom) {
                    handleRoomSwitch(newRoom);
                }
            });
        });
    }

    if (leaveRoomBtn) {
        leaveRoomBtn.addEventListener('click', () => {
            try {
                sessionStorage.removeItem(CONFIG.STORAGE_KEY);
                localStorage.removeItem('user');
                window.location.href = '/login';
            } catch (error) {
                console.error('Error leaving room:', error);
            }
        });
    }

    if (sendButton) {
        sendButton.addEventListener('click', (e) => {
            e.preventDefault();
            sendMessage();
        });
    }

    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    if (uploadButton && fileInput) {
        uploadButton.addEventListener('click', () => fileInput.click());
        
        fileInput.addEventListener('change', async () => {
            if (fileInput.files && fileInput.files[0]) {
                await sendMessage();
            }
        });
    }

    if (replyCancelBtn) {
        replyCancelBtn.addEventListener('click', () => {
            currentReplyMessage = null;
            if (replyContainer) replyContainer.style.display = 'none';
        });
    }
}

// Setup Socket Listeners
function setupSocketListeners() {
    if (!socket) return;

    socket.on('message', (msg) => displayMessage(msg));
    
    socket.on('previousMessages', (messages) => {
        if (Array.isArray(messages)) {
            messages.forEach(msg => displayMessage(msg, true));
        }
    });
    
    socket.on('roomUserCount', ({ room, count }) => {
        if (room === currentRoom && onlineUsersElement) {
            onlineUsersElement.textContent = `${count} user${count !== 1 ? 's' : ''} online`;
        }
    });
    
    socket.on('connect', () => {
        console.log('Connected to server');
        joinRoom(currentRoom);
    });
    
    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        alert('Connection error. Please try again later.');
    });
    
    socket.on('disconnect', (reason) => {
        console.log('Disconnected:', reason);
    });
    
    socket.on('reconnect', () => {
        console.log('Reconnected to server');
        joinRoom(currentRoom);
    });
    
    socket.on('newMessage', (message) => {
        displayMessage(message);
    });
}

// Initialize Chat Application
function init() {
    setupEventListeners();
    setupSocketListeners();
    
    loadMessageHistory(currentRoom);
    
    if (socket && currentRoom) {
        joinRoom(currentRoom);
    }
}

// Start the application when DOM is ready
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(init, 1);
} else {
    document.addEventListener('DOMContentLoaded', init);
}