# Cyphers Chat Application

A full-stack real-time chat application built with Node.js, Express, Socket.io, MySQL, and featuring AI assistance, friend system, and file sharing capabilities.

## Quick Start

⚡ **Want to get started fast?** Check out [QUICK_START.md](QUICK_START.md) for a 5-minute setup guide!

📖 **Full documentation below** ⬇️

---

## Features

- 🔐 **Authentication System**
  - Email/Password registration and login
  - Google OAuth integration
  - JWT-based session management

- 💬 **Real-time Chat**
  - Multiple chat rooms (General, Gaming, Music, Movies)
  - Private messaging between friends
  - Message replies and reactions
  - File sharing (images, videos, documents, audio)
  - Emoji picker
  - **Typing indicators** - See who's typing in real-time (NEW! 🎯)

- 👥 **Friend System**
  - Send and accept friend requests
  - Real-time online/offline status
  - Friend list with status indicators
  - Private chat with friends

- 🤖 **AI Assistant**
  - Integrated AI chatbot using OpenRouter API (Free tier available)
  - Context-aware responses with conversation memory
  - Mention with `@ai` to interact
  - Multiple free models available (Llama, Gemma, Phi, Mistral)
  - See [AI_SETUP.md](AI_SETUP.md) for configuration details

- 📁 **File Upload System**
  - Support for multiple file types
  - File preview for images and videos
  - Progress tracking during uploads
  - Maximum file size: 50MB

## Tech Stack

**Backend:**
- Node.js & Express.js
- Socket.io for real-time communication
- MySQL database
- Passport.js for authentication
- JWT for session management
- Multer for file uploads

**Frontend:**
- Vanilla JavaScript
- TailwindCSS
- Socket.io Client
- Font Awesome icons

## Prerequisites

- Node.js (v14 or higher)
- MySQL Server
- npm or yarn

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Cyphers
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Setup MySQL Database**
   
   Create a database named `final-db` and run the following SQL schema:

   ```sql
   CREATE DATABASE IF NOT EXISTS `final-db`;
   USE `final-db`;

   CREATE TABLE users (
       id INT AUTO_INCREMENT PRIMARY KEY,
       name VARCHAR(255),
       email VARCHAR(255) UNIQUE,
       username VARCHAR(255) UNIQUE,
       password VARCHAR(255),
       google_id VARCHAR(255),
       avatar TEXT,
       online_status BOOLEAN DEFAULT FALSE,
       status VARCHAR(255) DEFAULT 'Available',
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
   );

   CREATE TABLE messages (
       id INT AUTO_INCREMENT PRIMARY KEY,
       username VARCHAR(255),
       room VARCHAR(255),
       text TEXT,
       type VARCHAR(50) DEFAULT 'text',
       file_id INT,
       replyTo TEXT,
       timestamp DATETIME,
       mediaUrl TEXT,
       mediaType VARCHAR(100),
       replyToUsername VARCHAR(255),
       replyToText TEXT,
       is_private BOOLEAN DEFAULT FALSE,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );

   CREATE TABLE friends (
       user1 VARCHAR(255),
       user2 VARCHAR(255),
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (user1, user2)
   );

   CREATE TABLE friend_requests (
       id INT AUTO_INCREMENT PRIMARY KEY,
       from_user VARCHAR(255),
       to_user VARCHAR(255),
       status ENUM('pending', 'accepted', 'declined') DEFAULT 'pending',
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
   );

   CREATE TABLE files (
       id INT AUTO_INCREMENT PRIMARY KEY,
       filename VARCHAR(255),
       original_name VARCHAR(255),
       file_path TEXT,
       file_size BIGINT,
       file_type VARCHAR(100),
       mime_type VARCHAR(100),
       username VARCHAR(255),
       room VARCHAR(255),
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );
   ```

4. **Configure Environment Variables**

   Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your settings:
   ```env
   # Database
   DB_HOST=localhost
   DB_USER=root
   DB_PASS=your_password
   DB_NAME=final-db

   # JWT Secret (generate a strong random string)
   JWT_SECRET_KEY=your_very_long_random_secret_key_here
   JWT_EXPIRES_IN=1d

   # Google OAuth (optional)
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   GOOGLE_CALLBACK_URL=http://localhost:5000/auth/google/callback

   # AI API (optional)
   OPENROUTER_API_KEY=your_openrouter_api_key
   ```

   **Note**: The AI API key is currently hardcoded in `client/chat-script.js`. For production, consider moving it to the backend and serving via API endpoint. See [AI_SETUP.md](AI_SETUP.md) for details.

5. **Start the server**
   ```bash
   npm start
   ```

   The application will be available at `http://localhost:5000`

## Usage

1. **Registration/Login**
   - Visit `http://localhost:5000/login`
   - Create a new account or login with existing credentials
   - Optionally use Google OAuth

2. **Chat Rooms**
   - Select a room from the sidebar (General, Gaming, Music, Movies)
   - Send text messages or upload files
   - Reply to messages by clicking the reply button

3. **Friends**
   - Switch to "Friends" tab in sidebar
   - Add friends by username
   - Accept or decline friend requests
   - Start private chats with friends

4. **AI Assistant**
   - Click "AI Assistant" button to start AI chat
   - Or mention `@ai` in any message to invoke AI
   - AI will respond with context-aware answers

## Project Structure

```
Cyphers/
├── client/              # Frontend files
│   ├── chat.html       # Main chat interface
│   ├── login.html      # Login/signup page
│   ├── chat-script.js  # Client-side JavaScript
│   ├── style.css       # Styles
│   └── img/            # Images and assets
├── Controllers/        # Route controllers
├── Models/             # Database models
├── Routes/             # API routes
├── middleware/         # Express middleware
├── config/             # Configuration files
├── uploads/            # Uploaded files
├── server.js           # Main server file
├── package.json        # Dependencies
└── .env               # Environment variables
```

## Security Considerations

⚠️ **Important Security Notes:**

1. **Never commit `.env` file** - It contains sensitive credentials
2. **Change default JWT secret** - Generate a strong random secret
3. **Use HTTPS in production** - Encrypt data in transit
4. **Regenerate OAuth credentials** - Don't use example credentials
5. **Sanitize user inputs** - Prevent XSS and SQL injection
6. **Implement rate limiting** - Prevent abuse and DoS attacks
7. **Set secure database password** - Don't use empty passwords

## Future Improvements

- [ ] Add Redis caching for performance
- [ ] Implement refresh tokens
- [ ] Add message encryption
- [ ] Add voice/video calling with WebRTC
- [ ] Implement message search
- [x] ~~Add typing indicators~~ ✅ (Implemented on 2026-10-09)
- [ ] Add user roles and permissions
- [ ] Create admin dashboard
- [ ] Add comprehensive test suite
- [ ] Implement message read receipts
- [ ] Add typing indicators

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is open source and available under the [MIT License](LICENSE).

## Support

For issues and questions, please open an issue on GitHub.

---

**Built with ❤️ using Node.js and Socket.io**
