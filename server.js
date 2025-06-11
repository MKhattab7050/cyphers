const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const fs = require("fs");
const crypto = require("crypto");
require("dotenv").config();

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Passport configuration
const passport = require('passport');
require('./config/passport');
app.use(passport.initialize());

// Configuration
const PORT = process.env.PORT || 5000;

// File Upload Configuration
const UPLOAD_CONFIG = {
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

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileExtension = path.extname(file.originalname);
        cb(null, crypto.randomUUID() + '-' + uniqueSuffix + fileExtension);
    }
});

const fileFilter = (req, file, cb) => {
    const fileExtension = path.extname(file.originalname).toLowerCase().substring(1);
    const allAllowedTypes = Object.values(UPLOAD_CONFIG.ALLOWED_FILE_TYPES).flat();
    
    if (allAllowedTypes.includes(fileExtension)) {
        cb(null, true);
    } else {
        cb(new Error(`File type .${fileExtension} is not allowed`), false);
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: UPLOAD_CONFIG.MAX_FILE_SIZE
    },
    fileFilter: fileFilter
});

// Middleware Setup
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, "client")));
app.use('/uploads', express.static(uploadsDir)); // Serve uploaded files

// Database and Models
const db = require('./db');
const MessageModel = require("./Models/messageModel");
const FriendRequestModel = require('./Models/friendRequestModel');

