const socket = io(window.location.origin);

// ==========================================
// RECONNECTION HANDLING
// ==========================================
let hasConnectedBefore = false;

socket.on('connect_error', (error) => {
    console.error('[SOCKET] Connection error:', error);
});

socket.on('disconnect', (reason) => {
    console.warn('[SOCKET] Disconnected:', reason);
});

// Configuration
const CONFIG = {
    STORAGE_KEY: 'chat_user_session',
    DEFAULT_ROOM: 'General',
    MAX_MESSAGE_LENGTH: 16000,
    MAX_MESSAGES_DISPLAY: 600,
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    MAX_ROOM_HISTORY: 20,
    ALLOWED_FILE_TYPES: {
        images: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'],
        videos: ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'],
        documents: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'],
        audio: ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'],
        archives: ['zip', 'rar', '7z', 'tar', 'gz'],
        spreadsheets: ['xls', 'xlsx', 'csv', 'ods'],
        presentations: ['ppt', 'pptx', 'odp'],
        code: ['js', 'html', 'css', 'py', 'java', 'cpp', 'c', 'php', 'rb', 'go', 'rs', 'ts', 'json', 'xml', 'yml', 'yaml']
    }
};

// Friends Data Structure
const friends = {
    list: [],
    requests: [],
    pending: []
};

// (FIX) was const, but "Clear chat" tried to reassign it -> now let
let roomMessageHistory = {};

// File Upload Progress Tracking
const fileUploads = new Map();

function addMessageToRoomHistory(room, message) {
    if (!roomMessageHistory[room]) {
        roomMessageHistory[room] = [];
    }

    roomMessageHistory[room].push({
        username: message.username,
        text: message.text || (message.type === 'file' && message.file ? `📎 ${message.file.name}` : ''),
        timestamp: message.timestamp,
        type: message.type || 'text'
    });

    // Keep only the last 20 messages
    if (roomMessageHistory[room].length > CONFIG.MAX_ROOM_HISTORY) {
        roomMessageHistory[room].shift();
    }
}

// Utility Functions
const sanitizeHTML = (text) => String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const safeFileUrl = (u) => {
    u = String(u || '');
    return (u.startsWith('/saves/') || u.startsWith('/uploads/') || u.startsWith('https://')) ? sanitizeHTML(u) : '';
};

const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat(bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
};

const getFileExtension = (filename) => {
    return filename.split('.').pop().toLowerCase();
};

const getFileType = (filename) => {
    const extension = getFileExtension(filename);
    for (const [type, extensions] of Object.entries(CONFIG.ALLOWED_FILE_TYPES)) {
        if (extensions.includes(extension)) {
            return type;
        }
    }
    return 'other';
};

const getFileIcon = (fileType, extension) => {
    const icons = {
        images: 'fas fa-image',
        videos: 'fas fa-video',
        documents: 'fas fa-file-alt',
        audio: 'fas fa-music',
        archives: 'fas fa-file-archive',
        spreadsheets: 'fas fa-file-excel',
        presentations: 'fas fa-file-powerpoint',
        code: 'fas fa-code',
        other: 'fas fa-file'
    };
    return icons[fileType] || icons.other;
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
const uploadBtn = document.getElementById('upload-btn');
const fileInput = document.getElementById('file-upload');
const onlineUsersDisplay = document.getElementById('online-users');
const addFriendBtn = document.getElementById('add-friend-btn');
const friendUsernameInput = document.getElementById('friend-username');
const typingIndicator = document.getElementById('typing-indicator');
const typingUsername = document.getElementById('typing-username');

// Event delegation for file messages (images and voice playback)
chatBox.addEventListener('click', (e) => {
    const img = e.target.closest('.file-image');
    if (img) return openImageModal(img.dataset.full, img.dataset.name);
    const playBtn = e.target.closest('.voice-play-btn');
    if (playBtn) return playVoiceMessage(playBtn, playBtn.dataset.url);
});

// Typing state management
let isTyping = false;
let typingTimer = null;
const TYPING_TIMER_LENGTH = 2000; // Stop showing "typing" after 2 seconds of inactivity
let currentlyTypingUsers = new Set();


// Initialize Session
function createOrGetSession() {
    try {
        let sessionData = sessionStorage.getItem(CONFIG.STORAGE_KEY);
        if (sessionData) return JSON.parse(sessionData);

        const localStorageUser = localStorage.getItem('user');
        if (localStorageUser) {
            const userData = JSON.parse(localStorageUser);
            const rawUsername = userData.username || userData.name;
            const sessionInfo = {
                username: rawUsername ? rawUsername.trim() : '',
                room: CONFIG.DEFAULT_ROOM,
                loginTimestamp: Date.now(),
            };
            sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(sessionInfo));
            return sessionInfo;
        }

        const guestUsername = `Guest_${Math.random().toString(36).substr(2, 9)}`;
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

// Initialize Session
const session = createOrGetSession();
if (!session) {
    alert('Unable to create session. Please try refreshing the page.');
    throw new Error('Session creation failed');
}

const urlParams = new URLSearchParams(window.location.search);
const urlRoom = urlParams.get('room');

if (urlRoom) {
    session.room = urlRoom;
    sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(session));
}

let username = session.username;
let currentRoom = session.room;
let currentReplyMessage = null;
let currentUser = username;

// Function to get current user (backup method)
function getCurrentUser() {
    if (!currentUser && session && session.username) {
        currentUser = session.username;
    }
    return currentUser;
}

// Ensure currentUser is always set
function registerUserOnline() {
    if (currentUser) {
        window.currentUsername = currentUser;
        socket.emit('userOnline', { username: currentUser });
    } else {
        console.warn('No currentUser found for registerUserOnline');
    }
}

document.addEventListener('DOMContentLoaded', function() {
    if (!currentUser) {
        currentUser = getCurrentUser();
    }
    console.log('Current user set to:', currentUser);
    registerUserOnline();
});

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

// Update UI
const DEFAULT_PLACEHOLDER = chatInput.placeholder;
usernameDisplay.textContent = username;
roomName.textContent = currentRoom;

// File Upload Functions
function createFilePreview(file) {
    const fileType = getFileType(file.name);
    const fileIcon = getFileIcon(fileType, getFileExtension(file.name));

    const preview = document.createElement('div');
    preview.className = 'file-preview';
    preview.innerHTML = `
        <div class="file-preview-content">
            <div class="file-preview-header">
                <i class="${fileIcon}"></i>
                <span class="file-name">${sanitizeHTML(file.name)}</span>
                <button class="file-remove-btn" onclick="removeFilePreview(this)">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="file-preview-body">
                ${fileType === 'images' ? `<img src="${URL.createObjectURL(file)}" alt="Preview" class="file-preview-image">` : ''}
                <div class="file-info">
                    <span class="file-size">${formatFileSize(file.size)}</span>
                    <span class="file-type">${fileType.toUpperCase()}</span>
                </div>
            </div>
            <div class="file-upload-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 0%"></div>
                </div>
                <span class="progress-text">0%</span>
            </div>
        </div>
    `;

    return preview;
}

function removeFilePreview(button) {
    const preview = button.closest('.file-preview');
    if (preview) {
        preview.remove();
    }
}

// Safely remove an upload preview by its file id (does nothing if there is no preview)
function removeUploadPreview(fileId) {
    const preview = document.querySelector(`[data-file-id="${fileId}"]`);
    if (preview) {
        preview.remove();
    }
}

function validateFile(file) {
    if (file.size > CONFIG.MAX_FILE_SIZE) {
        alert(`File "${file.name}" is too large. Maximum size is ${formatFileSize(CONFIG.MAX_FILE_SIZE)}.`);
        return false;
    }
    return true;
}

function updateUploadProgress(fileId, progress) {
    const preview = document.querySelector(`[data-file-id="${fileId}"]`);
    if (preview) {
        const progressBar = preview.querySelector('.progress-fill');
        const progressText = preview.querySelector('.progress-text');

        if (progressBar && progressText) {
            progressBar.style.width = `${progress}%`;
            progressText.textContent = `${progress}%`;

            if (progress === 100) {
                setTimeout(() => {
                    preview.remove();
                }, 1000);
            }
        }
    }
}

function uploadFile(file) {
    if (!validateFile(file)) return;

    const fileId = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('username', username);
    formData.append('room', currentRoom);
    formData.append('fileId', fileId);

    // Upload file with progress tracking
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100);
            updateUploadProgress(fileId, progress);
        }
    });

    xhr.onload = function() {
        if (xhr.status === 200) {
            try {
                const response = JSON.parse(xhr.responseText);
                if (response.success) {
                    // Send file message through socket
                    const fileMessage = {
                        type: 'file',
                        file: response.file,
                        username: username,
                        room: currentRoom,
                        timestamp: Date.now()
                    };

                    if (currentReplyMessage) {
                        fileMessage.replyTo = JSON.stringify({
                            username: currentReplyMessage.username,
                            text: currentReplyMessage.text
                        });
                    }

                    socket.emit('chatMessage', fileMessage);
                    updateUploadProgress(fileId, 100);
                } else {
                    alert('Upload failed: ' + response.error);
                    removeUploadPreview(fileId);
                }
            } catch (e) {
                alert('Upload failed: Invalid server response');
                removeUploadPreview(fileId);
            }
        } else {
            alert('Upload failed: Server error');
            removeUploadPreview(fileId);
        }
    };

    xhr.onerror = function() {
        alert('Upload failed: Network error');
        removeUploadPreview(fileId);
    };

    xhr.open('POST', '/upload');
    xhr.send(formData);
}

function createFileMessage(fileData) {
    console.log('[createFileMessage] Creating message for file:', fileData);
    
    const fileType = getFileType(fileData.name || '');
    const fileIcon = getFileIcon(fileType, getFileExtension(fileData.name || ''));
    const url = safeFileUrl(fileData.url);
    const name = sanitizeHTML(fileData.name || 'file');
    let fileContent = '';

    if (fileData.duration !== undefined || (fileData.name || '').includes('voice-')) {
        const d = Number(fileData.duration) || 0;
        const fmt = `${Math.floor(d / 60)}:${String(d % 60).padStart(2, '0')}`;
        console.log('[createFileMessage] Creating voice message UI with duration:', d, 'formatted:', fmt);
        fileContent = `
            <div class="voice-message-container">
                <button class="voice-play-btn" data-url="${url}"><i class="fas fa-play"></i></button>
                <div class="voice-waveform-display">${'<div class="voice-wave-bar"></div>'.repeat(8)}</div>
                <div class="voice-duration">${fmt}</div>
                <audio class="voice-audio" style="display:none;"><source src="${url}" type="audio/webm"></audio>
            </div>`;
    } else if (fileType === 'images') {
        fileContent = `<div class="file-image-container">
            <img src="${url}" alt="${name}" class="file-image" data-full="${url}" data-name="${name}"></div>`;
    } else if (fileType === 'videos') {
        fileContent = `<div class="file-video-container"><video controls class="file-video"><source src="${url}" type="video/mp4"></video></div>`;
    } else if (fileType === 'audio') {
        fileContent = `<div class="file-audio-container"><audio controls class="file-audio"><source src="${url}" type="audio/mpeg"></audio></div>`;
    } else {
        fileContent = `<div class="file-document-container">
            <div class="file-document-icon"><i class="${fileIcon}"></i></div>
            <div class="file-document-info">
                <div class="file-document-name">${name}</div>
                <div class="file-document-size">${formatFileSize(fileData.size || 0)}</div>
            </div></div>`;
    }

    console.log('[createFileMessage] Generated content length:', fileContent.length);

    return `<div class="file-message">${fileContent}
        <div class="file-actions"><a href="${url}" download="${name}" class="file-download-btn"><i class="fas fa-download"></i></a></div></div>`;
}

function createGifMessage(fileData) {
    const url = safeFileUrl(fileData.url);
    const name = sanitizeHTML(fileData.name || 'GIF');
    return `<div class="file-message"><div class="file-image-container">
        <img src="${url}" alt="${name}" class="file-image" data-full="${url}" data-name="${name}"></div></div>`;
}


function openImageModal(imageUrl, imageName) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('image-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'image-modal';
        modal.className = 'image-modal';
        modal.innerHTML = `
            <div class="image-modal-content">
                <span class="image-modal-close">&times;</span>
                <img class="image-modal-img" src="" alt="">
                <div class="image-modal-caption"></div>
            </div>
        `;
        document.body.appendChild(modal);

        // Close modal events
        modal.querySelector('.image-modal-close').onclick = () => {
            modal.style.display = 'none';
        };

        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        };
    }

    // Show modal with image
    const modalImg = modal.querySelector('.image-modal-img');
    const modalCaption = modal.querySelector('.image-modal-caption');

    modalImg.src = imageUrl;
    modalCaption.textContent = imageName;
    modal.style.display = 'block';
}

