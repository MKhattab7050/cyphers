const socket = io(window.location.origin);

// Configuration
const CONFIG = {
    STORAGE_KEY: 'chat_user_session',
    DEFAULT_ROOM: 'General',
    MAX_MESSAGE_LENGTH: 800,
    MAX_MESSAGES_DISPLAY: 600,
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
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

// File Upload Progress Tracking
const fileUploads = new Map();

// Utility Functions
const sanitizeHTML = (text) => {
    const temp = document.createElement('div');
    temp.textContent = text;
    return temp.innerHTML;
};

const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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

// Session Management
function createOrGetSession() {
    try {
        let sessionData = sessionStorage.getItem(CONFIG.STORAGE_KEY);
        if (sessionData) return JSON.parse(sessionData);

        const localStorageUser = localStorage.getItem('user');
        if (localStorageUser) {
            const userData = JSON.parse(localStorageUser);
            const sessionInfo = {
                username: userData.name.trim(),
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
const urlParams = new URLSearchParams(window.location.search);
const urlRoom = urlParams.get('room');

if (urlRoom) {
    session.room = urlRoom;
    currentRoom = urlRoom;
    sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(session));
}
if (!session) {
    alert('Unable to create session. Please try refreshing the page.');
    throw new Error('Session creation failed');
}

let username = session.username;
let currentRoom = session.room;
let currentReplyMessage = null;

// Update UI
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
                    preview.remove();
                }
            } catch (e) {
                alert('Upload failed: Invalid server response');
                preview.remove();
            }
        } else {
            alert('Upload failed: Server error');
            preview.remove();
        }
    };
    
    xhr.onerror = function() {
        alert('Upload failed: Network error');
        preview.remove();
    };
    
    xhr.open('POST', '/upload');
    xhr.send(formData);
}