// File Model for database operations
const FileModel = {
    async saveFile(fileData) {
        const query = `
            INSERT INTO files (filename, original_name, file_path, file_size, file_type, mime_type, username, room, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;
        
        try {
            const result = await db.query(query, [
                fileData.filename,
                fileData.originalName,
                fileData.filePath,
                fileData.fileSize,
                fileData.fileType,
                fileData.mimeType,
                fileData.username,
                fileData.room
            ]);
            return result;
        } catch (error) {
            throw error;
        }
    },

    async getFileById(fileId) {
        const query = 'SELECT * FROM files WHERE id = ?';
        try {
            const results = await db.query(query, [fileId]);
            return results[0] || null;
        } catch (error) {
            throw error;
        }
    },

    async getFilesByRoom(room) {
        const query = 'SELECT * FROM files WHERE room = ? ORDER BY created_at DESC';
        try {
            const results = await db.query(query, [room]);
            return results;
        } catch (error) {
            throw error;
        }
    }
};

// Utility Functions
const getFileExtension = (filename) => {
    return path.extname(filename).toLowerCase().substring(1);
};

const getFileType = (filename) => {
    const extension = getFileExtension(filename);
    for (const [type, extensions] of Object.entries(UPLOAD_CONFIG.ALLOWED_FILE_TYPES)) {
        if (extensions.includes(extension)) {
            return type;
        }
    }
    return 'other';
};

const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Routes Setup
const userRoute = require("./Routes/userRoute");
const walletRoute = require("./wallet"); 
const userController = require('./controllers/userController');

// Google OAuth routes
app.get('/auth/google', userController.authGoogle);
app.get('/auth/google/callback', userController.authGoogleCallback);

// API Routes
app.post("/api/users/register", userController.registerUser);
app.post("/api/users/login", userController.loginUser);

// User routes
app.use("/api/users", userRoute);
app.use("/api/wallet", walletRoute);

// File Upload Route
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }

        const { username, room, fileId } = req.body;

        if (!username || !room) {
            // Clean up uploaded file if required fields are missing
            fs.unlinkSync(req.file.path);
            return res.status(400).json({
                success: false,
                error: 'Username and room are required'
            });
        }

        const fileType = getFileType(req.file.originalname);
        const fileUrl = `/uploads/${req.file.filename}`;

        // Save file information to database
        const fileData = {
            filename: req.file.filename,
            originalName: req.file.originalname,
            filePath: req.file.path,
            fileSize: req.file.size,
            fileType: fileType,
            mimeType: req.file.mimetype,
            username: username,
            room: room
        };

        const dbResult = await FileModel.saveFile(fileData);
        const savedFileId = dbResult.insertId;

        // Prepare response
        const fileResponse = {
            id: savedFileId,
            name: req.file.originalname,
            url: fileUrl,
            size: req.file.size,
            type: fileType,
            mimeType: req.file.mimetype,
            uploadedBy: username,
            uploadedAt: new Date().toISOString()
        };

        res.json({
            success: true,
            file: fileResponse,
            message: 'File uploaded successfully'
        });

    } catch (error) {
        console.error('File upload error:', error);
        
        // Clean up file if there was an error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            success: false,
            error: 'File upload failed: ' + error.message
        });
    }
});

// File Download Route
app.get('/download/:fileId', async (req, res) => {
    try {
        const fileId = req.params.fileId;
        const file = await FileModel.getFileById(fileId);

        if (!file) {
            return res.status(404).json({
                success: false,
                error: 'File not found'
            });
        }

        if (!fs.existsSync(file.file_path)) {
            return res.status(404).json({
                success: false,
                error: 'File no longer exists on server'
            });
        }

        res.download(file.file_path, file.original_name);
    } catch (error) {
        console.error('File download error:', error);
        res.status(500).json({
            success: false,
            error: 'File download failed'
        });
    }
});

// HTML Routes
app.get("/chat/:room", serveChatPage);
app.get("/login", serveLoginPage);
app.get("/chat", serveChatPage);
app.get("/", (req, res) => {
  res.redirect('/chat');
});

// In-memory storage for friends and user sessions
const userSessions = new Map();
const friendRequests = new Map();
const userFriends = new Map();

// Socket.io Setup
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Socket.io Event Handlers
io.on("connection", (socket) => {
  console.log("New user connected:", socket.id);

  // Basic room joining
  socket.on("join-room", handleJoinRoom);
  
  // Advanced room management
  socket.on('joinRoom', handleAdvancedJoinRoom);
  socket.on('leaveRoom', handleLeaveRoom);
  
  // Message handling
  socket.on('chatMessage', handleChatMessage);
  
  // Friends system
  socket.on('sendFriendRequest', handleSendFriendRequest);
  socket.on('respondToFriendRequest', handleRespondToFriendRequest);
  socket.on('getFriendsList', handleGetFriendsList);
  socket.on('removeFriend', handleRemoveFriend);
  socket.on('updateUserStatus', handleUpdateUserStatus);
  
  // User management
  socket.on('userOnline', handleUserOnline);
  socket.on('userOffline', handleUserOffline);
  
  // Disconnect handling
  socket.on('disconnect', handleDisconnect);
});

// Static File Serving
function serveChatPage(req, res) {
  res.sendFile(path.join(__dirname, "client", "chat.html"));
}

function serveLoginPage(req, res) {
  res.sendFile(path.join(__dirname, "client", "login.html"));
}

// =====================
// SOCKET.IO HANDLERS
// =====================

function handleJoinRoom(roomId) {
  this.join(roomId);
  this.on("message", (msg) => {
    this.to(roomId).emit("message", msg);
  });
}

async function handleAdvancedJoinRoom({ username, room }, callback) {
  try {
    if (!username || !room) {
      callback?.({ error: "Username and room are required" });
      return;
    }

    // Store user session
    this.username = username;
    this.currentRoom = room;

    this.join(room);
    console.log(`${username} joined room: ${room}`);

    // Get previous messages (including file messages)
    try {
      const messages = await MessageModel.getMessagesByRoom(room);
      
      // Process messages to include file data if they exist
      const processedMessages = await Promise.all(messages.map(async (msg) => {
        if (msg.type === 'file' && msg.file_id) {
          try {
            const fileData = await FileModel.getFileById(msg.file_id);
            if (fileData) {
              msg.file = {
                id: fileData.id,
                name: fileData.original_name,
                url: `/uploads/${fileData.filename}`,
                size: fileData.file_size,
                type: fileData.file_type,
                mimeType: fileData.mime_type
              };
            }
          } catch (error) {
            console.error('Error fetching file data for message:', error);
          }
        }
        return msg;
      }));
      
      this.emit('previousMessages', processedMessages);
    } catch (error) {
      console.error('Error fetching previous messages:', error);
      this.emit('previousMessages', []);
    }

    // Notify other users
    this.to(room).emit('message', {
      username: 'System',
      text: `${username} has joined the room`,
      timestamp: new Date(),
      room: room
    });

    updateUserCount(room);
    
    // Update user online status
    updateUserOnlineStatus(username, true);
    
    callback?.({ status: "success" });
  } catch (error) {
    console.error("Join room error:", error);
    callback?.({ error: "Failed to join room" });
  }
}

async function handleChatMessage(messageData, callback) {
  try {
    const { text, room, username, replyTo, type, file } = messageData;

    if (!room || !username) {
      callback?.({ error: "Missing required fields" });
      return;
    }

    // Validate message type
    if (type === 'file' && !file) {
      callback?.({ error: "File data is required for file messages" });
      return;
    }

    if (type !== 'file' && !text) {
      callback?.({ error: "Text is required for text messages" });
      return;
    }

    let replyData = null;
    if (replyTo) {
      try {
        replyData = typeof replyTo === 'string' ? JSON.parse(replyTo) : replyTo;
      } catch (e) {
        console.error("Error parsing reply data:", e);
      }
    }

    // Save message to database
    let messageId = Date.now();
    try {
      const messageToSave = {
        text: text || null,
        username,
        room,
        type: type || 'text',
        file_id: (type === 'file' && file) ? file.id : null,
        replyTo: replyData ? JSON.stringify(replyData) : null,
        timestamp: new Date()
      };

      const newMessage = await MessageModel.saveMessage(messageToSave);
      messageId = newMessage.insertId || messageId;
    } catch (error) {
      console.error("Error saving message to database:", error);
    }

    const messageToSend = {
      id: messageId,
      text,
      username,
      room,
      type: type || 'text',
      file: file || null,
      replyTo: replyData,
      timestamp: new Date()
    };

    io.to(room).emit('message', messageToSend);
    callback?.({ status: "success", messageId: messageId });
  } catch (error) {
    console.error("Message send error:", error);
    callback?.({ error: "Failed to send message" });
  }
}

function handleLeaveRoom(room) {
  if (this.currentRoom === room) {
    this.leave(room);
    this.currentRoom = null;
    updateUserCount(room);
    
    if (this.username) {
      this.to(room).emit('message', {
        username: 'System',
        text: `${this.username} has left the room`,
        timestamp: new Date(),
        room: room
      });
    }
  }
}

// =====================
// FRIENDS SYSTEM HANDLERS
// =====================

function handleSendFriendRequest({ from, to }, callback) {
  try {
    if (!from || !to) {
      callback?.({ success: false, error: "Missing username" });
      return;
    }

    if (from === to) {
      callback?.({ success: false, error: "Cannot add yourself as friend" });
      return;
    }

    // Check if already friends
    const senderFriends = userFriends.get(from) || [];
    if (senderFriends.some(friend => friend.username === to)) {
      callback?.({ success: false, error: "Already friends" });
      return;
    }

    // Check if request already exists
    const receiverRequests = friendRequests.get(to) || [];
    if (receiverRequests.some(req => req.from === from)) {
      callback?.({ success: false, error: "Friend request already sent" });
      return;
    }

    // Add friend request
    const newRequest = {
      from: from,
      to: to,
      timestamp: new Date(),
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(from)}`
    };

    if (!friendRequests.has(to)) {
      friendRequests.set(to, []);
    }
    friendRequests.get(to).push(newRequest);

    // Notify the receiver if they're online
    const receiverSocket = findUserSocket(to);
    if (receiverSocket) {
      receiverSocket.emit('friendRequest', newRequest);
    }

    callback?.({ success: true });
  } catch (error) {
    console.error("Send friend request error:", error);
    callback?.({ success: false, error: "Failed to send friend request" });
  }
}