// Scroll Functions
function scrollToBottom(smooth = true) {
    const chatBox = document.getElementById('chat-box');
    if (!chatBox) return;

    setTimeout(() => {
        if (smooth) {
            chatBox.scrollTo({
                top: chatBox.scrollHeight,
                behavior: 'smooth'
            });
        } else {
            chatBox.scrollTop = chatBox.scrollHeight;
        }
    }, 100);
}

function addScrollToBottomButton() {
    const scrollButton = document.createElement('button');
    scrollButton.id = 'scroll-to-bottom';
    scrollButton.innerHTML = '<i class="fas fa-chevron-down"></i>';
    scrollButton.style.cssText = `
        position: fixed;
        bottom: 80px;
        right: 20px;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--primary-color);
        color: white;
        border: none;
        cursor: pointer;
        display: none;
        z-index: 1000;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    `;

    scrollButton.addEventListener('click', () => {
        scrollToBottom(true);
        scrollButton.style.display = 'none';
    });

    document.body.appendChild(scrollButton);

    // Show/hide button based on scroll position
    const chatBox = document.getElementById('chat-box');
    if (chatBox) {
        chatBox.addEventListener('scroll', () => {
            const isAtBottom = chatBox.scrollHeight - chatBox.scrollTop <= chatBox.clientHeight + 100;
            scrollButton.style.display = isAtBottom ? 'none' : 'block';
        });
    }
}

// Display Message Function
// (FIX) This is now the ONLY displayMessage. Before, a second declaration at the bottom
// of the file replaced this one and called itself forever (infinite recursion),
// so no message was ever rendered.
function displayMessage(msg) {
    try {
        if (!msg || !msg.username) return;

        addMessageToRoomHistory(msg.room || currentRoom, msg);
        const messageElement = document.createElement('div');

        // Add appropriate classes
        const messageClasses = ['message'];
        if (msg.username === username) {
            messageClasses.push('sent');
        } else {
            messageClasses.push('received');
        }

        // Add special class for AI messages
        if (msg.username === AI_CONFIG.NAME) {
            messageClasses.push('ai-message');
        }

        messageElement.className = messageClasses.join(' ');
        messageElement.dataset.messageId = msg.id || Date.now();

        if (msg.replyTo && typeof msg.replyTo === 'string') {
            try {
                msg.replyTo = JSON.parse(msg.replyTo);
            } catch (error) {
                msg.replyTo = null;
            }
        }

        const safeUsername = sanitizeHTML(msg.username);
        const safeText = msg.text ? sanitizeHTML(msg.text) : '';
        const timestamp = new Date(msg.timestamp || Date.now()).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });

        // Add icon for AI messages
        const usernameDisplay = msg.username === AI_CONFIG.NAME
            ? `🤖 ${safeUsername}`
            : safeUsername;

        let messageContent = '';

        // Handle voice, gif and file messages
        console.log('[displayMessage] Processing message:', {
            type: msg.type,
            hasFile: !!msg.file,
            file: msg.file,
            username: msg.username
        });
        
        if (msg.type === 'voice' && msg.file) {
            console.log('[displayMessage] Creating voice message with file:', msg.file);
            messageContent = createFileMessage(msg.file);
        } else if (msg.type === 'gif' && msg.file) {
            messageContent = createGifMessage(msg.file);
        } else if (msg.type === 'file' && msg.file) {
            messageContent = createFileMessage(msg.file);
            // optional caption sent with the file
            if (safeText) {
                messageContent += `<div class="message-text" style="white-space: pre-wrap; color: whitesmoke;  font-size: 15px; ">${safeText}</div>`;
            }
        } else if (safeText) {
            messageContent = `<div class="message-text" style="white-space: pre-wrap; color: whitesmoke;  font-size: 15px; ">${safeText}</div>`;
        }
        
        if (!messageContent) {
            console.warn('[displayMessage] No content generated for message:', msg);
        }

        messageElement.innerHTML = `
            <div class="message-header">
                <span class="username">${usernameDisplay}</span>
                <span class="timestamp">${timestamp}</span>
            </div>
            ${msg.replyTo ? `
                <div class="replied-message">
                    <span class="replied-username">${sanitizeHTML(msg.replyTo.username || '')}</span>
                    <span class="replied-text">${sanitizeHTML(msg.replyTo.text || '')}</span>
                </div>
            ` : ''}
            <div class="message-content">
                ${messageContent}
                <div class="message-actions">
                    <button class="action-btn reply-btn" title="Reply" data-action="reply">
                        <i class="fas fa-reply"></i>
                    </button>
                    <button class="action-btn react-btn" title="React" data-action="react">
                        <i class="fas fa-smile"></i>
                    </button>
                    <button class="action-btn copy-btn" title="Copy" data-action="copy">
                        <i class="fas fa-copy"></i>
                    </button>
                    ${msg.username === username ? `
                        <button class="action-btn edit-btn" title="Edit" data-action="edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="action-btn delete-btn" title="Delete" data-action="delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
            <div class="message-reactions"></div>
        `;

        const replyOverlay = messageElement.querySelector('.reply-btn');
        if (replyOverlay) {
            replyOverlay.addEventListener('click', () => {
                const replyText = (msg.type === 'file' || msg.type === 'voice') && msg.file
                    ? `📎 ${msg.file.name}`
                    : safeText;

                currentReplyMessage = {
                    username: safeUsername,
                    text: replyText
                };

                replyContainer.innerHTML = `
                    <div class="reply-preview">
                        <strong>Replying to ${safeUsername}</strong>
                        <span>${replyText}</span>
                        <button class="reply-cancel-btn" id="reply-cancel">×</button>
                    </div>
                `;
                replyContainer.style.display = 'flex';
                const cancelBtn = replyContainer.querySelector('#reply-cancel');
                if (cancelBtn) {
                    cancelBtn.onclick = () => {
                        currentReplyMessage = null;
                        replyContainer.style.display = 'none';
                    };
                }

                // If replying to the AI, put @ai in the input
                if (msg.username === AI_CONFIG.NAME) {
                    chatInput.value = '@ai ';
                }

                chatInput.focus();
            });
        }

        // Copy message action
        const copyBtn = messageElement.querySelector('.copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const textToCopy = msg.file && msg.file.url ? msg.file.url : (msg.text || '');
                navigator.clipboard.writeText(textToCopy).then(() => {
                    showNotification('Message copied to clipboard', { type: 'success', duration: 2000, sound: false });
                }).catch(err => {
                    console.error('Copy failed:', err);
                    showNotification('Failed to copy message', { type: 'error', duration: 2000, sound: false });
                });
            });
        }

        // React button action
        const reactBtn = messageElement.querySelector('.react-btn');
        if (reactBtn) {
            reactBtn.addEventListener('click', (e) => {
                showQuickReactions(e.currentTarget, messageElement, msg);
            });
        }

        // Delete message action
        const deleteBtn = messageElement.querySelector('.delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to delete this message?')) {
                    socket.emit('deleteMessage', {
                        messageId: msg.id || messageElement.dataset.messageId,
                        room: currentRoom
                    });
                    messageElement.remove();
                    showNotification('Message deleted', { type: 'success', duration: 2000 });
                }
            });
        }

        // Edit message action
        const editBtn = messageElement.querySelector('.edit-btn');
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                if (msg.type === 'file' || msg.type === 'voice' || msg.type === 'gif') {
                    showNotification('Cannot edit file messages', { type: 'warning', duration: 2000, sound: false });
                    return;
                }

                const messageTextEl = messageElement.querySelector('.message-text');
                if (!messageTextEl) return;
                const originalText = msg.text || '';

                messageTextEl.contentEditable = true;
                messageTextEl.focus();
                messageTextEl.style.border = '2px solid var(--accent-primary)';
                messageTextEl.style.borderRadius = 'var(--radius-md)';
                messageTextEl.style.padding = 'var(--space-sm)';

                const saveEdit = () => {
                    const newText = messageTextEl.textContent.trim();
                    if (newText && newText !== originalText) {
                        socket.emit('editMessage', {
                            messageId: msg.id || messageElement.dataset.messageId,
                            room: currentRoom,
                            newText: newText
                        });
                        messageTextEl.textContent = newText;
                        msg.text = newText; // Update the message object
                        showNotification('Message edited', { type: 'success', duration: 2000 });
                    }
                    messageTextEl.contentEditable = false;
                    messageTextEl.style.border = '';
                    messageTextEl.style.borderRadius = '';
                    messageTextEl.style.padding = '';
                };

                messageTextEl.addEventListener('blur', saveEdit, { once: true });
                messageTextEl.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        saveEdit();
                    } else if (e.key === 'Escape') {
                        messageTextEl.textContent = originalText;
                        messageTextEl.blur();
                    }
                });
            });
        }

        // Save scroll position before adding message
        const wasAtBottom = chatBox.scrollHeight - chatBox.scrollTop <= chatBox.clientHeight + 100;

        chatBox.appendChild(messageElement);

        // Remove old messages
        if (chatBox.children.length > CONFIG.MAX_MESSAGES_DISPLAY) {
            chatBox.removeChild(chatBox.firstChild);
        }

        // Update scroll only if user was at bottom
        if (wasAtBottom) {
            scrollToBottom(true);
        }

        // Code highlighting + link previews for the new message
        setTimeout(() => {
            detectAndHighlightCode();
            detectAndPreviewLinks();
        }, 100);

    } catch (error) {
        console.error('Error displaying message:', error);
    }
}

// Join Room
function joinRoom(newRoom) {
    console.log('[JOIN] Joining room:', newRoom, 'with username:', username);
    socket.emit('joinRoom', { username, room: newRoom }, (response) => {
        console.log('[JOIN] Response:', response);
        if (response && response.error) {
            console.error('[JOIN] Error:', response.error);
        }
    });
}

// Leave Room
function leaveRoom() {
    socket.emit('leaveRoom', currentRoom);
}

socket.on('roomUserCount', ({ room, count }) => {
    if (room === currentRoom) {
        onlineUsersDisplay.innerHTML = `<i class="fas fa-user-friends"></i> <span>${count} Online</span>`;
    }
});

// Handle Room Switch
function handleRoomSwitch(newRoom) {
    if (newRoom === currentRoom) return;

    // Clear typing indicators when switching rooms
    stopTyping();
    currentlyTypingUsers.clear();
    typingIndicator.style.display = 'none';

    leaveRoom();
    chatBox.innerHTML = '';
    chatInput.value = '';
    currentRoom = newRoom;
    roomName.textContent = newRoom;
    
    // Reset AI room styling
    roomName.style.color = '';
    chatInput.placeholder = DEFAULT_PLACEHOLDER;
    onlineUsersDisplay.style.display = 'flex';

    if (newRoom.startsWith('private ')) {
        // Extract the other user's name from the room name
        const roomUsers = newRoom.replace('private ', '').split('_').map(decodeURIComponent);
        const otherUser = roomUsers.find(user => user !== session.username);

        if (otherUser) {
            // Remove the notification dot when entering the private room
            removeNotificationDot(otherUser);
        }
    }

    joinRoom(newRoom);
    session.room = newRoom;
    sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(session));
}

// Emoji Picker
function setupEmojiPicker() {
    const emojiButton = document.getElementById('emoji-btn');
    const emojiPicker = document.getElementById('emoji-picker');

    const emojiCategories = {
        "All": ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '😮', '😯', '😪', '😫', '🤤', '😴', '😌', '😛', '😜', '😝', '👍', '👎','🖕', '👏', '🙌', '🤝', '👋', '🤚', '✋', '🖐️', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '✊', '👊', '🤜', '🤛', '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐒', '🐧', '🐦', '🐤', '🦄', '🐝', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍒', '🍍', '🥭', '🥝', '🍅', '🍆', '🥑', '🥦', '🍔', '🍟', '🍕', '🌭', '🥪', '🍿', '🍰', '🍦', '🍩', '🚀', '✈️', '🚁', '🚢', '🚂', '🚗', '🚲', '🏍️', '🚦', '🗽', '🗼', '⛰️', '🌋', '🏖️'],
        Smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '😮', '😯', '😪', '😫', '🤤', '😴', '😌', '😛', '😜', '😝'],
        Gestures:['👍', '👎','🖕', '👏', '🙌', '🤝', '👋', '🤚', '✋', '🖐️', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '✊', '👊', '🤜', '🤛', '🤲', '🙏', '🤗', '✍️', '💅', '🤳','💃', '🕺', '🤸', '🙆', '🙅', '🤷', '🤦', '🙋', '💁', '🧏', '🤵', '👰', '🕴️', '🚶', '🏃', '🧎', '🧘', '🤾', '🤽', '🤹', '🤺', '🏇', '⛷️', '🏂', '🏌️', '🤿', '🚣', '🏊', '⛹️', '🏋️', '🚴', '🚵', '🧗', '🤼', '🏄', '🙇', '💆', '💇', '🛀', '🛌', '🧍', '🚯', '🚱', '🚳', '🚷', '🚸', '⛔', '📵', '🔞', '☢️', '☣️', '⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️', '↕️', '↔️', '↩️', '↪️', '⤴️', '⤵️', '🔃', '🔄', '🔙', '🔚', '🔛', '🔜', '🔝'],
        Animals: [ '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐒', '🐧', '🐦', '🐤', '🦄', '🐝', '🦋', '🦉', '🦓', '🦒', '🦘', '🐊', '🐢', '🐍', '🐙', '🦀', '🦞', '🦐', '🦑', '🐬', '🐳', '🐋', '🦈', '🐟', '🐠', '🐡', '🦂', '🦥', '🦦', '🦨', '🦡', '🦔', '🦇', '🐌', '🐞', '🐜', '🦗', '🦟', '🦠',  '🦚', '🦜', '🕊️', '🐓', '🦃', '🦩', '🦆', '🦢', '🦉', '🐕', '🐩', '🐈', '🐎' ],
        Food: [ '🍎', '🍐', '🍊', '🍋', '🍉', '🍇', '🍓', '🍒', '🍍', '🥭', '🥝', '🍅', '🥑', '🍆', '🥔', '🥕', '🌽', '🥒','🧄', '🧅', '🥬', '🥦', '🍄', '🥜', '🌰', '🍞', '🥐', '🥖', '🥯', '🥞', '🧇', '🧀', '🍗', '🍖', '🥩', '🥓', '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🌯','🥙', '🧆', '🥚', '🍳', '🥘', '🍲', '🥣', '🥗', '🍿', '🧈', '🧊', '🍱', '🍘', '🍙', '🍚', '🍛', '🍜', '🍝', '🍠', '🍢', '🍣', '🍤', '🍥', '🥮', '🍡', '🥟', '🦪', '🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🧁', '🥧', '🍫', '🍬', '🍭', '🍮', '🍯', '🍼', '🥤', '🧃', '🧉', '🧊' ],
        Travel: ['🚀', '✈️', '🚁', '🚢', '🚂', '🚗', '🚙', '🚕', '🛺', '🚓', '🚑', '🚒','🚚', '🚛', '🚜', '🏎️', '🏍️', '🛵', '🚲', '🛴', '🦽', '🦼', '🚨', '🚍','🚎', '🚤', '⛵', '🛶', '🛳️', '⛴️', '🛥️', '🚢', '🛸', '🚡', '🚠', '🚟','🚞', '🚋', '🚝', '🚄', '🚅', '🚈', '🚂', '🚆', '🚇', '🚊', '🚉', '🚦','🚧', '🗺️', '🗿', '🗽', '🗼', '🏰', '🏯', '🏟️', '🎡', '🎢', '🎠', '🏖️','🏝️', '⛰️', '🏔️', '🌋', '🗻', '🏜️', '🏕️', '⛺', '🛤️', '🛣️', '🌉', '🌁','🏙️', '🌆', '🌇']
    };

    function createEmojiPicker() {
        emojiPicker.innerHTML = '';

        const categoryTabs = document.createElement('div');
        categoryTabs.classList.add('emoji-category-tabs');

        const emojiGrid = document.createElement('div');
        emojiGrid.classList.add('emoji-grid');

        Object.keys(emojiCategories).forEach((category, index) => {
            const categoryTab = document.createElement('button');
            categoryTab.textContent = category;
            categoryTab.classList.add('emoji-category-tab');
            if (index === 0) categoryTab.classList.add('active');

            categoryTab.addEventListener('click', () => {
                categoryTabs.querySelectorAll('.emoji-category-tab').forEach(tab =>
                    tab.classList.remove('active')
                );
                categoryTab.classList.add('active');
                populateEmojiGrid(category);
            });

            categoryTabs.appendChild(categoryTab);
        });

        function populateEmojiGrid(category) {
            emojiGrid.innerHTML = '';
            emojiCategories[category].forEach(emoji => {
                const emojiEl = document.createElement('span');
                emojiEl.textContent = emoji;
                emojiEl.classList.add('emoji-item');
                emojiEl.addEventListener('click', () => {
                    chatInput.value += emoji;
                    chatInput.focus();
                });
                emojiGrid.appendChild(emojiEl);
            });
        }

        populateEmojiGrid(Object.keys(emojiCategories)[0]);
        emojiPicker.appendChild(categoryTabs);
        emojiPicker.appendChild(emojiGrid);
    }

    emojiButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!emojiPicker.querySelector('.emoji-grid')) {
            createEmojiPicker();
        }
        emojiPicker.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
        if (!emojiPicker.contains(e.target) && !emojiButton.contains(e.target)) {
            emojiPicker.classList.remove('show');
        }
    });
}


// Friends List Functions
function updateFriendsList() {
    const friendsListContainer = document.getElementById('friends-tab');
    friendsListContainer.innerHTML = '<h2><i class="fas fa-user-friends"></i> Friends</h2>';

    // Ensure friends.list is an array
    if (!friends.list || !Array.isArray(friends.list)) {
        console.warn('friends.list is not an array:', friends.list);
        friends.list = []; // Initialize as empty array
    }

    if (friends.list.length === 0) {
        friendsListContainer.innerHTML += '<p style="margin-top: 8px;" class="no-friends">No friends yet. Add some friends!</p>';
        return;
    }

    // SORT FRIENDS: Online users first, then offline users
    const sortedFriends = [...friends.list].sort((a, b) => {
        const aOnline = a.friend_online || a.online_status || a.online || false;
        const bOnline = b.friend_online || b.online_status || b.online || false;

        if (aOnline && !bOnline) return -1;
        if (!aOnline && bOnline) return 1;
        return 0;
    });

    sortedFriends.forEach(friend => {
        const friendItem = document.createElement('div');
        friendItem.className = 'friend-item';

        // Handle different property names from different database methods
        const friendUsername = friend.friend_username || friend.username;
        const friendName = friend.friend_name || friend.name || friendUsername;
        const friendAvatar = friend.friend_avatar || friend.avatar;
        const isOnline = friend.friend_online || friend.online_status || friend.online || false;
        const friendStatus = friend.friend_status || friend.status || '';

        // Sanitize values
        const safeName = sanitizeHTML(friendName);
        const safeUser = sanitizeHTML(friendUsername);
        const safeAvatar = sanitizeHTML(friendAvatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(friendName));

        // Create status display with proper styling
        let statusDisplay = '';
        if (isOnline) {
            if (friendStatus && friendStatus !== 'Online') {
                statusDisplay = `<span class="status-online">Online</span> `;
            } else {
                statusDisplay = `<span class="status-online">Online</span>`;
            }
        } else {
            statusDisplay = `<span class="status-offline">Offline</span>`;
        }

        friendItem.innerHTML = `
            <img src="${safeAvatar}" 
                 class="friend-avatar" alt="${safeName}">
            <div class="friend-info">
                <div class="friend-name">${safeName}</div>
                <div class="friend-status ${isOnline ? 'online' : 'offline'}">
                    ${statusDisplay}
                </div>
            </div>
            <div class="friend-actions">
                <button class="friend-action-btn chat-with-friend" data-username="${safeUser}">
                    <i class="fas fa-comment"></i>
                </button>
                <button class="friend-action-btn remove-friend" data-username="${safeUser}">
                    <i class="fas fa-user-minus"></i>
                </button>
            </div>
        `;

        friendsListContainer.appendChild(friendItem);
    });

    // Re-add event listeners for the new buttons with notification management
    document.querySelectorAll('.chat-with-friend').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const username = e.currentTarget.getAttribute('data-username');

            // Remove notification dot when clicked
            e.currentTarget.classList.remove('has-notification');

            startPrivateChat(username);
        });
    });

    document.querySelectorAll('.remove-friend').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const username = e.currentTarget.getAttribute('data-username');
            removeFriend(username);
        });
    });
    
    // Restore unread indicators
    unreadPrivate.forEach(addNotificationDot);
}


function updateFriendRequests() {
    const addFriendTab = document.getElementById('add-friend-tab');
    let requestsContainer = addFriendTab.querySelector('.friend-requests');

    console.log('updateFriendRequests called with friends.requests:', friends.requests);

    // Create container if it doesn't exist
    if (!requestsContainer) {
        requestsContainer = document.createElement('div');
        requestsContainer.className = 'friend-requests';
        addFriendTab.appendChild(requestsContainer);
    }

    if (friends.requests.length === 0) {
        requestsContainer.innerHTML = '<div class="no-requests"><p>No pending friend requests</p></div>';
    } else {
        requestsContainer.innerHTML = '<div class="requests-header"><h3>Friend Requests</h3></div>';

        // Display requests in their current order (newest first since we use unshift)
        friends.requests.forEach(request => {
            console.log('Processing request:', request, 'from_user:', request.from_user);
            
            const safeFromUser = sanitizeHTML(request.from_user);
            
            const requestItem = document.createElement('div');
            requestItem.className = 'friend-item';
            requestItem.innerHTML = `
                <div class="friend-info">
                    <div class="friend-name">${safeFromUser}</div>
                    <div class="friend-status">Wants to be your friend</div>
                </div>
                <div class="friend-actions">
                    <button class="friend-action-btn accept-request accept-btn" data-username="${safeFromUser}">
                        <i class="fas fa-check"></i>
                    </button>
                    <button class="friend-action-btn decline-request decline-btn" data-username="${safeFromUser}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;

            requestsContainer.appendChild(requestItem);
        });
    }
}