function createFileMessage(fileData) {
    const fileType = getFileType(fileData.name);
    const fileIcon = getFileIcon(fileType, getFileExtension(fileData.name));
    
    let fileContent = '';
    
    if (fileType === 'images') {
        fileContent = `
            <div class="file-image-container">
                <img src="${fileData.url}" alt="${sanitizeHTML(fileData.name)}" class="file-image" onclick="openImageModal('${fileData.url}', '${sanitizeHTML(fileData.name)}')">
            </div>
        `;
    } else if (fileType === 'videos') {
        fileContent = `
            <div class="file-video-container">
                <video controls class="file-video">
                    <source src="${fileData.url}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
            </div>
        `;
    } else if (fileType === 'audio') {
        fileContent = `
            <div class="file-audio-container">
                <audio controls class="file-audio">
                    <source src="${fileData.url}" type="audio/mpeg">
                    Your browser does not support the audio element.
                </audio>
            </div>
        `;
    } else {
        fileContent = `
            <div class="file-document-container">
                <div class="file-document-icon">
                    <i class="${fileIcon}"></i>
                </div>
                <div class="file-document-info">
                    <div class="file-document-name">${sanitizeHTML(fileData.name)}</div>
                    <div class="file-document-size">${formatFileSize(fileData.size)}</div>
                </div>
            </div>
        `;
    }
    
    return `
        <div class="file-message">
            ${fileContent}
            <div class="file-actions">
                <a href="${fileData.url}" download="${fileData.name}" class="file-download-btn">
                    <i class="fas fa-download"></i> 
                </a>
                
            </div>
        </div>
    `;
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

// Smooth Scrolling
function smoothScroll() {
    const chatBox = document.getElementById('chat-box');
    if (!chatBox) return;
    
    const scrollHeight = chatBox.scrollHeight;
    const currentScroll = chatBox.scrollTop + chatBox.clientHeight;
    
    if (scrollHeight - currentScroll < 300) {
        chatBox.scrollTo({
            top: scrollHeight,
            behavior: 'smooth'
        });
    }
}

// Display Message Function
function displayMessage(msg) {
    try {
        if (!msg || !msg.username) return;

        const messageElement = document.createElement('div');
        messageElement.classList.add(
            'message',
            msg.username === username ? 'sent' : 'received'
        );
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

        let messageContent = '';
        
        // Handle file messages
        if (msg.type === 'file' && msg.file) {
            messageContent = createFileMessage(msg.file);
        } else if (safeText) {
            messageContent = `<div class="message-text">${safeText}</div>`;
        }

        messageElement.innerHTML = `
            <div class="message-header">
                <span class="username">${safeUsername}</span>
                <span class="timestamp">${timestamp}</span>
            </div>
            ${msg.replyTo ? `
                <div class="replied-message">
                    <span class="replied-username">${msg.replyTo.username}</span>
                    <span class="replied-text">${sanitizeHTML(msg.replyTo.text)}</span>
                </div>
            ` : ''}
            <div class="message-content">
                ${messageContent}
                <div class="reply-overlay">
                    <span class="reply-text">↩</span>
                </div>
            </div>
        `;

        const replyOverlay = messageElement.querySelector('.reply-overlay');
        replyOverlay.addEventListener('click', () => {
            currentReplyMessage = {
                username: safeUsername,
                text: msg.type === 'file' ? `📎 ${msg.file.name}` : safeText
            };
            
            replyContainer.innerHTML = `
                <div class="reply-preview">
                    <strong>Replying to ${safeUsername}</strong>
                    <span>${msg.type === 'file' ? `📎 ${msg.file.name}` : safeText}</span>
                </div>
            `;
            replyContainer.style.display = 'flex';
            chatInput.focus();
        });

        chatBox.appendChild(messageElement);

        if (chatBox.children.length > CONFIG.MAX_MESSAGES_DISPLAY) {
            chatBox.removeChild(chatBox.firstChild);
        }

        smoothScroll();
    } catch (error) {
        console.error('Error displaying message:', error);
    }
}

// Join Room
function joinRoom(newRoom) {
    socket.emit('joinRoom', { username, room: newRoom });
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

    leaveRoom();
    chatBox.innerHTML = '';
    currentRoom = newRoom;
    roomName.textContent = newRoom;

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
        Gestures: ['👍', '👎', '🖕', '👏', '🙌', '🤝', '👋', '🤚', '✋', '🖐️', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '✊', '👊', '🤜', '🤛'],
        Animals: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐒', '🐧', '🐦', '🐤', '🦄', '🐝'],
        Food: ['🍎', '🍐', '🍊', '🍋', '🍉', '🍇', '🍓', '🍒', '🍍', '🥭', '🥝', '🍅', '🥦', '🍔', '🍟', '🍕', '🥪', '🍿', '🍰', '🍦', '🍩'],
        Travel: ['🚀', '✈️', '🚁', '🚢', '🚂', '🚗', '🚲', '🏍️', '🚦', '🗽', '🗼', '⛰️', '🌋', '🏖️']
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

    if (friends.list.length === 0) {
        friendsListContainer.innerHTML += '<p class="no-friends">No friends yet. Add some friends!</p>';
        return;
    }

    friends.list.forEach(friend => {
        const friendItem = document.createElement('div');
        friendItem.className = 'friend-item';
        
        friendItem.innerHTML = `
            <img src="${friend.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(friend.username)}" 
                 class="friend-avatar" alt="${friend.username}">
            <div class="friend-info">
                <div class="friend-name">${friend.username}</div>
                <div class="friend-status ${friend.online ? 'online' : 'offline'}">
                    ${friend.online ? 'Online' : 'Offline'} ${friend.status ? '- ' + friend.status : ''}
                </div>
            </div>
            <div class="friend-actions">
                <button class="friend-action-btn chat-with-friend" data-username="${friend.username}">
                    <i class="fas fa-comment"></i>
                </button>
                <button class="friend-action-btn remove-friend" data-username="${friend.username}">
                    <i class="fas fa-user-minus"></i>
                </button>
            </div>
        `;
        
        friendsListContainer.appendChild(friendItem);
    });

    document.querySelectorAll('.chat-with-friend').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const username = e.currentTarget.getAttribute('data-username');
            startPrivateChat(username);
        });
    });

    document.querySelectorAll('.remove-friend').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const username = e.currentTarget.getAttribute('data-username');
            removeFriend(username);
        });
    });
}