function handleRespondToFriendRequest({ from, to, accepted }, callback) {
  try {
    if (!from || !to) {
      callback?.({ success: false, error: "Missing username" });
      return;
    }

    // Remove the request
    const requests = friendRequests.get(to) || [];
    const requestIndex = requests.findIndex(req => req.from === from);
    
    if (requestIndex === -1) {
      callback?.({ success: false, error: "Friend request not found" });
      return;
    }

    requests.splice(requestIndex, 1);
    friendRequests.set(to, requests);

    if (accepted) {
      // Add to both users' friend lists
      const friend1Data = {
        username: to,
        online: isUserOnline(to),
        status: '',
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(to)}`
      };
      
      const friend2Data = {
        username: from,
        online: isUserOnline(from),
        status: '',
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(from)}`
      };

      if (!userFriends.has(from)) {
        userFriends.set(from, []);
      }
      if (!userFriends.has(to)) {
        userFriends.set(to, []);
      }

      userFriends.get(from).push(friend1Data);
      userFriends.get(to).push(friend2Data);

      // Notify both users
      const senderSocket = findUserSocket(from);
      const receiverSocket = findUserSocket(to);

      if (senderSocket) {
        senderSocket.emit('friendRequestResponse', { from: to, accepted: true });
        senderSocket.emit('friendListUpdate', userFriends.get(from) || []);
      }

      if (receiverSocket) {
        receiverSocket.emit('friendListUpdate', userFriends.get(to) || []);
      }
    } else {
      // Just notify the sender that request was declined
      const senderSocket = findUserSocket(from);
      if (senderSocket) {
        senderSocket.emit('friendRequestResponse', { from: to, accepted: false });
      }
    }

    callback?.({ success: true });
  } catch (error) {
    console.error("Respond to friend request error:", error);
    callback?.({ success: false, error: "Failed to process friend request" });
  }
}