// Friend Actions
function addFriend() {
    const friendUsername = friendUsernameInput.value.trim();
    friendUsernameInput.value = ''; // Clear input after reading value
    if (!friendUsername) {
        alert('Please enter a username');
        return;
    }

    if (friendUsername === username) {
        alert("You can't add yourself as a friend!");
        return;
    }

    if (friends.list.some(f => (f.username || f.friend_username) === friendUsername)) {
        alert(`${friendUsername} is already your friend`);
        return;
    }

    if (friends.pending.includes(friendUsername)) {
        alert(`You already have a pending request to ${friendUsername}`);
        return;
    }

    socket.emit('sendFriendRequest', {
        from: username,
        to: friendUsername
    }, (response) => {
        if (response && response.success) {
            friends.pending.push(friendUsername);
            friendUsernameInput.value = '';
            showNotification(`Friend request sent to ${friendUsername}`);
        } else {
            alert((response && response.error) || 'Failed to send friend request');
        }
    });
}


function removeFriend(username) {
    if (!confirm(`Are you sure you want to remove ${username} from your friends?`)) {
        return;
    }

    socket.emit('removeFriend', {
        username1: session.username,
        username2: username
    }, (response) => {
        if (response && !response.success) {
            alert(response.error || 'Failed to remove friend');
        }
    });
}

function startPrivateChat(username) {
    const privateRoom = `private ${[session.username, username].sort().map(user => encodeURIComponent(user).replaceAll('_', '%5F')).join('_')}`;
    handleRoomSwitch(privateRoom);
}

document.querySelectorAll('.chat-with-friend').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const username = e.currentTarget.getAttribute('data-username');

        // Remove notification dot on click
        e.currentTarget.classList.remove('has-notification');

        startPrivateChat(username);
    });
});

// Unread private messages tracking
const unreadPrivate = new Set();

// Add notification dot for a given user
function addNotificationDot(username) {
    unreadPrivate.add(username);
    const chatButton = document.querySelector(`.chat-with-friend[data-username="${CSS.escape(username)}"]`);
    if (chatButton) {
        chatButton.classList.add('has-notification');
    }
}

// Remove notification dot for a given user
function removeNotificationDot(username) {
    unreadPrivate.delete(username);
    const chatButton = document.querySelector(`.chat-with-friend[data-username="${CSS.escape(username)}"]`);
    if (chatButton) {
        chatButton.classList.remove('has-notification');
    }
}

// Remove duplicate handlers and ensure only one handler for privateMessage
socket.off('privateMessage');
socket.on('privateMessage', (msg) => {
    if (!msg || !msg.username) return;
    
    console.log('[privateMessage] Received:', {
        username: msg.username,
        type: msg.type,
        room: msg.room,
        currentRoom: currentRoom,
        hasFile: !!msg.file
    });
    
    if (msg.room === currentRoom) {
        // Display message if we're in the same room
        displayMessage(msg);
    } else if (msg.username !== username) {
        // Store the message for when the user opens the room
        if (!roomMessageHistory[msg.room]) {
            roomMessageHistory[msg.room] = [];
        }
        
        // Add message to room history so it shows when user opens the room
        addMessageToRoomHistory(msg.room, msg);
        
        // Show notification
        addNotificationDot(msg.username);
        const notificationText = msg.type === 'voice' 
            ? `🎤 Voice message from ${msg.username}`
            : msg.type === 'file'
            ? `📎 File from ${msg.username}`
            : `New message from ${msg.username}`;
        showNotification(notificationText, { type: 'message' });
    }
});

// =====================
// ADVANCED NOTIFICATION SYSTEM
// =====================