function updateFriendRequests() {
    const addFriendTab = document.getElementById('add-friend-tab');
    const requestsContainer = addFriendTab.querySelector('.friend-requests') || document.createElement('div');
    requestsContainer.className = 'friend-requests';
    
    if (friends.requests.length === 0) {
        requestsContainer.innerHTML = '<h3>No pending friend requests</h3>';
    } else {
        requestsContainer.innerHTML = '<h3>Friend Requests</h3>';
        
        friends.requests.forEach(request => {
            const requestItem = document.createElement('div');
            requestItem.className = 'friend-item';
            
            requestItem.innerHTML = `
                <img src="${request.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(request.from)}" 
                     class="friend-avatar" alt="${request.from}">
                <div class="friend-info">
                    <div class="friend-name">${request.from}</div>
                    <div class="friend-status">Wants to be your friend</div>
                </div>
                <div class="friend-actions">
                    <button class="friend-action-btn accept-request" 
                            style="background-color: var(--success-color)"
                            data-username="${request.from}">
                        <i class="fas fa-check"></i>
                    </button>
                    <button class="friend-action-btn decline-request" 
                            style="background-color: var(--error-color)"
                            data-username="${request.from}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
            
            requestsContainer.appendChild(requestItem);
        });

        document.querySelectorAll('.accept-request').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const username = e.currentTarget.getAttribute('data-username');
                respondToFriendRequest(username, true);
            });
        });

        document.querySelectorAll('.decline-request').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const username = e.currentTarget.getAttribute('data-username');
                respondToFriendRequest(username, false);
            });
        });
    }

    if (!addFriendTab.querySelector('.friend-requests')) {
        addFriendTab.appendChild(requestsContainer);
    }
}

// Friend Actions
function addFriend() {
    const friendUsername = friendUsernameInput.value.trim();
    
    if (!friendUsername) {
        alert('Please enter a username');
        return;
    }
    
    if (friendUsername === username) {
        alert("You can't add yourself as a friend!");
        return;
    }
    
    if (friends.list.some(f => f.username === friendUsername)) {
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
        if (response.success) {
            friends.pending.push(friendUsername);
            friendUsernameInput.value = '';
            showNotification(`Friend request sent to ${friendUsername}`);
        } else {
            alert(response.error || 'Failed to send friend request');
        }
    });
}

function respondToFriendRequest(username, accept) {
    socket.emit('respondToFriendRequest', {
        from: username,
        to: username,
        accepted: accept
    }, (response) => {
        if (response.success) {
            friends.requests = friends.requests.filter(r => r.from !== username);
            updateFriendRequests();
            
            if (accept) {
                friends.list.push({
                    username,
                    online: false,
                    status: ''
                });
                updateFriendsList();
            }
        } else {
            alert(response.error || 'Failed to process friend request');
        }
    });
}

function removeFriend(username) {
    if (!confirm(`Are you sure you want to remove ${username} from your friends?`)) {
        return;
    }
    
    socket.emit('removeFriend', {
        username1: username,
        username2: username
    }, (response) => {
        if (!response.success) {
            alert(response.error || 'Failed to remove friend');
        }
    });
}

function startPrivateChat(username) {
    const privateRoom = `private_${[username, username].sort().join('_')}`;
    handleRoomSwitch(privateRoom);
}

// Notification System
function showNotification(message) {
    if (!('Notification' in window)) {
        console.log('This browser does not support desktop notification');
        return;
    }
    
    if (Notification.permission === 'granted') {
        new Notification(message);
    } 
    else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                new Notification(message);
            }
        });
    }
    
    const notification = document.createElement('div');
    notification.className = 'in-app-notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 500);
    }, 3000);
}

// AI Assistant Configuration
const AI_CONFIG = {
    NAME: "AI Assistant",
    RESPONSE_DELAY: 1000,
    RESPONSES: {
        greetings: ["Hello! How can I help you today?", "Hi there! What can I do for you?", "Welcome to AI chat!"],
        questions: {
            "how are you": ["I'm doing well, thank you!", "I'm functioning perfectly, how about you?"],
            "what's your name": ["I'm your AI assistant!", "You can call me AI Assistant"],
            "what can you do": ["I can answer your questions, help with technical topics, and even have a fun conversation!"]
        },
        fallback: ["I'm not sure I understand, could you clarify?", "That's an interesting question, but I'm not certain of the exact answer."]
    }
};

// Handle AI Responses
function handleAIResponse(messageText) {
    const lowerCaseText = messageText.toLowerCase();
    
    if (/hello|hi|hey|greetings/.test(lowerCaseText)) {
        const randomResponse = AI_CONFIG.RESPONSES.greetings[
            Math.floor(Math.random() * AI_CONFIG.RESPONSES.greetings.length)
        ];
        return randomResponse;
    }
    
    for (const [question, answers] of Object.entries(AI_CONFIG.RESPONSES.questions)) {
        if (lowerCaseText.includes(question)) {
            return answers[Math.floor(Math.random() * answers.length)];
        }
    }
    
    return AI_CONFIG.RESPONSES.fallback[
        Math.floor(Math.random() * AI_CONFIG.RESPONSES.fallback.length)
    ];
}

function setupAIChat() {
    const askAIButton = document.getElementById('askAIButton');
    
    askAIButton.addEventListener('click', () => {
        const aiRoomName = `AI_Chat_${Date.now()}`;
        handleRoomSwitch(aiRoomName);
        
        setTimeout(() => {
            const welcomeMessage = {
                username: AI_CONFIG.NAME,
                text: AI_CONFIG.RESPONSES.greetings[0],
                room: aiRoomName,
                timestamp: Date.now()
            };
            socket.emit('chatMessage', welcomeMessage);
        }, 500);
        
        chatInput.placeholder = "Ask AI about anything...";
        document.getElementById('room-name').style.color = "#4a6cff";
    });
}

// Socket Listeners for Friends
function setupFriendSocketListeners() {
    socket.on('friendListUpdate', (updatedList) => {
        friends.list = updatedList;
        updateFriendsList();
    });

    socket.on('friendRequest', (request) => {
        friends.requests.push(request);
        updateFriendRequests();
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

    socket.on('friendStatusUpdate', ({ username, online, status }) => {
        const friend = friends.list.find(f => f.username === username);
        if (friend) {
            friend.online = online;
            friend.status = status;
            updateFriendsList();
        }
    });

    socket.on('friendRemoved', ({ username }) => {
        friends.list = friends.list.filter(f => f.username !== username);
        updateFriendsList();
        showNotification(`${username} is no longer your friend`);
    });
}

// Setup Socket Listeners
function setupSocketListeners() {
    socket.on('message', (msg) => {
        displayMessage(msg);
        
        if (msg.room.includes("AI_Chat") && msg.username !== AI_CONFIG.NAME) {
            setTimeout(() => {
                const aiResponse = {
                    username: AI_CONFIG.NAME,
                    text: handleAIResponse(msg.text),
                    room: msg.room,
                    timestamp: Date.now()
                };
                socket.emit('chatMessage', aiResponse);
            }, AI_CONFIG.RESPONSE_DELAY);
        }
    });

    socket.on('previousMessages', (messages) => {
        messages.forEach(displayMessage);
    });

    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        alert('Connection error. Please try again later.');
    });

    setupFriendSocketListeners();
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
        });
    });

    // Leave Room Button
    leaveRoomBtn.addEventListener('click', () => {
        sessionStorage.removeItem(CONFIG.STORAGE_KEY);
        localStorage.removeItem('user');
        window.location.href = '/login';
    });

    // Chat Form
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const message = chatInput.value.trim();
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
    
            socket.emit('chatMessage', messageData);
            chatInput.value = '';
            currentReplyMessage = null;
            replyContainer.style.display = 'none';
            chatInput.focus();
        } else {
            alert(`Message must be between 1-${CONFIG.MAX_MESSAGE_LENGTH} characters.`);
        }
    });

    // Reply Cancel Button
    replyCancelBtn.addEventListener('click', () => {
        currentReplyMessage = null;
        replyContainer.style.display = 'none';
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
        if (Notification.permission === 'default') {
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

// Optional: Add drag and drop functionality
chatBox.addEventListener('dragover', (e) => {
    e.preventDefault();
    chatBox.classList.add('drag-over');
});

chatBox.addEventListener('dragleave', (e) => {
    e.preventDefault();
    chatBox.classList.remove('drag-over');
});

chatBox.addEventListener('drop', (e) => {
    e.preventDefault();
    chatBox.classList.remove('drag-over');
    
    const files = Array.from(e.dataTransfer.files);
    files.forEach(file => {
        uploadFile(file);
    });
});
}

// Initialization
function init() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    
    if (roomParam) {
        currentRoom = roomParam;
        roomName.textContent = currentRoom;
    }

    joinRoom(currentRoom);
    setupEventListeners();
    setupSocketListeners();
    setupAIChat();

    // Load initial friends list
    socket.emit('getFriendsList', username, (response) => {
        if (response.success) {
            friends.list = response.friends || [];
            friends.requests = response.requests || [];
            friends.pending = response.pending || [];
            
            updateFriendsList();
            updateFriendRequests();
        }
    });
}

// Start the application
init();