const path = require("path");

// Load environment variables from .env (works from the project root or from the parent folder)
// dotenv never overrides a variable that is already set, so calling it twice is safe.
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const fs = require("fs");
const crypto = require("crypto");

// Initialize Express app
const requireAuth = require('./middleware/requireAuth');
const { readToken, verifyToken } = require('./config/auth');
const app = express();
const server = http.createServer(app);

// Passport configuration
const passport = require('passport');
require('./config/passport');
app.use(passport.initialize());

// Configuration
const PORT = process.env.PORT || 5000;

// Debug: Log environment variables (never print secrets)
console.log('GOOGLE_CLIENT_ID set:', !!process.env.GOOGLE_CLIENT_ID);
console.log('GOOGLE_CLIENT_SECRET set:', !!process.env.GOOGLE_CLIENT_SECRET);
console.log('GOOGLE_CALLBACK_URL:', process.env.GOOGLE_CALLBACK_URL);
console.log('OPENROUTER_API_KEY set:', !!process.env.OPENROUTER_API_KEY);

// =====================
// AI CONFIGURATION (OpenRouter - free models only)
// =====================
const AI_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Models are tried in order. If one fails (removed, busy, rate-limited, empty reply)
// the next one is used. You can override the list with AI_MODELS in .env
// (comma-separated). Keep "openrouter/free" last: it picks any working free model.
const AI_MODELS = (process.env.AI_MODELS ||
    'openrouter/free')
    .split(',')
    .map(m => m.trim())
    .filter(Boolean);

const AI_SYSTEM_PROMPT = process.env.AI_SYSTEM_PROMPT ||
    'You are a friendly, concise assistant inside a chat app called Cyphers Chat. ' +
    'Answer clearly and keep replies short unless asked for detail. ' +
    'Always reply in the same language the user writes in.';

const AI_MAX_TOKENS = parseInt(process.env.AI_MAX_TOKENS, 10) || 1024;
const AI_TEMPERATURE = 0.7;

// Simple in-memory rate limiter for the AI endpoint (per IP, no extra packages needed)
const AI_RATE_LIMIT = { windowMs: 60 * 1000, max: 10 };
const aiHits = new Map();

function aiRateLimiter(req, res, next) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const hits = (aiHits.get(ip) || []).filter(t => now - t < AI_RATE_LIMIT.windowMs);

    if (hits.length >= AI_RATE_LIMIT.max) {
        return res.status(429).json({ error: 'Too many AI requests. Please wait a minute and try again.' });
    }

    hits.push(now);
    aiHits.set(ip, hits);
    next();
}

// Clean up old rate-limit entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [ip, hits] of aiHits.entries()) {
        const fresh = hits.filter(t => now - t < AI_RATE_LIMIT.windowMs);
        if (fresh.length) aiHits.set(ip, fresh);
        else aiHits.delete(ip);
    }
}, 5 * 60 * 1000).unref();

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

// Create saves directory if it doesn't exist
const savesDir = path.join(__dirname, 'saves');
if (!fs.existsSync(savesDir)) {
    fs.mkdirSync(savesDir, { recursive: true });
    console.log('✅ Created saves directory:', savesDir);
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, savesDir);
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

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, "client")));
app.use('/saves', requireAuth, async (req, res, next) => {
    try {
        const rows = await db.query('SELECT room FROM files WHERE filename = ?', [path.basename(req.path)]);
        if (!rows[0]) return res.sendStatus(404);
        if (!canAccessRoom(req.user.username, rows[0].room)) return res.sendStatus(403);
        next();
    } catch (error) { next(error); }
}, express.static(savesDir, {
    setHeaders: (res, filePath) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (['.html', '.svg', '.xml', '.js'].includes(path.extname(filePath).toLowerCase())) {
            res.setHeader('Content-Disposition', 'attachment');
        }
    }
})); // Serve uploaded files securely


// Database and Models
const db = require('./config/db');
const MessageModel = require("./Models/messageModel");
const FriendRequestModel = require('./Models/friendRequestModel');
const FriendModel = require('./Models/friendModel');