// Notification settings
const notificationSettings = {
    enabled: localStorage.getItem('notifications_enabled') !== 'false',
    sound: localStorage.getItem('notification_sound') !== 'false',
    desktop: localStorage.getItem('desktop_notifications') !== 'false',
};

// Notification sound
const notificationSound = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBi6Czz');

function playNotificationSound() {
    if (notificationSettings.sound) {
        notificationSound.play().catch(err => console.log('Sound play failed:', err));
    }
}

function showNotification(message, options = {}) {
    if (!notificationSettings.enabled) return;

    const {
        type = 'info',
        duration = 4000,
        sound = true,
        desktop = true,
        icon = null
    } = options;

    // Play sound
    if (sound) playNotificationSound();

    // Desktop notification
    if (desktop && notificationSettings.desktop && !document.hasFocus()) {
        if ('Notification' in window) {
            if (Notification.permission === 'granted') {
                new Notification('Cyphers Chat', {
                    body: message,
                    icon: icon || 'img/Logo.png',
                    badge: 'img/Logo.png',
                    tag: 'cyphers-notification',
                });
            } else if (Notification.permission !== 'denied') {
                Notification.requestPermission().then(permission => {
                    if (permission === 'granted') {
                        new Notification('Cyphers Chat', {
                            body: message,
                            icon: icon || 'img/Logo.png',
                        });
                    }
                });
            }
        }
    }

    // In-app notification
    const notification = document.createElement('div');
    notification.className = `in-app-notification notification-${type} slide-down`;

    const iconMap = {
        success: '✓',
        error: '⚠️',
        warning: '⚡',
        info: 'ℹ️',
        message: '💬'
    };

    notification.innerHTML = `
        <div class="notification-icon">${iconMap[type] || 'ℹ️'}</div>
        <div class="notification-content"><div class="notification-message"></div></div>
        <button class="notification-close">×</button>
    `;
    notification.querySelector('.notification-message').textContent = message;
    notification.querySelector('.notification-close').onclick = () => notification.remove();

    document.body.appendChild(notification);

    // Auto remove
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, duration);
}

// Request notification permission on load
if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}


// =====================
// MESSAGE REACTIONS SYSTEM
// =====================
const quickReactEmojis = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👏'];

function showQuickReactions(button, messageElement, msg) {
    // Remove any existing reaction picker
    document.querySelectorAll('.reaction-picker').forEach(el => el.remove());

    const picker = document.createElement('div');
    picker.className = 'reaction-picker fade-in';

    picker.innerHTML = quickReactEmojis.map(emoji =>
        `<button class="reaction-emoji" data-emoji="${emoji}">${emoji}</button>`
    ).join('');

    // Position near the button
    const rect = button.getBoundingClientRect();
    picker.style.position = 'fixed';
    picker.style.top = `${rect.top - 50}px`;
    picker.style.left = `${rect.left}px`;
    picker.style.zIndex = '10000';

    document.body.appendChild(picker);

    // Handle reaction selection
    picker.querySelectorAll('.reaction-emoji').forEach(btn => {
        btn.addEventListener('click', () => {
            const emoji = btn.dataset.emoji;
            addReactionToMessage(messageElement, msg, emoji);
            picker.remove();
        });
    });

    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', function closeReactionPicker(e) {
            if (!picker.contains(e.target) && e.target !== button) {
                picker.remove();
                document.removeEventListener('click', closeReactionPicker);
            }
        });
    }, 100);
}

function addReactionToMessage(messageElement, msg, emoji, remote = false) {
    const reactionsContainer = messageElement.querySelector('.message-reactions');
    if (!reactionsContainer) return;

    // Check if reaction already exists
    let existingReaction = Array.from(reactionsContainer.children).find(
        el => el.dataset.emoji === emoji
    );

    if (existingReaction) {
        // Increment count
        const countEl = existingReaction.querySelector('.reaction-count');
        const currentCount = parseInt(countEl.textContent) || 1;
        countEl.textContent = currentCount + 1;

        // Add animation
        existingReaction.classList.add('reaction-pulse');
        setTimeout(() => existingReaction.classList.remove('reaction-pulse'), 300);
    } else {
        // Create new reaction
        const reactionEl = document.createElement('div');
        reactionEl.className = 'message-reaction fade-in';
        reactionEl.dataset.emoji = emoji;
        reactionEl.innerHTML = `
            <span class="reaction-emoji">${emoji}</span>
            <span class="reaction-count">1</span>
        `;

        // Click to remove own reaction
        reactionEl.addEventListener('click', () => {
            const count = parseInt(reactionEl.querySelector('.reaction-count').textContent);
            if (count > 1) {
                reactionEl.querySelector('.reaction-count').textContent = count - 1;
            } else {
                reactionEl.remove();
            }
        });

        reactionsContainer.appendChild(reactionEl);
    }

    // Emit to server only if not a remote reaction
    if (!remote) {
        socket.emit('messageReaction', {
            messageId: msg.id || messageElement.dataset.messageId,
            room: currentRoom,
            emoji: emoji,
            username: username
        });
    }
}

// =====================
// TYPING INDICATORS
// =====================
function showTypingIndicator(username) {
    if (!currentlyTypingUsers.has(username)) {
        currentlyTypingUsers.add(username);
        updateTypingIndicator();
    }
}

function hideTypingIndicator(username) {
    if (currentlyTypingUsers.has(username)) {
        currentlyTypingUsers.delete(username);
        updateTypingIndicator();
    }
}

function updateTypingIndicator() {
    if (currentlyTypingUsers.size === 0) {
        typingIndicator.style.display = 'none';
        return;
    }

    const typingArray = Array.from(currentlyTypingUsers);
    let displayText = '';

    if (typingArray.length === 1) {
        displayText = `${typingArray[0]} is typing...`;
    } else if (typingArray.length === 2) {
        displayText = `${typingArray[0]} and ${typingArray[1]} are typing...`;
    } else {
        displayText = `${typingArray[0]}, ${typingArray[1]} and ${typingArray.length - 2} others are typing...`;
    }

    typingUsername.textContent = displayText;
    typingIndicator.style.display = 'flex';
}

function emitTyping() {
    if (!isTyping) {
        isTyping = true;
        socket.emit('typing', { room: currentRoom, username: currentUser });
    }

    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        stopTyping();
    }, TYPING_TIMER_LENGTH);
}

function stopTyping() {
    if (isTyping) {
        isTyping = false;
        socket.emit('stopTyping', { room: currentRoom, username: currentUser });
    }
    clearTimeout(typingTimer);
}


// =====================
// AI ASSISTANT
// =====================
// The AI runs through the server endpoint /api/ai (see server.js).
// The OpenRouter API key and the free models list live on the SERVER (.env),
// so there is NO API key in this file and no model to maintain here.
const AI_CONFIG = {
    NAME: "AI Assistant",
    API_URL: "/api/ai",
    TIMEOUT_MS: 120000 // the server may try up to 3 models before answering
};


// Store chat history for context (only "user" and "assistant" messages)
let aiChatHistory = {};


// Handle AI Responses with conversation memory
async function handleAIResponse(messageText, room) {
    let userMessagePushed = false;

    try {
        console.log('[handleAIResponse] Called with:', { messageText, room });

        if (!aiChatHistory[room]) {
            aiChatHistory[room] = [];
        }

        // Add user message to history
        aiChatHistory[room].push({ role: "user", content: messageText });
        userMessagePushed = true;

        // Keep history manageable (last 20 messages only)
        if (aiChatHistory[room].length > 20) {
            aiChatHistory[room] = aiChatHistory[room].slice(-20);
        }

        // Build the messages that will be sent to the server
        const requestMessages = aiChatHistory[room].map(m => ({ role: m.role, content: m.content }));

        // For the first question in a room, add recent room messages as context
        if (requestMessages.length === 1 && roomMessageHistory[room] && roomMessageHistory[room].length > 0) {
            const roomContext = roomMessageHistory[room]
                .slice(-10)
                .map(msg => `${msg.username}: ${msg.text}`)
                .join('\n');

            if (roomContext.trim()) {
                requestMessages[0].content =
                    `Recent conversation in this chat room (for context):\n${roomContext}\n\nUser question: ${messageText}`;
            }
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), AI_CONFIG.TIMEOUT_MS);

        const response = await fetch(AI_CONFIG.API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: requestMessages, room }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        let data = {};
        try {
            data = await response.json();
        } catch (e) {
            // response was not JSON
        }

        console.log('[handleAIResponse] Response status:', response.status, data);

        if (!response.ok) {
            const err = new Error(data.error || `Server error (${response.status})`);
            err.status = response.status;
            throw err;
        }

        const aiMessage = data.reply;
        if (!aiMessage) {
            throw new Error('No AI response content');
        }

        // Add AI response to history
        aiChatHistory[room].push({ role: "assistant", content: aiMessage });

        return data.broadcast ? null : aiMessage;
    } catch (error) {
        console.error('[handleAIResponse] Error:', error);

        // Remove the unanswered user message so the history stays clean
        if (userMessagePushed && aiChatHistory[room] && aiChatHistory[room].length > 0) {
            const last = aiChatHistory[room][aiChatHistory[room].length - 1];
            if (last.role === 'user') {
                aiChatHistory[room].pop();
            }
        }

        // Provide helpful error messages
        if (error.name === 'AbortError') {
            return "⚠️ Request timeout. The AI is taking too long to respond. Please try again.";
        } else if (error.status === 429) {
            return "⚠️ Too many requests. Please wait a minute and try again.";
        } else if (error.status === 401) {
            return "⚠️ AI authentication error. The server API key is not valid.";
        } else if (error.status === 503) {
            return "⚠️ AI service is temporarily unavailable. Please try again in a minute.";
        } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            return "⚠️ Network connection issue. Please check your internet and try again.";
        }

        return `⚠️ ${error.message}`;
    }
}

function setupAIChat() {
    const askAIButton = document.getElementById('askAIButton');
    if (!askAIButton) return;

    askAIButton.addEventListener('click', () => {
        const aiRoomName = `AI_Chat_${Date.now()}`;
        handleRoomSwitch(aiRoomName);

        // Reset chat history for new session
        aiChatHistory[aiRoomName] = [];

        setTimeout(() => {
            const welcomeMessage = {
                username: AI_CONFIG.NAME,
                text: "👋 Hello! I'm your AI assistant. I'm here to help answer questions, have conversations, or assist with anything you need. Just type your message or use @ai to talk to me!",
                room: aiRoomName,
                timestamp: Date.now()
            };
            displayMessage(welcomeMessage);
        }, 500);

        chatInput.placeholder = "Type your message or @ai to start...";
        chatInput.value = "@ai ";
        document.getElementById('room-name').textContent = "🤖 AI Assistant";
        document.getElementById('room-name').style.color = "#4a6cff";
        document.getElementById('online-users').style.display = 'none';
    });
}


// Socket Listeners for Friends
function setupFriendSocketListeners() {
    socket.on('friendListUpdate', (updatedList) => {
        friends.list = updatedList;
        updateFriendsList();
    });

    socket.on('newFriendRequest', (request) => {
        console.log('Received new friend request:', request);

        // Add the new request to the BEGINNING of the array (newest first)
        friends.requests.unshift({
            from_user: request.from,
            requestId: request.requestId,
            created_at: request.createdAt
        });

        // Update the UI immediately
        updateFriendRequests();

        // Show notification
        showNotification(`${request.from} sent you a friend request!`);
    });

    socket.on('friendRequestResponse', (response) => {
        if (response.accepted) {
            showNotification(`${response.from} accepted your friend request!`);
        } else {
            showNotification(`${response.from} declined your friend request`);
        }

        friends.pending = friends.pending.filter(f => f !== response.from);
    });

    socket.on('friendStatusUpdate', (data) => {
        const friend = friends.list.find(f => (f.username || f.friend_username) === data.username);
        if (friend) {
            friend.friend_online = friend.online_status = friend.online = data.online;
            friend.status = data.status;
            updateFriendsList();
        }
    });

    socket.on('friendStatusChanged', (data) => {
        console.log('Friend status changed:', data);
        const friend = friends.list.find(f => (f.username || f.friend_username) === data.username);
        if (friend) {
            friend.friend_online = friend.online_status = friend.online = data.online;
            friend.status = data.status;
            updateFriendsList();
        }
    });

    // For comprehensive friends list updates
    socket.on('friendsListUpdated', (friendsList) => {
        console.log('[client] Received friendsListUpdated:', friendsList);
        friends.list = Array.isArray(friendsList) ? friendsList : [];
        updateFriendsList();
    });

    socket.on('friendRemoved', (data) => {
        if (!data || !data.success || !data.removedFriend) return;
        friends.list = friends.list.filter(f => (f.username || f.friend_username) !== data.removedFriend);
        updateFriendsList();
        showNotification(`${data.removedFriend} is no longer your friend`);
    });

    // Listen for friendRequestResponded to update friends list in real-time
    socket.on('friendRequestResponded', (data) => {
        if (data && data.toUserFriends && Array.isArray(data.toUserFriends)) {
            friends.list = data.toUserFriends;
            updateFriendsList();
        }
    });
}