function handleGetFriendsList(username, callback) {
  try {
    const friends = userFriends.get(username) || [];
    const requests = friendRequests.get(username) || [];
    const pending = [];

    callback?.({
      success: true,
      friends: friends,
      requests: requests,
      pending: pending
    });
  } catch (error) {
    console.error("Get friends list error:", error);
    callback?.({ success: false, error: "Failed to get friends list" });
  }
}

function handleRemoveFriend({ username1, username2 }, callback) {
  try {
    if (!username1 || !username2) {
      callback?.({ success: false, error: "Missing username" });
      return;
    }

    // Remove from both users' friend lists
    const user1Friends = userFriends.get(username1) || [];
    const user2Friends = userFriends.get(username2) || [];

    const updatedUser1Friends = user1Friends.filter(friend => friend.username !== username2);
    const updatedUser2Friends = user2Friends.filter(friend => friend.username !== username1);

    userFriends.set(username1, updatedUser1Friends);
    userFriends.set(username2, updatedUser2Friends);

    // Notify both users
    const user1Socket = findUserSocket(username1);
    const user2Socket = findUserSocket(username2);

    if (user1Socket) {
      user1Socket.emit('friendListUpdate', updatedUser1Friends);
    }

    if (user2Socket) {
      user2Socket.emit('friendListUpdate', updatedUser2Friends);
      user2Socket.emit('friendRemoved', { username: username1 });
    }

    callback?.({ success: true });
  } catch (error) {
    console.error("Remove friend error:", error);
    callback?.({ success: false, error: "Failed to remove friend" });
  }
}

function handleUpdateUserStatus({ username, status }) {
  try {
    // Update status in all friend lists
    for (let [user, friends] of userFriends.entries()) {
      const friendIndex = friends.findIndex(friend => friend.username === username);
      if (friendIndex !== -1) {
        friends[friendIndex].status = status;
        
        // Notify the user
        const userSocket = findUserSocket(user);
        if (userSocket) {
          userSocket.emit('friendStatusUpdate', {
            username: username,
            online: isUserOnline(username),
            status: status
          });
        }
      }
    }
  } catch (error) {
    console.error("Update user status error:", error);
  }
}

function handleUserOnline({ username }) {
  updateUserOnlineStatus(username, true);
}

function handleUserOffline({ username }) {
  updateUserOnlineStatus(username, false);
}

function handleDisconnect() {
  console.log("User disconnected:", this.id);
  
  if (this.username) {
    updateUserOnlineStatus(this.username, false);
    
    if (this.currentRoom) {
      this.to(this.currentRoom).emit('message', {
        username: 'System',
        text: `${this.username} has disconnected`,
        timestamp: new Date(),
        room: this.currentRoom
      });
      updateUserCount(this.currentRoom);
    }
  }
}

// =====================
// UTILITY FUNCTIONS
// =====================

function updateUserCount(room) {
  const roomUsers = io.sockets.adapter.rooms.get(room);
  const userCount = roomUsers ? roomUsers.size : 0;
  io.to(room).emit('roomUserCount', { room, count: userCount });
}

function updateUserOnlineStatus(username, online) {
  // Update online status in all friend lists
  for (let [user, friends] of userFriends.entries()) {
    const friendIndex = friends.findIndex(friend => friend.username === username);
    if (friendIndex !== -1) {
      friends[friendIndex].online = online;
      
      // Notify the user
      const userSocket = findUserSocket(user);
      if (userSocket) {
        userSocket.emit('friendStatusUpdate', {
          username: username,
          online: online,
          status: friends[friendIndex].status || ''
        });
      }
    }
  }
}

function findUserSocket(username) {
  for (let [socketId, socket] of io.sockets.sockets) {
    if (socket.username === username) {
      return socket;
    }
  }
  return null;
}

function isUserOnline(username) {
  return findUserSocket(username) !== null;
}

// Error Handling
process.on('uncaughtException', handleUncaughtException);
process.on('unhandledRejection', handleUnhandledRejection);

function handleUncaughtException(err) {
  console.error('Uncaught Exception:', err);
}

function handleUnhandledRejection(err) {
  console.error('Unhandled Rejection:', err);
}

// Cleanup function for old files (optional)
function cleanupOldFiles() {
  // Implement cleanup logic for files older than X days
  // This is optional and can be scheduled to run periodically
}

// Start Server
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Uploads directory: ${uploadsDir}`);
});