// File Model for database operations
const FileModel = {
    async saveFile(fileData) {
        const query = `
            INSERT INTO files (filename, original_name, file_path, file_size, file_type, mime_type, username, room, duration, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
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
                fileData.room,
                fileData.duration || null
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
const userController = require('./Controllers/userController');

// wallet route — load only if the file exists
let walletRoute = null;
try {
    walletRoute = require("./wallet");
} catch (e) {
    console.warn('[server] wallet.js not found — /api/wallet routes disabled');
}

// =====================
// AI ASSISTANT ROUTE
// =====================
// The browser sends the conversation to this endpoint; no API key ever reaches the browser.
// Body: { messages: [{ role: 'user' | 'assistant', content: '...' }, ...] }
// Response: { reply: '...', model: '...', provider: '...' }
//
// Order of providers:
//   1) OpenRouter free models (only if OPENROUTER_API_KEY is set in .env)
//   2) Keyless providers: no account and no API key needed (can be disabled with AI_KEYLESS=false)
// So the AI works out of the box even with an empty .env.

const AI_KEYLESS_ENABLED = String(process.env.AI_KEYLESS || 'true').toLowerCase() !== 'false';

const KEYLESS_PROVIDERS = [
    {
        name: 'pollinations',
        url: 'https://text.pollinations.ai/openai',
        models: ['openai']   // اسم عام، المزود بيختار الموديل
    },
    {
        name: 'llm7',
        url: 'https://api.llm7.io/v1/chat/completions',
        modelsUrl: 'https://api.llm7.io/v1/models',
        fallbackModels: ['default']
    },
    {
        name: 'kilo',
        url: 'https://api.kilo.ai/api/gateway/chat/completions',
        models: ['kilo-auto/free']
    }

];

const keylessModelCache = {};

async function getKeylessModels(provider) {
    if (provider.models && provider.models.length) return provider.models;

    const cached = keylessModelCache[provider.name];
    if (cached && Date.now() - cached.time < 10 * 60 * 1000) return cached.models;

    let models = [];
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(provider.modelsUrl, { signal: controller.signal });
        clearTimeout(timeout);

        if (response.ok) {
            const data = await response.json();
            const list = Array.isArray(data) ? data : (data.data || []);
            models = list
                .map(m => (typeof m === 'string' ? m : (m.id || m.name)))
                .filter(id => typeof id === 'string' && id.length > 0)
                .slice(0, 3);
        }
    } catch (err) {
        console.warn(`[AI] could not list models for ${provider.name}:`, err.message);
    }

    models = [...models, ...(provider.fallbackModels || [])];
    keylessModelCache[provider.name] = { models, time: Date.now() };
    return models;
}

// Calls any OpenAI-compatible /chat/completions endpoint
async function callChatCompletion({ url, headers = {}, model, messages, timeoutMs = 45000 }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify({
                model,
                messages,
                max_tokens: AI_MAX_TOKENS,
                temperature: AI_TEMPERATURE
            })
        });

        if (!response.ok) {
            let body = '';
            try { body = (await response.text()).slice(0, 300); } catch (e) {}
            return { ok: false, status: response.status, body };
        }

        const data = await response.json();
        let reply = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
        if (typeof reply !== 'string') reply = '';

        // Remove "thinking" blocks that some reasoning models include
        reply = reply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

        return { ok: true, reply, model: data.model || model };
    } catch (err) {
        return { ok: false, status: 0, body: err.name === 'AbortError' ? 'timeout' : err.message };
    } finally {
        clearTimeout(timeout);
    }
}

async function publishAIResponse(req, res, result, provider) {
    const room = req.body.room;
    if (room) {
        const message = { username: 'AI Assistant', room, text: result.reply, type: 'text', timestamp: new Date() };
        const saved = await MessageModel.saveMessage(message);
        io.to(room).emit(room.startsWith('private ') ? 'privateMessage' : 'message', { ...message, id: saved.insertId });
    }
    return res.json({ reply: result.reply, model: result.model, provider, broadcast: Boolean(room) });
}
app.post('/api/ai', requireAuth, aiRateLimiter, async (req, res) => {
    const deadline = Date.now() + 100000;
    if (req.body.room && !canAccessRoom(req.user.username, req.body.room)) return res.status(403).json({ error: 'Access denied' });
    try {
        if (typeof fetch !== 'function') {
            return res.status(500).json({ error: 'AI requires Node.js 18 or newer.' });
        }

        const { messages } = req.body || {};
        if (!Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: 'messages is required' });
        }

        // Sanitize input: last 10 messages, only user/assistant roles, capped length
        const safeMessages = [
            { role: 'system', content: AI_SYSTEM_PROMPT },
            ...messages
                .slice(-10)
                .map(m => ({
                    role: m && m.role === 'assistant' ? 'assistant' : 'user',
                    content: String((m && m.content) || '').slice(0, 4000)
                }))
                .filter(m => m.content.trim().length > 0)
        ];

        if (safeMessages.length < 2) {
            return res.status(400).json({ error: 'Message is empty' });
        }

        // 1) OpenRouter (optional, only if a key is configured)
        if (process.env.OPENROUTER_API_KEY) {
            for (const model of AI_MODELS) {
                if (Date.now() >= deadline) break;
                const result = await callChatCompletion({
                    url: AI_API_URL,
                    timeoutMs: Math.min(30000, Math.max(1, deadline - Date.now())),
                    headers: {
                        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                        'HTTP-Referer': process.env.APP_URL || `http://localhost:${PORT}`,
                        'X-Title': 'Cyphers Chat'
                    },
                    model,
                    messages: safeMessages
                });

                if (result.ok && result.reply) {
                    return await publishAIResponse(req, res, result, 'openrouter');
                }

                console.warn(`[AI] openrouter ${model} failed (${result.status}): ${result.body || 'empty reply'}`);

                if (result.status === 401) {
                    console.warn('[AI] OpenRouter key is invalid, skipping OpenRouter');
                    break;
                }
            }
        }

        // 2) Keyless providers (no account / no API key)
        if (AI_KEYLESS_ENABLED) {
            for (const provider of KEYLESS_PROVIDERS) {
                if (Date.now() + 10000 >= deadline) break;
                const models = await getKeylessModels(provider);

                for (const model of models.slice(0, 2)) {
                    if (Date.now() >= deadline) break;
                    const result = await callChatCompletion({
                        url: provider.url,
                        model,
                        messages: safeMessages,
                        timeoutMs: Math.min(30000, Math.max(1, deadline - Date.now()))
                    });

                    if (result.ok && result.reply) {
                        return await publishAIResponse(req, res, result, provider.name);
                    }

                    console.warn(`[AI] ${provider.name} ${model} failed (${result.status}): ${result.body || 'empty reply'}`);
                }
            }
        }

        res.status(503).json({ error: 'AI service temporarily unavailable. Please try again in a minute.' });
    } catch (error) {
        console.error('[AI] Unexpected error:', error);
        res.status(500).json({ error: 'AI request failed' });
    }
});