// Socket.IO handler for friends list
socket.on('friendsList', (data) => {
    console.log('Received friendsList data:', data);

    if (data.success) {
        let friendsList = data.friends;

        // Handle both array and single object responses from server
        if (friendsList) {
            // If it's a single object, convert to array
            if (!Array.isArray(friendsList)) {
                friendsList = [friendsList];
            }

            // Filter out any null/undefined entries
            friendsList = friendsList.filter(friend => friend && (friend.friend_username || friend.username));

            friends.list = friendsList;
        } else {
            friends.list = [];
        }

        updateFriendsList();
    } else {
        console.error('Error in friendsList response:', data.error);
    }
});


socket.on('friendsListUpdate', (data) => {
    console.log('Received friendsListUpdate data:', data);

    // Ensure we always have an array
    friends.list = Array.isArray(data.friends) ? data.friends : [];
    updateFriendsList();
});

socket.on('updateFriendsListForUser', (data) => {
    // Check if this notification is for the current user
    if (data.username === session.username) {
        friends.list = data.friendsList;
        updateFriendsList();
        console.log('Friends list updated in real-time for:', data.username);
    }
});

// Detect if a message is addressed to the AI: "@ai ...", "ai ...", or "hey ai ..."
const AI_TRIGGER_REGEX = /(^@ai\b)|(^ai\b)|(\bhey ai\b)/i;

function cleanAIPrompt(text) {
    return text
        .replace(/^@ai\b[\s,:.!?-]*/i, '')
        .replace(/^ai\b[\s,:.!?-]*/i, '')
        .replace(/\bhey ai\b[\s,:.!?-]*/i, '')
        .trim();
}

function setupSocketListeners() {
    console.log('[setupSocketListeners] Initializing AI message handler');
    
    socket.on('message', (msg) => {
        console.log('[socket.on(message)] Received:', {
            username: msg.username,
            text: msg.text?.substring(0, 50),
            type: msg.type,
            currentUser: username
        });
        
        displayMessage(msg);

        // Only handle AI if this is MY message (the sender) and has text content
        const isMyMessage = msg.username === username;
        const isNotAI = msg.username !== AI_CONFIG.NAME;
        const hasText = msg.text && typeof msg.text === 'string';
        const triggersAI = hasText && AI_TRIGGER_REGEX.test(msg.text.trim());
        
        // Debug logging for any message containing 'ai'
        if (hasText && msg.text.toLowerCase().includes('ai')) {
            console.log('[AI Check] Message contains "ai":', {
                isMyMessage,
                isNotAI,
                hasText,
                triggersAI,
                text: msg.text,
                username: msg.username,
                currentUsername: username,
                AI_NAME: AI_CONFIG.NAME
            });
        }
        
        if (isMyMessage && isNotAI && hasText && triggersAI) {
            console.log('[AI] ✅ TRIGGERED! Processing AI request...');

            // Clean the message by removing trigger keywords
            let cleanMessage = cleanAIPrompt(msg.text);

            // Ensure there's content after cleaning
            if (!cleanMessage) {
                cleanMessage = "Hello! How can I help you?";
            }

            console.log('[AI] Cleaned message:', cleanMessage);

            // Show "AI is typing..." indicator
            showTypingIndicator(AI_CONFIG.NAME);

            // Call AI and send response
            handleAIResponse(cleanMessage, msg.room).then(aiResponse => {
                console.log('[AI] Received response:', aiResponse);

                // Hide typing indicator when AI responds
                hideTypingIndicator(AI_CONFIG.NAME);

                if (aiResponse === null) return;
                // Remove any leftover "thinking" blocks
                let cleanResponse = (aiResponse || '')
                    .replace(/<think>[\s\S]*?<\/think>/gi, '')
                    .trim();

                // Ensure valid response
                if (!cleanResponse) {
                    cleanResponse = "Sorry, I couldn't process your request properly.";
                }

                const aiMessage = {
                    username: AI_CONFIG.NAME,
                    text: cleanResponse,
                    room: msg.room,
                    timestamp: Date.now(),
                };

                displayMessage(aiMessage);
            }).catch(error => {
                console.error('[AI] Response Error:', error);

                // Hide typing indicator on error
                hideTypingIndicator(AI_CONFIG.NAME);

                const errorMessage = {
                    username: AI_CONFIG.NAME,
                    text: `Sorry, I'm having trouble right now. Error: ${error.message}`,
                    room: msg.room,
                    timestamp: Date.now(),
                };

                displayMessage(errorMessage);
            });
        }
    });

    socket.on('previousMessages', (messages) => {
        console.log(`[CLIENT] Received ${messages.length} previous messages`);
        // displayMessage already saves each message into the room history
        messages.forEach(msg => {
            displayMessage(msg);
        });
        setTimeout(() => scrollToBottom(false), 200);
    });

    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        alert('Connection error. Please try again later.');
    });

    socket.on('pendingRequests', (data) => {
        console.log('Received pending friend requests:', data.requests);
        console.log('Full pendingRequests data:', JSON.stringify(data, null, 2));

        if (data.success && data.requests) {
            let requests = data.requests;
            if (!Array.isArray(requests)) {
                requests = [requests];
            }

            console.log('Processed requests array:', requests);
            requests.forEach((req, index) => {
                console.log(`Request ${index}:`, req, 'from_user:', req.from_user);
            });

            // Only replace if friends.requests is empty (initial load)
            // Otherwise, merge without duplicates while preserving order
            if (friends.requests.length === 0) {
                friends.requests = requests;
            } else {
                requests.forEach(newRequest => {
                    const exists = friends.requests.some(existingRequest =>
                        existingRequest.from_user === newRequest.from_user
                    );
                    if (!exists) {
                        friends.requests.push(newRequest);
                    }
                });
            }

            console.log('friends.requests after update:', friends.requests);
            updateFriendRequests();
        }
    });

    // Typing indicators
    socket.on('userTyping', ({ username, room }) => {
        if (room === currentRoom && username !== currentUser) {
            showTypingIndicator(username);
        }
    });

    socket.on('userStoppedTyping', ({ username, room }) => {
        if (room === currentRoom) {
            hideTypingIndicator(username);
        }
    });

    // Message operations (delete/edit/reactions)
    const findMsgEl = (id) => document.querySelector(`[data-message-id="${CSS.escape(String(id))}"]`);

    socket.on('messageDeleted', ({ messageId, room }) => {
        if (room === currentRoom) findMsgEl(messageId)?.remove();
    });
    
    socket.on('messageEdited', ({ messageId, room, newText }) => {
        if (room !== currentRoom) return;
        const t = findMsgEl(messageId)?.querySelector('.message-text');
        if (t) t.textContent = newText;
    });
    
    socket.on('messageReaction', ({ messageId, room, emoji }) => {
        if (room !== currentRoom) return;
        const el = findMsgEl(messageId);
        if (el) addReactionToMessage(el, { id: messageId }, emoji, true);
    });

    setupFriendSocketListeners();
}

function addAIHelperButton() {
    const aiHelperBtn = document.createElement('button');
    aiHelperBtn.id = 'ai-helper-btn';
    aiHelperBtn.innerHTML = '<i class="fa-brands fa-airbnb"></i>';
    aiHelperBtn.title = 'Ask AI (Type @ai or "hey ai")';
    aiHelperBtn.style.cssText = `
        position: fixed;
        bottom: 123px;
        right: 20px;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: linear-gradient(45deg, #667eea,rgb(58, 58, 172));
        color: white;
        border: none;
        cursor: pointer;
        z-index: 1000;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        transition: transform 0.2s;
    `;

    aiHelperBtn.addEventListener('mouseenter', () => {
        aiHelperBtn.style.transform = 'scale(1.1)';
    });

    aiHelperBtn.addEventListener('mouseleave', () => {
        aiHelperBtn.style.transform = 'scale(1)';
    });

    aiHelperBtn.addEventListener('click', () => {
        chatInput.value = '@ai ';
        chatInput.focus();
    });

    document.body.appendChild(aiHelperBtn);
}

// Setup Event Listeners
function setupEventListeners() {
    // Tab Switching
    const navTabs = document.querySelectorAll('.nav-tab');
    const tabsContent = {
        'rooms': document.getElementById('rooms-tab'),
        'friends': document.getElementById('friends-tab'),
        'add-friend': document.getElementById('add-friend-tab')
    };

    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.getAttribute('data-tab');

            navTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            Object.values(tabsContent).forEach(content => {
                content.style.display = 'none';
                document.getElementById('online-users').style.display = 'none';
            });

            if (tabsContent[tabName]) {
                tabsContent[tabName].style.display = 'block';
            }
        });
    });

    // Room Buttons
    rooms.forEach((room) => {
        room.addEventListener('click', () => {
            const newRoom = room.getAttribute('data-room');
            handleRoomSwitch(newRoom);
            document.getElementById('online-users').style.display = 'flex';
        });
    });

    // Leave Room Button
    leaveRoomBtn.addEventListener('click', async () => {
        await fetch('/api/users/logout', { method: 'POST' });
        socket.disconnect();
        sessionStorage.removeItem(CONFIG.STORAGE_KEY);
        localStorage.removeItem('user');
        window.location.href = '/login';
    });

    // Chat Form
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const message = chatInput.value.trim();

        // Stop typing indicator when message is sent
        stopTyping();

        if (message && message.length <= CONFIG.MAX_MESSAGE_LENGTH) {
            const messageData = {
                text: message,
                room: currentRoom,
                username,
            };

            if (currentReplyMessage) {
                messageData.replyTo = JSON.stringify({
                    username: currentReplyMessage.username,
                    text: currentReplyMessage.text
                });
            }

            socket.emit('chatMessage', messageData, response => {
                if (response?.error) { chatInput.value = message; showNotification(response.error); }
            });
            chatInput.value = '';
            if (currentRoom.startsWith('AI_Chat_')) {
                chatInput.value = "@ai ";
            }
            currentReplyMessage = null;
            replyContainer.style.display = 'none';
            chatInput.focus();

            // Ensure scroll after sending message
            setTimeout(() => scrollToBottom(true), 100);
        } else {
            alert(`Message must be between 1-${CONFIG.MAX_MESSAGE_LENGTH} characters.`);
        }
    });

    // Typing indicator on input
    chatInput.addEventListener('input', () => {
        if (chatInput.value.trim().length > 0) {
            emitTyping();
        } else {
            stopTyping();
        }
    });

    // Reply Cancel Button
    document.addEventListener('click', (e) => {
        if (e.target.id === 'reply-cancel' || e.target.closest('#reply-cancel')) {
            currentReplyMessage = null;
            replyContainer.style.display = 'none';
        }
    });

    // Add Friend Button
    addFriendBtn.addEventListener('click', addFriend);

    friendUsernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addFriend();
        }
    });

    // Request notification permission on first interaction
    document.addEventListener('click', () => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, { once: true });

    // Setup emoji picker
    setupEmojiPicker();

    // File Upload Button Event Listener
    uploadBtn.addEventListener('click', () => {
        fileInput.click();
    });

    // File Input Change Event Listener
    fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);

        if (files.length === 0) return;

        files.forEach(file => {
            uploadFile(file);
        });

        // Clear the input so the same file can be selected again
        fileInput.value = '';
    });

    // NOTE: drag & drop is handled once, on .chat-main (see DRAG & DROP section below).
    // The old chatBox drop handler was removed because it uploaded every dropped
    // file twice (once here and once through the preview modal).
}


// Initialization
function init() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');

    if (roomParam) {
        currentRoom = roomParam;
        roomName.textContent = currentRoom;
    }

    // Setup everything first
    setupEventListeners();
    setupAIChat();
    addScrollToBottomButton();
    addAIHelperButton();

    // (FIX) The socket listeners were never registered, so 'message' and
    // 'previousMessages' events were ignored and nothing was displayed.
    // They must be registered BEFORE joining the room.
    setupSocketListeners();

    // Join room - messages will load automatically
    console.log('[INIT] About to join room:', currentRoom);
    joinRoom(currentRoom);

    // Load initial friends list
    socket.emit('getFriendsList', username, (response) => {
        if (response && response.success) {
            friends.list = response.friends || [];
            friends.requests = response.requests || [];
            friends.pending = response.pending || [];

            updateFriendsList();
            updateFriendRequests();
        }
    });
    console.log('Emitting getPendingRequests for', username);
    socket.emit('getPendingRequests', { username });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    // DOM already loaded
    init();
}

setupFriendRequestActions();

function setupFriendRequestActions() {
    const addFriendTab = document.getElementById('add-friend-tab');

    // Use event delegation on the parent container
    addFriendTab.addEventListener('click', async (event) => {
        const button = event.target.closest('.friend-action-btn');
        if (!button) return;

        const from_user = button.getAttribute('data-username');
        const action = button.classList.contains('accept-request') ? 'accepted' : 'declined';

        console.log('Friend request action clicked:', { from_user, action, button, session: session.username });

        if (!from_user || from_user === 'undefined') {
            console.error('from_user is undefined. Button:', button, 'Attributes:', Array.from(button.attributes).map(a => `${a.name}=${a.value}`));
            alert('Error: Could not identify the request sender. Please refresh and try again.');
            return;
        }

        if (!session.username) {
            console.error('Session username is undefined. Cannot construct payload.');
            alert('Error: Session username is not set. Please log in again.');
            return;
        }

        const payload = { from_user, to_user: session.username, action };
        console.log('Sending payload to /respond-to-request:', payload);

        try {
            const response = await fetch(`${window.location.origin}/respond-to-request`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            console.log('Response from /respond-to-request:', result);

            if (result.success) {
                // Remove the request from the UI immediately
                friends.requests = friends.requests.filter(r => r.from_user !== from_user);
                updateFriendRequests();

                if (action === 'accepted') {
                    showNotification(`You are now friends with ${from_user}`);
                    // Force refresh friends list after accepting
                    setTimeout(() => {
                        socket.emit('getFriendsList', session.username);
                    }, 500);
                } else {
                    showNotification(`Friend request from ${from_user} declined`);
                }
            } else {
                alert('Failed to process the request: ' + result.message);
            }
        } catch (error) {
            console.error('Error handling friend request action:', error);
            alert('Error processing friend request. Please try again.');
        }
    });
}


// =====================
// SETTINGS PANEL MANAGEMENT
// =====================

// Settings Panel Elements
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const settingsClose = document.getElementById('settings-close');

// Settings inputs
const settingNotifications = document.getElementById('setting-notifications');
const settingSound = document.getElementById('setting-sound');
const settingDesktop = document.getElementById('setting-desktop');
const settingTheme = document.getElementById('setting-theme');
const settingFontSize = document.getElementById('setting-font-size');
const settingEnterSend = document.getElementById('setting-enter-send');
const settingTypingIndicator = document.getElementById('setting-typing-indicator');
const settingTimestamps = document.getElementById('setting-timestamps');
const settingReadReceipts = document.getElementById('setting-read-receipts');
const settingOnlineStatus = document.getElementById('setting-online-status');
const exportChatBtn = document.getElementById('export-chat');
const clearChatBtn = document.getElementById('clear-chat');

// Load saved settings
function loadSettings() {
    if (!settingNotifications) return; // settings panel not in the page

    settingNotifications.checked = notificationSettings.enabled;
    settingSound.checked = notificationSettings.sound;
    settingDesktop.checked = notificationSettings.desktop;

    settingTheme.value = localStorage.getItem('theme') || 'dark';
    settingFontSize.value = localStorage.getItem('fontSize') || 'medium';
    settingEnterSend.checked = localStorage.getItem('enterSend') !== 'false';
    settingTypingIndicator.checked = localStorage.getItem('typingIndicator') !== 'false';
    settingTimestamps.checked = localStorage.getItem('timestamps') !== 'false';
    settingReadReceipts.checked = localStorage.getItem('readReceipts') !== 'false';
    settingOnlineStatus.checked = localStorage.getItem('onlineStatus') !== 'false';

    applySettings();
}

// Apply settings to UI
function applySettings() {
    if (!settingFontSize) return;

    // Apply font size
    const fontSize = settingFontSize.value;
    const fontSizeMap = {
        small: '14px',
        medium: '15.5px',
        large: '17px'
    };
    document.documentElement.style.setProperty('--chat-font-size', fontSizeMap[fontSize]);

    // Apply theme
    const theme = settingTheme.value;
    if (theme === 'light') {
        document.documentElement.style.setProperty('--background-primary', '#ffffff');
        document.documentElement.style.setProperty('--background-secondary', '#f5f5f5');
        document.documentElement.style.setProperty('--background-tertiary', '#e0e0e0');
        document.documentElement.style.setProperty('--text-primary', '#1a1a1a');
        document.documentElement.style.setProperty('--text-secondary', '#666666');
    } else if (theme === 'dark') {
        document.documentElement.style.setProperty('--background-primary', '#0f111a');
        document.documentElement.style.setProperty('--background-secondary', '#1a2035');
        document.documentElement.style.setProperty('--background-tertiary', '#252d42');
        document.documentElement.style.setProperty('--text-primary', '#f0f0f0');
        document.documentElement.style.setProperty('--text-secondary', '#b0b0b0');
    }

    // Show/hide timestamps
    const timestamps = document.querySelectorAll('.timestamp');
    timestamps.forEach(ts => {
        ts.style.display = settingTimestamps.checked ? 'inline' : 'none';
    });
}

// Save settings
function saveSettings() {
    notificationSettings.enabled = settingNotifications.checked;
    notificationSettings.sound = settingSound.checked;
    notificationSettings.desktop = settingDesktop.checked;

    localStorage.setItem('notifications_enabled', settingNotifications.checked);
    localStorage.setItem('notification_sound', settingSound.checked);
    localStorage.setItem('desktop_notifications', settingDesktop.checked);
    localStorage.setItem('theme', settingTheme.value);
    localStorage.setItem('fontSize', settingFontSize.value);
    localStorage.setItem('enterSend', settingEnterSend.checked);
    localStorage.setItem('typingIndicator', settingTypingIndicator.checked);
    localStorage.setItem('timestamps', settingTimestamps.checked);
    localStorage.setItem('readReceipts', settingReadReceipts.checked);
    localStorage.setItem('onlineStatus', settingOnlineStatus.checked);

    applySettings();
}

// Open/Close Settings Panel
if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
        settingsPanel.classList.add('active');
    });
}

if (settingsClose) {
    settingsClose.addEventListener('click', () => {
        settingsPanel.classList.remove('active');
    });
}

// Click outside to close
document.addEventListener('click', (e) => {
    if (settingsPanel && settingsPanel.classList.contains('active')) {
        if (!settingsPanel.contains(e.target) && !(settingsBtn && settingsBtn.contains(e.target))) {
            settingsPanel.classList.remove('active');
        }
    }
});

// Settings change listeners
if (settingNotifications) settingNotifications.addEventListener('change', saveSettings);
if (settingSound) settingSound.addEventListener('change', saveSettings);
if (settingDesktop) settingDesktop.addEventListener('change', saveSettings);
if (settingTheme) settingTheme.addEventListener('change', saveSettings);
if (settingFontSize) settingFontSize.addEventListener('change', saveSettings);
if (settingEnterSend) settingEnterSend.addEventListener('change', saveSettings);
if (settingTypingIndicator) settingTypingIndicator.addEventListener('change', saveSettings);
if (settingTimestamps) settingTimestamps.addEventListener('change', saveSettings);
if (settingReadReceipts) settingReadReceipts.addEventListener('change', saveSettings);
if (settingOnlineStatus) settingOnlineStatus.addEventListener('change', saveSettings);