// Google OAuth routes
app.get('/auth/google', userController.authGoogle);
app.get('/auth/google/callback', userController.authGoogleCallback);

// API Routes
app.post("/api/users/register", userController.registerUser);
app.post("/api/users/login", userController.loginUser);

// User routes
app.post('/api/users/logout', (req, res) => {
    res.clearCookie('jwt', { path: '/' });
    res.json({ success: true });
});
app.use("/api/users", userRoute);
if (walletRoute) {
    app.use("/api/wallet", walletRoute);
}

// File Upload Middleware with error handling
const uploadSingle = (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 50MB)' : err.message;
            return res.status(400).json({ success: false, error: msg });
        }
        next();
    });
};

// File Upload Route
app.post('/upload', requireAuth, uploadSingle, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }

        const { room, fileId, duration, type } = req.body;
        const username = req.user.username;
        if (!canAccessRoom(username, room)) {
            fs.unlinkSync(req.file.path);
            return res.status(403).json({ error: "Access denied" });
        }

        if (!username || !canAccessRoom(username, room)) {
            // Clean up uploaded file if required fields are missing
            fs.unlinkSync(req.file.path);
            return res.status(400).json({
                success: false,
                error: 'Username and room are required'
            });
        }

        const fileType = getFileType(req.file.originalname);
        const fileUrl = `/saves/${req.file.filename}`;

        // Save file information to database
        const fileData = {
            filename: req.file.filename,
            originalName: req.file.originalname,
            filePath: req.file.path,
            fileSize: req.file.size,
            fileType: fileType,
            mimeType: req.file.mimetype,
            username: username,
            room: room,
            duration: duration ? parseInt(duration, 10) : null
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
        
        // Add duration for voice messages
        if (type === 'voice' && duration) {
            fileResponse.duration = parseInt(duration, 10);
        }

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
app.get('/download/:fileId', requireAuth, async (req, res) => {
    try {
        const fileId = req.params.fileId;
        const file = await FileModel.getFileById(fileId);

        if (!file) {
            return res.status(404).json({
                success: false,
                error: 'File not found'
            });
        }

        if (!canAccessRoom(req.user.username, file.room)) return res.status(403).json({ error: 'Access denied' });
        // Resolve uploads relative to this checkout, not an old machine's absolute path.
        file.file_path = path.join(savesDir, path.basename(file.filename));
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

// Socket.io Setup
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

function privateMembers(room) {
    try { return room.slice(8).split('_').map(decodeURIComponent); } catch { return []; }
}
function canAccessRoom(username, room) {
    if (typeof room !== 'string' || !room.trim() || room.length > 255) return false;
    if (!room.startsWith('private ')) return true;
    const members = privateMembers(room);
    return members.length === 2 && members.includes(username);
}
io.use(async (socket, next) => {
    try {
        const identity = verifyToken(socket.handshake.auth?.token || readToken(socket.handshake.headers));
        const rows = await db.query('SELECT id, username FROM users WHERE id = ?', [identity.userId]);
        if (!rows[0]?.username) return next(new Error('Unauthorized'));
        socket.username = rows[0].username;
        next();
    } catch { next(new Error('Unauthorized')); }
});
// Socket.io Event Handlers
io.on("connection", (socket) => {
  console.log("New user connected:", socket.id);

  // Validate payloads once, including handlers that destructure their argument.
  socket.use(([event, data], next) => {
    if (['disconnect', 'requestUsersUpdate'].includes(event)) return next();
    if (['join-room', 'leaveRoom'].includes(event)) {
      if (!canAccessRoom(socket.username, data)) return;
    } else if (['getFriendsList', 'getPendingRequests', 'userOnline', 'userOffline'].includes(event)) {
      return next();
    } else if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    next();
  });
  // Basic room joining
  socket.on("join-room", handleJoinRoom.bind(socket));
  
  // Advanced room management
  socket.on('joinRoom', handleAdvancedJoinRoom.bind(socket));
  socket.on('leaveRoom', handleLeaveRoom);
  
  // Message handling
  socket.on('chatMessage', handleChatMessage);
  
  // Typing indicators
  socket.on('typing', (data) => {
    const { room, username } = data;
    if (room && username) {
      socket.to(room).emit('userTyping', { username, room });
    }
  });
  
  socket.on('stopTyping', (data) => {
    const { room, username } = data;
    if (room && username) {
      socket.to(room).emit('userStoppedTyping', { username, room });
    }
  });
  
  // Friends system
  socket.on('sendFriendRequest', (data) => {
        handleSendFriendRequest(data, socket);
    });

    socket.on('respondToFriendRequest', (data) => {
        handleRespondToFriendRequest(data, socket);
    });

    socket.on('getPendingRequests', (data) => {
        handleGetPendingRequests(data, socket);
    });

    socket.on('getFriendsList', (data) => {
        handleGetFriendsList(data, socket);
    });
  
  // Message operations
  socket.on('deleteMessage', async ({ messageId, room } = {}) => {
    try {
        if (!messageId || !socket.rooms.has(room) || !socket.username) return;
        const r = await db.query('DELETE FROM messages WHERE id = ? AND username = ? AND room = ?', [messageId, socket.username, room]);
        if (r && r.affectedRows === 0) return;
        socket.to(room).emit('messageDeleted', { messageId, room });
    } catch (e) { console.error('deleteMessage error:', e); }
  });

  socket.on('editMessage', async ({ messageId, room, newText } = {}) => {
    try {
        if (!messageId || !socket.rooms.has(room) || !socket.username || typeof newText !== 'string') return;
        newText = newText.trim().slice(0, 16000);
        if (!newText) return;
        const r = await db.query('UPDATE messages SET text = ?, is_edited = 1 WHERE id = ? AND username = ? AND room = ?', [newText, messageId, socket.username, room]);
        if (r && r.affectedRows === 0) return;
        socket.to(room).emit('messageEdited', { messageId, room, newText });
    } catch (e) { console.error('editMessage error:', e); }
  });

  socket.on('messageReaction', ({ messageId, room, emoji } = {}) => {
    if (!messageId || !socket.rooms.has(room) || typeof emoji !== 'string' || emoji.length > 8) return;
    socket.to(room).emit('messageReaction', { messageId, room, emoji, username: socket.username });
  });
  
  socket.on('removeFriend', (data) => handleRemoveFriend(data, socket));
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


async function handleJoinRoom(roomId) {
    return handleAdvancedJoinRoom.call(this, { room: roomId });
}
async function hydrateMessage(msg) {
    if (msg.file_id && ['file', 'voice'].includes(msg.type)) {
        const file = await FileModel.getFileById(msg.file_id);
        if (file) msg.file = { id: file.id, name: file.original_name, url: '/saves/' + file.filename, size: file.file_size, type: file.file_type, mimeType: file.mime_type, duration: file.duration };
    }
    return msg;
}
async function handleAdvancedJoinRoom({ room } = {}, callback) {
    const reply = typeof callback === 'function' ? callback : () => {};
    const username = this.username;
    if (!username || !canAccessRoom(username, room)) return reply({ error: 'Access denied' });
    try {
        const privateRoom = room.startsWith('private ');
        const members = privateRoom ? privateMembers(room) : [];
        const history = privateRoom ? await MessageModel.getPrivateMessages(...members) : await MessageModel.getMessagesByRoom(room);
        const messages = await Promise.all(history.map(hydrateMessage));
        if (this.currentRoom && this.currentRoom !== room) {
            this.leave(this.currentRoom);
            updateUserCount(this.currentRoom);
        }
        this.currentRoom = room;
        await this.join(room);
        this.emit('previousMessages', messages);
        if (!privateRoom) this.to(room).emit('message', { username: 'System', text: username + ' has joined the room', room, timestamp: new Date() });
        updateUserCount(room);
        await updateUserOnlineStatus(username, true);
        await notifyFriendsOfStatusChange(username, true, room);
        reply({ status: 'success' });
    } catch (error) {
        console.error('Join room failed:', error.message);
        reply({ error: 'Unable to load room history' });
    }
}
function handleLeaveRoom(room) {
    if (this.currentRoom !== room) return;
    this.leave(room);
    this.currentRoom = null;
    updateUserCount(room);
}
async function handleChatMessage(data, callback) {
    const reply = typeof callback === 'function' ? callback : () => {};
    try {
        const { room, username, text, replyTo, file } = data || {};
        const type = data?.type || 'text';
        if (username !== this.username || !this.rooms.has(room) || !canAccessRoom(this.username, room)) return reply({ error: 'Access denied' });
        if (!['text', 'file', 'voice'].includes(type)) return reply({ error: 'Unsupported message type' });
        if (type === 'text' && (typeof text !== 'string' || !text.trim() || text.length > 16000)) return reply({ error: 'Invalid message text' });
        let attachment;
        if (type !== 'text') {
            attachment = file?.id ? await FileModel.getFileById(file.id) : null;
            if (!attachment || attachment.username !== username || attachment.room !== room) return reply({ error: 'Invalid attachment' });
        }
        let quoted = null;
        if (replyTo) {
            const source = typeof replyTo === 'string' ? JSON.parse(replyTo) : replyTo;
            quoted = { username: String(source.username || '').slice(0, 255), text: String(source.text || '').slice(0, 4000) };
        }
        const saved = await MessageModel.saveMessage({ username, room, text: text || null, type, file_id: attachment?.id || null, replyTo: quoted, timestamp: new Date() });
        const message = await hydrateMessage({ id: saved.insertId, username, room, text: text || '', type, file_id: attachment?.id || null, replyTo: quoted, timestamp: new Date() });
        const privateRoom = room.startsWith('private ');
        io.to(room).emit(privateRoom ? 'privateMessage' : 'message', message);
        if (privateRoom) {
            const other = privateMembers(room).find(member => member !== username);
            for (const socket of io.sockets.sockets.values()) {
                if (socket.username === other && !socket.rooms.has(room)) socket.emit('privateMessage', message);
            }
        }
        reply({ status: 'success', messageId: saved.insertId });
    } catch (error) {
        console.error('Message save failed:', error.message);
        reply({ error: 'Message could not be saved' });
    }
}
app.get('/api/private-messages/:user1/:user2', requireAuth, async (req, res) => {
    const { user1, user2 } = req.params;
    if (![user1, user2].includes(req.user.username)) return res.sendStatus(403);
    try {
        const messages = await MessageModel.getPrivateMessages(user1, user2);
        res.json({ success: true, messages: await Promise.all(messages.map(hydrateMessage)) });
    } catch { res.status(500).json({ success: false, error: 'Unable to load messages' }); }
});
async function handleSendFriendRequest(data, socket) {
    try {
        const from = socket.username, to = data?.to;
        if (typeof to !== 'string' || !to.trim() || to.length > 255) throw new Error('Invalid recipient');
        const result = await FriendRequestModel.sendFriendRequest(from, to);
        socket.emit('friendRequestSent', { success: true, requestId: result.id, to });
        for (const peer of io.sockets.sockets.values()) if (peer.username === to) peer.emit('newFriendRequest', { from, requestId: result.id, createdAt: result.created_at });
    } catch (error) { socket.emit('friendRequestSent', { success: false, message: error.message }); }
}
async function handleRespondToFriendRequest(data, socket) {
    try {
        const request = await FriendRequestModel.getRequestById(data?.requestId);
        if (!request || request.to_user !== socket.username) throw new Error('Access denied');
        const result = await FriendRequestModel.respondToRequest(request.id, data.response);
        const fromUserFriends = await FriendRequestModel.getFriendsList(request.from_user);
        const toUserFriends = await FriendRequestModel.getFriendsList(request.to_user);
        const payload = { success: true, updatedRequest: { ...request, status: result.status }, fromUserFriends, toUserFriends };
        for (const peer of io.sockets.sockets.values()) if ([request.from_user, request.to_user].includes(peer.username)) peer.emit('friendRequestResponded', payload);
        await updateFriendsListForUser(request.from_user);
        await updateFriendsListForUser(request.to_user);
    } catch (error) { socket.emit('friendRequestResponded', { success: false, message: error.message }); }
}
async function handleGetPendingRequests(data, socket) {
    try { socket.emit('pendingRequests', { success: true, requests: await FriendRequestModel.getIncomingRequests(socket.username) }); }
    catch (error) { socket.emit('pendingRequests', { success: false, requests: [], message: error.message }); }
}
async function handleGetFriendsList(data, socket) {
    try { socket.emit('friendsList', { success: true, friends: await FriendRequestModel.getFriendsList(socket.username) }); }
    catch (error) { socket.emit('friendsList', { success: false, friends: [], message: error.message }); }
}
async function handleRemoveFriend(data, socket) {
    try {
        const other = data?.username2;
        if (typeof other !== 'string') throw new Error('Invalid friend');
        const success = await FriendRequestModel.removeFriend(socket.username, other);
        socket.emit('friendRemoved', { success, removedFriend: other });
        for (const peer of io.sockets.sockets.values()) if (peer.username === other) peer.emit('friendRemoved', { success, removedFriend: socket.username });
        await updateFriendsListForUser(socket.username);
        await updateFriendsListForUser(other);
    } catch (error) { socket.emit('friendRemoved', { success: false, message: error.message }); }
}
async function notifyFriendsOfStatusChange(username, online, status = null) {
    try {
        const friends = await FriendRequestModel.getFriendsList(username);
        for (const friend of friends) {
            for (const socket of io.sockets.sockets.values()) if (socket.username === friend.friend_username) socket.emit('friendStatusChanged', { username, online, status: status || (online ? 'Online' : 'Offline') });
            await updateFriendsListForUser(friend.friend_username);
        }
    } catch (error) { console.error('Friend notification failed:', error.message); }
}
async function updateFriendsListForUser(username) {
    try {
        const friends = await FriendRequestModel.getFriendsList(username);
        for (const socket of io.sockets.sockets.values()) if (socket.username === username) socket.emit('friendsListUpdated', friends);
    } catch (error) { console.error('Friends update failed:', error.message); }
}
async function handleUpdateUserStatus({ status } = {}) {
    if (typeof status !== 'string' || status.length > 50) return;
    try {
        await db.query('UPDATE users SET status = ? WHERE username = ?', [status, this.username]);
        await notifyFriendsOfStatusChange(this.username, true, status);
    } catch (error) { console.error('Status update failed:', error.message); }
}

function handleUserOnline() { updateUserOnlineStatus(this.username, true); }
function handleUserOffline() { /* Disconnect is the authority for presence. */ }

function handleDisconnect() {
    console.log("User disconnected:", this.id);
    
    if (this.username) {
        const online = isUserOnline(this.username);
        updateUserOnlineStatus(this.username, online);
        notifyFriendsOfStatusChange(this.username, online);
        
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

async function updateUserOnlineStatus(username, online) {
  try { await db.query('UPDATE users SET online_status = ? WHERE username = ?', [online ? 1 : 0, username]); }
  catch (error) { console.error('Presence update failed:', error.message); }
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

function getUserCurrentRoom(username) {
    const userSocket = findUserSocket(username);
    if (userSocket && userSocket.currentRoom) {
        return userSocket.currentRoom;
    }
    return null;
}

global.isUserOnline = isUserOnline;
global.getUserCurrentRoom = getUserCurrentRoom;

// Error Handling
if (require.main === module) process.on('uncaughtException', handleUncaughtException);
if (require.main === module) process.on('unhandledRejection', handleUnhandledRejection);

function handleUncaughtException(err) {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Choose another PORT.`);
    process.exitCode = 1;
  } else {
    console.error('Uncaught Exception:', err);
    // Prevent server crash for non-critical errors
    if (err.code === 'ENOENT' || err.code === 'EACCES') {
      console.warn('Non-critical error occurred:', err.message);
    } else {
      process.exit(1); // Exit the process for other critical errors
    }
  }
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
if (require.main === module) server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Saves directory: ${savesDir}`);
  console.log(`Server is running on port ${server.address().port}`);
  console.log(`AI models (in order): ${AI_MODELS.join(' -> ')}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Choose another PORT.`);
    process.exitCode = 1;
  } else {
    console.error('Server error:', err);
  }
});

app.post('/respond-to-request', requireAuth, async (req, res) => {
    try {
        const { from_user, action, requestId } = req.body || {};
        if (!['accepted', 'declined'].includes(action) || typeof from_user !== 'string') return res.status(400).json({ success: false, message: 'Invalid request' });
        const id = requestId || await FriendRequestModel.getRequestIdByUsers(from_user, req.user.username);
        const pending = id ? await FriendRequestModel.getRequestById(id) : null;
        if (!pending) return res.status(404).json({ success: false, message: 'Request not found' });
        if (pending.to_user !== req.user.username) return res.status(403).json({ success: false, message: 'Access denied' });
        await FriendRequestModel.respondToRequest(id, action);
        const fromUserFriends = await FriendRequestModel.getFriendsList(pending.from_user);
        const toUserFriends = await FriendRequestModel.getFriendsList(pending.to_user);
        await updateFriendsListForUser(pending.from_user);
        await updateFriendsListForUser(pending.to_user);
        res.json({ success: true, updatedRequest: { ...pending, status: action }, fromUserFriends, toUserFriends });
    } catch (error) {
        console.error('Friend response failed:', error.message);
        res.status(500).json({ success: false, message: 'Unable to process request' });
    }
});

app.get('/test-route', (req, res) => {
    res.status(200).send('Test route is working!');
});

app.get('/favicon.ico', (req, res) => {
    res.status(204).send(); // No Content response for favicon
});


app.get('/get-pending-requests', requireAuth, async (req, res) => {
  try {
    const pendingRequests = await FriendRequestModel.getIncomingRequests(req.user.username);
    res.json({ success: true, requests: pendingRequests });
  } catch (error) {
    console.error('Error fetching pending requests:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch pending requests' });
  }
});

// Route to fetch friends list
app.get('/api/friends', requireAuth, async (req, res) => {
    try {
        // Get username from session or however you're tracking authenticated users
        const username = req.session?.username || req.user?.username;
        
        if (!username) {
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }

        const friends = await FriendRequestModel.getFriendsList(username);
        
        res.json({
            success: true,
            friends: friends || []
        });
    } catch (error) {
        console.error('Error in /api/friends:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch friends list'
        });
    }
});
module.exports = { app, server, io, canAccessRoom };