// Export chat history
if (exportChatBtn) {
    exportChatBtn.addEventListener('click', () => {
        const chatHistory = {
            username: username,
            exportDate: new Date().toISOString(),
            rooms: roomMessageHistory
        };

        const dataStr = JSON.stringify(chatHistory, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `cyphers-chat-history-${Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(url);

        showNotification('Chat history exported successfully!', { type: 'success' });
        settingsPanel.classList.remove('active');
    });
}

// Clear chat history
if (clearChatBtn) {
    clearChatBtn.addEventListener('click', () => {
        if (confirm('⚠️ Are you sure you want to clear all chat history? This cannot be undone!')) {
            chatBox.innerHTML = '';
            roomMessageHistory = {}; // works now because it is declared with let
            localStorage.removeItem('roomMessageHistory');

            showNotification('Chat history cleared', { type: 'success' });
            settingsPanel.classList.remove('active');
        }
    });
}

// Load settings on init
loadSettings();


// =====================
// ENHANCED ENTER KEY HANDLING
// =====================
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const enterSendEnabled = localStorage.getItem('enterSend') !== 'false';

        if (enterSendEnabled && !e.shiftKey) {
            e.preventDefault();
            // (FIX) a bare "new Event('submit')" is not cancelable, so the form could
            // still reload the page. Use requestSubmit when available.
            if (typeof chatForm.requestSubmit === 'function') {
                chatForm.requestSubmit();
            } else {
                chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
            }
        }
        // If Shift+Enter or enterSend disabled, allow default new line
    }
});


// =====================
// CHAT SEARCH FUNCTIONALITY
// =====================
const searchInput = document.getElementById('search-input');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();

        if (!query) {
            // Show all messages and remove highlights
            document.querySelectorAll('.message').forEach(msg => {
                msg.style.display = '';
                const messageText = msg.querySelector('.message-text');
                if (messageText) {
                    messageText.textContent = messageText.textContent; // strips <mark>
                }
            });
            return;
        }

        // Search and filter messages
        document.querySelectorAll('.message').forEach(msg => {
            const messageText = msg.querySelector('.message-text');
            const usernameEl = msg.querySelector('.username');

            if (messageText || usernameEl) {
                const text = messageText ? messageText.textContent.toLowerCase() : '';
                const user = usernameEl ? usernameEl.textContent.toLowerCase() : '';

                if (text.includes(query) || user.includes(query)) {
                    msg.style.display = '';
                    // Highlight matching text
                    if (messageText) {
                        const originalText = messageText.textContent;
                        const highlightedText = sanitizeHTML(originalText).replace(
                            new RegExp(escapeRegExp(sanitizeHTML(query)), 'gi'),
                            match => `<mark style="background: yellow; color: black;">${match}</mark>`
                        );
                        messageText.innerHTML = highlightedText;
                    }
                } else {
                    msg.style.display = 'none';
                }
            }
        });
    });
}

console.log('✅ Advanced features loaded: Notifications, Reactions, Settings Panel, Search');


// =====================
// VOICE MESSAGES SYSTEM
// =====================
let mediaRecorder = null;
let audioChunks = [];
let recordingStartTime = null;
let recordingTimer = null;
let isRecording = false;

// Create voice message UI
function createVoiceRecorderUI() {
    const voiceUI = document.createElement('div');
    voiceUI.id = 'voice-recorder-ui';
    voiceUI.className = 'voice-recorder-ui hidden';
    voiceUI.innerHTML = `
        <div class="voice-recorder-content">
            <button class="voice-cancel-btn" id="voice-cancel">
                <i class="fas fa-times"></i>
            </button>
            <div class="voice-recording-indicator">
                <div class="recording-pulse"></div>
                <span class="recording-text">Recording</span>
            </div>
            <div class="voice-timer" id="voice-timer">00:00</div>
            <div class="voice-waveform" id="voice-waveform">
                <div class="waveform-bar"></div>
                <div class="waveform-bar"></div>
                <div class="waveform-bar"></div>
                <div class="waveform-bar"></div>
                <div class="waveform-bar"></div>
            </div>
            <button class="voice-send-btn" id="voice-send">
                <i class="fas fa-paper-plane"></i>
            </button>
        </div>
    `;
    document.body.appendChild(voiceUI);

    // Add voice button to chat
    const voiceBtn = document.createElement('button');
    voiceBtn.id = 'voice-btn';
    voiceBtn.className = 'voice-btn';
    voiceBtn.type = 'button';
    voiceBtn.title = 'Voice Message';
    voiceBtn.innerHTML = '<i class="fas fa-microphone"></i>';

    const emojiBtn = document.getElementById('emoji-btn');
    if (emojiBtn && emojiBtn.parentNode) {
        emojiBtn.parentNode.insertBefore(voiceBtn, emojiBtn);
    }

    // Event listeners
    voiceBtn.addEventListener('click', startVoiceRecording);
    document.getElementById('voice-cancel')?.addEventListener('click', cancelVoiceRecording);
    document.getElementById('voice-send')?.addEventListener('click', sendVoiceMessage);
}

async function startVoiceRecording() {
    if (isRecording) return;
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = () => {
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        isRecording = true;
        recordingStartTime = Date.now();

        // Show UI
        document.getElementById('voice-recorder-ui').classList.remove('hidden');

        // Start timer
        recordingTimer = setInterval(updateRecordingTimer, 100);

        // Animate waveform
        animateWaveform();

        showNotification('Recording started', { type: 'info', duration: 2000 });
    } catch (error) {
        console.error('Microphone access error:', error);
        showNotification('Microphone access denied', { type: 'error', duration: 3000 });
    }
}

function updateRecordingTimer() {
    const elapsed = Date.now() - recordingStartTime;
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;

    const timerEl = document.getElementById('voice-timer');
    if (timerEl) {
        timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    // Auto-stop after 5 minutes
    if (seconds >= 300) {
        stopVoiceRecording();
    }
}

function animateWaveform() {
    if (!isRecording) return;

    const bars = document.querySelectorAll('.waveform-bar');
    bars.forEach(bar => {
        const height = Math.random() * 60 + 20;
        bar.style.height = `${height}%`;
    });

    setTimeout(() => animateWaveform(), 100);
}

// Stops the recorder and resolves once the last chunk has been delivered
function stopVoiceRecording() {
    return new Promise((resolve) => {
        isRecording = false;
        clearInterval(recordingTimer);

        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            const prevOnStop = mediaRecorder.onstop;
            mediaRecorder.onstop = (ev) => {
                if (prevOnStop) prevOnStop(ev);
                resolve();
            };
            mediaRecorder.stop();
        } else {
            resolve();
        }
    });
}

async function cancelVoiceRecording() {
    await stopVoiceRecording();
    audioChunks = [];
    document.getElementById('voice-recorder-ui').classList.add('hidden');
    showNotification('Recording cancelled', { type: 'warning', duration: 2000 });
}

async function sendVoiceMessage() {
    // (FIX) wait for the recorder to flush the final chunk before building the blob
    await stopVoiceRecording();

    if (audioChunks.length === 0) {
        showNotification('No audio recorded', { type: 'error', duration: 2000 });
        return;
    }

    const mimeType = mediaRecorder?.mimeType || audioChunks[0]?.type || 'audio/webm';
    const extension = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';
    const audioBlob = new Blob(audioChunks, { type: mimeType });
    const duration = Math.floor((Date.now() - recordingStartTime) / 1000);

    // Create FormData
    const formData = new FormData();
    formData.append('file', audioBlob, `voice-${Date.now()}.${extension}`);
    formData.append('room', currentRoom);
    formData.append('username', username);
    formData.append('duration', duration);
    formData.append('type', 'voice');

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Upload failed');
        }

        const data = await response.json();
        const fileInfo = data.file || data; // Handle both response formats

        socket.emit('chatMessage', {
            username: username,
            room: currentRoom,
            type: 'voice',
            file: {
                id: fileInfo.id,
                url: fileInfo.url,
                name: fileInfo.name,
                size: audioBlob.size,
                duration: duration
            },
            timestamp: Date.now()
        });

        document.getElementById('voice-recorder-ui').classList.add('hidden');
        audioChunks = []; // Clear chunks
        showNotification('Voice message sent!', { type: 'success', duration: 2000 });
    } catch (error) {
        console.error('Voice upload error:', error);
        showNotification('Failed to send voice message: ' + error.message, { type: 'error', duration: 3000 });
    }
}

// Initialize voice recorder
createVoiceRecorderUI();

// =====================
// AI TESTING FUNCTION (for debugging)
// =====================
window.testAIConnection = async function() {
    console.log('=== Testing AI Connection ===');
    try {
        const response = await fetch('/api/ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{ role: 'user', content: 'test connection' }]
            })
        });
        
        const data = await response.json();
        console.log('✅ AI Response:', data);
        alert(`AI Works!\n\nModel: ${data.model}\nProvider: ${data.provider}\nResponse: ${data.reply.substring(0, 100)}...`);
        return data;
    } catch (error) {
        console.error('❌ AI Error:', error);
        alert(`AI Error: ${error.message}`);
        return null;
    }
};

console.log('💡 Tip: Type testAIConnection() in console to test AI');


// =====================
// DRAG & DROP FILE UPLOAD
// =====================
const chatMain = document.querySelector('.chat-main');

if (chatMain) {
    chatMain.addEventListener('dragover', (e) => {
        e.preventDefault();
        chatMain.classList.add('drag-over');
    });

    chatMain.addEventListener('dragleave', (e) => {
        e.preventDefault();
        chatMain.classList.remove('drag-over');
    });

    chatMain.addEventListener('drop', async (e) => {
        e.preventDefault();
        chatMain.classList.remove('drag-over');

        const files = Array.from(e.dataTransfer.files);

        if (files.length === 0) return;

        // Show preview modal
        showFilePreviewModal(files);
    });
}

function showFilePreviewModal(files) {
    const modal = document.createElement('div');
    modal.className = 'file-preview-modal fade-in';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3><i class="fas fa-file-upload"></i> Upload Files</h3>
                <button class="modal-close" onclick="this.closest('.file-preview-modal').remove()">×</button>
            </div>
            <div class="modal-body">
                <div class="files-preview-grid">
                    ${files.map((file, index) => createFilePreviewCard(file, index)).join('')}
                </div>
                <div class="upload-caption">
                    <input type="text" id="upload-caption-input" placeholder="Add a caption (optional)" maxlength="200">
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary" onclick="this.closest('.file-preview-modal').remove()">
                    <i class="fas fa-times"></i> Cancel
                </button>
                <button class="btn-primary" onclick="uploadSelectedFiles()">
                    <i class="fas fa-paper-plane"></i> Send ${files.length} file${files.length > 1 ? 's' : ''}
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    window.pendingFiles = files;
}

function createFilePreviewCard(file, index) {
    const fileType = file.type.split('/')[0];
    const isImage = fileType === 'image';
    const fileURL = URL.createObjectURL(file);

    return `
        <div class="file-preview-card" data-index="${index}">
            ${isImage ?
                `<img src="${fileURL}" alt="${sanitizeHTML(file.name)}" class="preview-image">` :
                `<div class="preview-icon">
                    <i class="fas fa-file fa-3x"></i>
                </div>`
            }
            <div class="file-preview-info">
                <div class="file-name">${sanitizeHTML(file.name)}</div>
                <div class="file-size">${formatFileSize(file.size)}</div>
            </div>
            <button class="remove-file-btn" onclick="removeFileFromPreview(${index})">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
}

function removeFileFromPreview(index) {
    if (window.pendingFiles) {
        window.pendingFiles = window.pendingFiles.filter((_, i) => i !== index);
        if (window.pendingFiles.length === 0) {
            document.querySelector('.file-preview-modal')?.remove();
        } else {
            // Refresh preview
            const grid = document.querySelector('.files-preview-grid');
            grid.innerHTML = window.pendingFiles.map((file, i) => createFilePreviewCard(file, i)).join('');
        }
    }
}

async function uploadSelectedFiles() {
    const files = window.pendingFiles;
    const caption = document.getElementById('upload-caption-input')?.value || '';

    if (!files || files.length === 0) return;

    document.querySelector('.file-preview-modal')?.remove();

    // Upload each file
    for (const file of files) {
        await uploadSingleFile(file, caption);
    }

    showNotification(`${files.length} file${files.length > 1 ? 's' : ''} uploaded!`, { type: 'success' });
    window.pendingFiles = null;
}

async function uploadSingleFile(file, caption) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('room', currentRoom);
    formData.append('username', username);

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Upload failed');
        }

        const data = await response.json();
        const fileInfo = data.file || data; // Handle both response formats

        socket.emit('chatMessage', {
            username: username,
            room: currentRoom,
            type: 'file',
            text: caption,
            file: {
                url: fileInfo.url,
                name: fileInfo.name,
                size: file.size,
                type: file.type
            },
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('Upload error:', error);
        showNotification(`Failed to upload ${file.name}: ${error.message}`, { type: 'error' });
    }
}


// =====================
// MESSAGE PINNING
// =====================
const pinnedMessages = new Set();

function pinMessage(messageElement, msg) {
    const messageId = msg.id || messageElement.dataset.messageId;

    if (pinnedMessages.has(messageId)) {
        // Unpin
        pinnedMessages.delete(messageId);
        messageElement.classList.remove('pinned-message');
        messageElement.querySelector('.pin-indicator')?.remove();
        showNotification('Message unpinned', { type: 'info', duration: 2000, sound: false });
    } else {
        // Pin
        pinnedMessages.add(messageId);
        messageElement.classList.add('pinned-message');

        // Add pin indicator
        if (!messageElement.querySelector('.pin-indicator')) {
            const pinIndicator = document.createElement('div');
            pinIndicator.className = 'pin-indicator';
            pinIndicator.innerHTML = '<i class="fas fa-thumbtack"></i> Pinned';
            messageElement.insertBefore(pinIndicator, messageElement.firstChild);
        }

        showNotification('Message pinned', { type: 'success', duration: 2000, sound: false });
    }

    // Emit to server
    socket.emit('pinMessage', {
        messageId: messageId,
        room: currentRoom,
        pinned: pinnedMessages.has(messageId)
    });
}

// Add pin button to message actions
document.addEventListener('click', (e) => {
    if (e.target.closest('.action-btn[data-action="pin"]')) {
        const messageElement = e.target.closest('.message');
        const msg = { id: messageElement.dataset.messageId };
        pinMessage(messageElement, msg);
    }
});


// =====================
// USER MENTIONS AUTOCOMPLETE
// =====================
let mentionUsers = [];

function setupMentionsAutocomplete() {
    let mentionBox = null;

    chatInput.addEventListener('input', (e) => {
        const text = chatInput.value;
        const cursorPos = chatInput.selectionStart;
        const textBeforeCursor = text.substring(0, cursorPos);
        const lastWord = textBeforeCursor.split(/\s/).pop();

        if (lastWord.startsWith('@') && lastWord.length > 1) {
            const query = lastWord.substring(1).toLowerCase();
            const matches = mentionUsers.filter(user =>
                user.toLowerCase().includes(query)
            );

            if (matches.length > 0) {
                showMentionSuggestions(matches, cursorPos);
            } else {
                hideMentionSuggestions();
            }
        } else {
            hideMentionSuggestions();
        }
    });

    function showMentionSuggestions(users, cursorPos) {
        hideMentionSuggestions();

        mentionBox = document.createElement('div');
        mentionBox.className = 'mention-suggestions fade-in';
        mentionBox.innerHTML = users.map(user => `
            <div class="mention-item" data-username="${sanitizeHTML(user)}">
                <i class="fas fa-user"></i> ${sanitizeHTML(user)}
            </div>
        `).join('');

        // Position above input
        const inputRect = chatInput.getBoundingClientRect();
        mentionBox.style.position = 'fixed';
        mentionBox.style.bottom = `${window.innerHeight - inputRect.top + 10}px`;
        mentionBox.style.left = `${inputRect.left}px`;

        document.body.appendChild(mentionBox);

        // Handle selection
        mentionBox.querySelectorAll('.mention-item').forEach(item => {
            item.addEventListener('click', () => {
                insertMention(item.dataset.username);
                hideMentionSuggestions();
            });
        });
    }

    function hideMentionSuggestions() {
        if (mentionBox) {
            mentionBox.remove();
            mentionBox = null;
        }
    }

    function insertMention(username) {
        const text = chatInput.value;
        const cursorPos = chatInput.selectionStart;
        const textBeforeCursor = text.substring(0, cursorPos);
        const textAfterCursor = text.substring(cursorPos);
        const words = textBeforeCursor.split(/\s/);
        words[words.length - 1] = `@${username}`;
        chatInput.value = words.join(' ') + ' ' + textAfterCursor;
        chatInput.focus();
    }
}

// Update mention users list from online users
socket.on('roomUsers', ({ room, users }) => {
    if (room === currentRoom) {
        mentionUsers = users.map(u => u.username).filter(u => u !== username);
    }
});

setupMentionsAutocomplete();

console.log('✅ Ultra-advanced features loaded: Voice Messages, Drag & Drop, Pinning, Mentions');


// =====================
// CONTEXT MENU FOR MESSAGES
// =====================
let contextMenu = null;

function createContextMenu() {
    if (contextMenu) contextMenu.remove();

    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.innerHTML = `
        <div class="context-menu-item" data-action="reply">
            <i class="fas fa-reply"></i>
            <span>Reply</span>
        </div>
        <div class="context-menu-item" data-action="react">
            <i class="fas fa-smile"></i>
            <span>React</span>
        </div>
        <div class="context-menu-item" data-action="copy">
            <i class="fas fa-copy"></i>
            <span>Copy</span>
        </div>
        <div class="context-menu-item" data-action="pin">
            <i class="fas fa-thumbtack"></i>
            <span>Pin</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" data-action="forward">
            <i class="fas fa-share"></i>
            <span>Forward</span>
        </div>
        <div class="context-menu-item" data-action="select">
            <i class="fas fa-check-square"></i>
            <span>Select</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" data-action="edit">
            <i class="fas fa-edit"></i>
            <span>Edit</span>
        </div>
        <div class="context-menu-item" data-action="delete">
            <i class="fas fa-trash"></i>
            <span>Delete</span>
        </div>
    `;

    document.body.appendChild(contextMenu);
    return contextMenu;
}

// Show context menu on right click
chatBox.addEventListener('contextmenu', (e) => {
    const messageEl = e.target.closest('.message');
    if (!messageEl) return;

    e.preventDefault();

    const menu = createContextMenu();
    menu.classList.add('active');

    // Position menu
    const x = e.clientX;
    const y = e.clientY;
    const menuWidth = 200;
    const menuHeight = 300;

    menu.style.left = (x + menuWidth > window.innerWidth ? x - menuWidth : x) + 'px';
    menu.style.top = (y + menuHeight > window.innerHeight ? y - menuHeight : y) + 'px';

    // Handle menu actions
    menu.querySelectorAll('.context-menu-item').forEach(item => {
        item.addEventListener('click', () => {
            const action = item.dataset.action;
            handleContextMenuAction(action, messageEl);
            menu.classList.remove('active');
        });
    });
});

// Close context menu on click outside
document.addEventListener('click', (e) => {
    if (contextMenu && !contextMenu.contains(e.target)) {
        contextMenu.classList.remove('active');
    }
});

function handleContextMenuAction(action, messageEl) {
    // Pin / select are handled here (there is no pin button inside the message)
    if (action === 'pin') {
        pinMessage(messageEl, { id: messageEl.dataset.messageId });
        return;
    }
    if (action === 'select') {
        toggleMessageSelection(messageEl);
        return;
    }

    const actionBtn = messageEl.querySelector(`.action-btn[data-action="${action}"]`);
    if (actionBtn) {
        actionBtn.click();
    } else {
        console.log('Action:', action, 'on message:', messageEl.dataset.messageId);
        showNotification(`${action.charAt(0).toUpperCase() + action.slice(1)} feature coming soon!`, {
            type: 'info',
            duration: 2000
        });
    }
}


// =====================
// SKELETON LOADERS
// =====================
function showSkeletonLoaders(count = 3) {
    const skeletons = [];
    for (let i = 0; i < count; i++) {
        const skeleton = document.createElement('div');
        skeleton.className = 'skeleton skeleton-message';
        chatBox.appendChild(skeleton);
        skeletons.push(skeleton);
    }
    return skeletons;
}

function removeSkeletonLoaders() {
    document.querySelectorAll('.skeleton-message').forEach(el => el.remove());
}


// =====================
// MESSAGE FORWARDING
// =====================
let selectedMessages = new Set();

function toggleMessageSelection(messageEl) {
    const messageId = messageEl.dataset.messageId;

    if (selectedMessages.has(messageId)) {
        selectedMessages.delete(messageId);
        messageEl.classList.remove('message-selected');
    } else {
        selectedMessages.add(messageId);
        messageEl.classList.add('message-selected');
    }

    updateSelectionToolbar();
}

function updateSelectionToolbar() {
    let toolbar = document.getElementById('selection-toolbar');

    if (selectedMessages.size > 0) {
        if (!toolbar) {
            toolbar = document.createElement('div');
            toolbar.id = 'selection-toolbar';
            toolbar.className = 'selection-toolbar glass fade-in';
            toolbar.innerHTML = `
                <div class="selection-count">${selectedMessages.size} selected</div>
                <div class="selection-actions">
                    <button class="btn-secondary" onclick="forwardMessages()">
                        <i class="fas fa-share"></i> Forward
                    </button>
                    <button class="btn-secondary" onclick="deleteSelectedMessages()">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                    <button class="btn-secondary" onclick="clearSelection()">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                </div>
            `;
            document.body.appendChild(toolbar);
        } else {
            toolbar.querySelector('.selection-count').textContent = `${selectedMessages.size} selected`;
        }
    } else if (toolbar) {
        toolbar.remove();
    }
}

function clearSelection() {
    selectedMessages.clear();
    document.querySelectorAll('.message-selected').forEach(el => {
        el.classList.remove('message-selected');
    });
    updateSelectionToolbar();
}

function forwardMessages() {
    if (selectedMessages.size === 0) return;

    showNotification(`Forwarding ${selectedMessages.size} message(s)...`, { type: 'info' });
    // Implementation would show a room selector modal
    clearSelection();
}

function deleteSelectedMessages() {
    if (selectedMessages.size === 0) return;

    if (confirm(`Delete ${selectedMessages.size} message(s)?`)) {
        const count = selectedMessages.size;
        selectedMessages.forEach(messageId => {
            const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
            if (messageEl) {
                socket.emit('deleteMessage', { messageId, room: currentRoom });
                messageEl.remove();
            }
        });

        showNotification(`${count} message(s) deleted`, { type: 'success' });
        clearSelection();
    }
}


// =====================
// ENHANCED TOOLTIPS
// =====================
function addTooltips() {
    // Add tooltips to buttons
    document.querySelectorAll('[title]').forEach(el => {
        const title = el.getAttribute('title');
        el.setAttribute('data-tooltip', title);
        el.removeAttribute('title');
    });
}

// Initialize tooltips after DOM is loaded
setTimeout(addTooltips, 1000);


// =====================
// PERFORMANCE MONITORING
// =====================
function logPerformance() {
    if (window.performance && window.performance.timing) {
        const timing = window.performance.timing;
        const loadTime = timing.loadEventEnd - timing.navigationStart;
        console.log(`🚀 Page Load Time: ${loadTime}ms`);
        console.log(`📊 DOM Ready: ${timing.domContentLoadedEventEnd - timing.navigationStart}ms`);
    }
}

window.addEventListener('load', logPerformance);

console.log('✅ Ultra-Advanced UI Features Loaded: Custom Cursor, Context Menu, Glassmorphism, Particles');
console.log('🎨 Design System: Fully Responsive, Accessible, Modern');
console.log('⚡ Performance: Optimized with RequestAnimationFrame & Debouncing');


// =====================
// VOICE MESSAGE PLAYBACK
// =====================
function playVoiceMessage(button, audioUrl) {
    const container = button.closest('.voice-message-container');
    const audio = container.querySelector('.voice-audio');
    const icon = button.querySelector('i');
    const waveBars = container.querySelectorAll('.voice-wave-bar');

    if (!audio.src) {
        audio.src = audioUrl;
    }

    if (audio.paused) {
        // Play
        audio.play();
        icon.classList.remove('fa-play');
        icon.classList.add('fa-pause');

        // Animate waveform
        const animateWave = () => {
            if (!audio.paused) {
                waveBars.forEach(bar => {
                    const height = Math.random() * 80 + 20;
                    bar.style.height = `${height}%`;
                });
                setTimeout(animateWave, 100);
            }
        };
        animateWave();
    } else {
        // Pause
        audio.pause();
        icon.classList.remove('fa-pause');
        icon.classList.add('fa-play');

        // Reset waveform
        waveBars.forEach(bar => {
            bar.style.height = '30%';
        });
    }

    // Reset on end
    audio.onended = () => {
        icon.classList.remove('fa-pause');
        icon.classList.add('fa-play');
        waveBars.forEach(bar => {
            bar.style.height = '30%';
        });
    };
}

// Make function globally accessible
window.playVoiceMessage = playVoiceMessage;



// =====================
// CODE SYNTAX HIGHLIGHTING
// =====================
// (FIX) each message is processed only once (data-code-processed), otherwise it
// would be re-processed every time a new message arrived.
function detectAndHighlightCode() {
    document.querySelectorAll('.message-text:not([data-code-processed])').forEach(textEl => {
        textEl.dataset.codeProcessed = '1';
        const text = textEl.textContent;

        // Detect code blocks with ```language
        const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
        let match;
        let hasCode = false;
        let remainingText = text;
        const blocks = [];

        while ((match = codeBlockRegex.exec(text)) !== null) {
            hasCode = true;
            blocks.push({ language: match[1] || 'javascript', code: match[2] });
            remainingText = remainingText.replace(match[0], '');
        }

        if (hasCode) {
            textEl.textContent = remainingText.trim();
            let anchor = textEl;
            blocks.forEach(({ language, code }) => {
                const codeBlock = document.createElement('div');
                codeBlock.className = 'code-block';
                codeBlock.innerHTML = `
                    <div class="code-header">
                        <span class="code-language">${sanitizeHTML(language)}</span>
                        <button class="code-copy-btn" onclick="copyCode(this)">
                            <i class="fas fa-copy"></i> Copy
                        </button>
                    </div>
                    <pre><code class="language-${sanitizeHTML(language)}">${sanitizeHTML(code)}</code></pre>
                `;
                anchor.after(codeBlock);
                anchor = codeBlock;
            });
        } else {
            // Detect inline code with `code`
            const inlineCodeRegex = /`([^`]+)`/g;
            if (inlineCodeRegex.test(textEl.innerHTML)) {
                textEl.innerHTML = textEl.innerHTML.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
            }
        }
    });
}

function copyCode(button) {
    const codeBlock = button.closest('.code-block');
    const code = codeBlock.querySelector('code').textContent;

    navigator.clipboard.writeText(code).then(() => {
        button.innerHTML = '<i class="fas fa-check"></i> Copied!';
        setTimeout(() => {
            button.innerHTML = '<i class="fas fa-copy"></i> Copy';
        }, 2000);
    });
}

window.copyCode = copyCode;

// (FIX) Removed the old wrapper:
//   const originalDisplayMessage = displayMessage;
//   function displayMessage(msg) { originalDisplayMessage(msg); ... }
// Function declarations are hoisted, so that second displayMessage overwrote the real one
// and called itself endlessly -> "Maximum call stack size exceeded" -> no messages.
// Code detection now runs inside displayMessage itself.


// =====================
// LINK PREVIEW
// =====================
// (FIX) each message is processed only once; before, a new preview was added to every
// message every 2 seconds, forever.
function detectAndPreviewLinks() {
    document.querySelectorAll('.message-text:not([data-links-processed])').forEach(textEl => {
        textEl.dataset.linksProcessed = '1';
        const text = textEl.textContent;
        const safeUrlRegex = /(https?:\/\/(?:(?!&quot;|&#39;|&lt;|&gt;)[^\s])+)/g;
        const urls = text.match(safeUrlRegex);

        if (!urls || urls.length === 0) return;

        // Make URLs clickable in text (once per message)
        textEl.innerHTML = sanitizeHTML(text).replace(
            safeUrlRegex,
            '<a href="$1" target="_blank" rel="noopener noreferrer" class="message-link">$1</a>'
        );

        // One preview card per unique link
        let anchor = textEl;
        [...new Set(urls)].forEach(url => {
            let domain = url;
            try {
                domain = new URL(url).hostname;
            } catch (e) {
                return; // invalid URL - skip preview
            }

            const linkPreview = document.createElement('div');
            linkPreview.className = 'link-preview';
            linkPreview.innerHTML = `
                <div class="link-preview-content">
                    <i class="fas fa-link"></i>
                    <div class="link-preview-info">
                        <div class="link-preview-domain">${sanitizeHTML(domain)}</div>
                        <a href="${sanitizeHTML(url)}" target="_blank" rel="noopener noreferrer" class="link-preview-url">${sanitizeHTML(url)}</a>
                    </div>
                </div>
            `;
            anchor.after(linkPreview);
            anchor = linkPreview;
        });
    });
}


// =====================
// EMOJI REACTIONS ANIMATION
// =====================
function createEmojiExplosion(x, y, emoji) {
    const explosion = document.createElement('div');
    explosion.className = 'emoji-explosion';
    explosion.style.left = x + 'px';
    explosion.style.top = y + 'px';
    explosion.textContent = emoji;

    document.body.appendChild(explosion);

    // Remove after animation
    setTimeout(() => {
        explosion.remove();
    }, 1000);
}

// Enhanced reaction with animation
document.addEventListener('click', (e) => {
    if (e.target.closest('.message-reaction')) {
        const reaction = e.target.closest('.message-reaction');
        const emoji = reaction.querySelector('.reaction-emoji').textContent;
        createEmojiExplosion(e.clientX, e.clientY, emoji);
    }
});


// =====================
// USER PRESENCE HEARTBEAT
// =====================
setInterval(() => {
    if (username && currentRoom) {
        socket.emit('userHeartbeat', {
            username: username,
            room: currentRoom,
            timestamp: Date.now()
        });
    }
}, 30000); // Every 30 seconds


// =====================
// UNREAD MESSAGE COUNTER
// =====================
let unreadCount = 0;
const originalTitle = document.title;

function updateUnreadCount() {
    if (!document.hasFocus()) {
        unreadCount++;
        document.title = `(${unreadCount}) ${originalTitle}`;
    }
}

window.addEventListener('focus', () => {
    unreadCount = 0;
    document.title = originalTitle;
});

// Add to message display
socket.on('message', () => {
    updateUnreadCount();
});


console.log('✅ All Ultra-Advanced Features Loaded Successfully!');
console.log('🎨 GIF Picker, Code Highlighting, Link Preview, Animations, Presence');
console.log('🚀 Cyphers v3.0 Ultimate - Production Ready!');


// ==========================================
// EMERGENCY FIX - Load messages on connect
// ==========================================
console.log('[EMERGENCY-FIX] Installing emergency message loader...');

// Force message loading
setTimeout(() => {
    console.log('[EMERGENCY-FIX] Checking if messages loaded...');
    const messageCount = chatBox?.children?.length || 0;
    console.log('[EMERGENCY-FIX] Current messages in chatbox:', messageCount);
    
    if (messageCount === 0 && currentRoom && username) {
        console.warn('[EMERGENCY-FIX] No messages! Force reloading...');
        socket.emit('joinRoom', { username, room: currentRoom });
    }
}, 2000);

console.log('[EMERGENCY-FIX] ✅ Emergency fix installed!');
