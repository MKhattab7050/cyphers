# Quick Start Guide

Get Cyphers Chat running in 5 minutes!

## Prerequisites

✅ Node.js (v14+)
✅ MySQL Server
✅ 10 minutes of your time

## Step 1: Clone & Install (2 min)

```bash
# Navigate to project folder
cd Cyphers

# Install dependencies
npm install
```

## Step 2: Setup Database (3 min)

1. **Create Database:**
   ```sql
   CREATE DATABASE `final-db`;
   ```

2. **Run SQL Schema:**
   - Open MySQL Workbench or command line
   - Copy and paste the SQL from `README.md` (Database Schema section)
   - Execute all CREATE TABLE statements

## Step 3: Configure Environment (2 min)

```bash
# Copy example env file
cp .env.example .env

# Edit .env file with your settings:
# - Set DB_PASS if your MySQL has a password
# - JWT_SECRET_KEY can stay as is for development
# - Leave Google OAuth empty if not using
```

**Minimum .env for development:**
```env
DB_HOST=localhost
DB_USER=root
DB_PASS=your_mysql_password_here
DB_NAME=final-db
JWT_SECRET_KEY=dev_secret_key_replace_in_production
JWT_EXPIRES_IN=1d
```

## Step 4: Start Server (30 sec)

```bash
npm start
```

You should see:
```
Server running on http://localhost:5000
Uploads directory: /path/to/Cyphers/uploads
Database connection successful
```

## Step 5: Open Browser (30 sec)

1. Go to: `http://localhost:5000`
2. Click **"Sign Up"**
3. Create an account (any email format works)
4. Login and start chatting! 🎉

## Quick Test Checklist

✅ Can you register a new account?
✅ Can you login?
✅ Can you send messages in General room?
✅ Can you upload an image?
✅ Can you click "AI Assistant" and chat with AI?

## Troubleshooting

### "Database connection failed"
- Check MySQL is running: `mysql -u root -p`
- Verify credentials in `.env`
- Ensure database `final-db` exists

### "Port 5000 already in use"
- Change PORT in `server.js` or `.env`
- Or kill the process using port 5000

### "Cannot find module"
- Run `npm install` again
- Delete `node_modules` and reinstall

### "AI not responding"
- Check internet connection
- Verify API key in `client/chat-script.js`
- See `AI_SETUP.md` for details

## Next Steps

🔹 **Add Friends**: Go to Friends tab → Add Friend → Enter username
🔹 **Private Chat**: Click chat icon next to friend's name
🔹 **Try AI**: Click "AI Assistant" or type `@ai hello`
🔹 **Upload Files**: Click paperclip icon to share images/files
🔹 **Customize**: Edit colors in `chat.html` CSS section

## Development Mode

Want auto-reload on code changes?

```bash
# Install nodemon (if not already)
npm install -g nodemon

# Run in dev mode
npm run dev
```

## Production Deployment

Before deploying to production:

1. ✅ Change JWT_SECRET_KEY to a strong random value
2. ✅ Set up HTTPS/SSL
3. ✅ Use environment-specific .env files
4. ✅ Set up proper MySQL user (not root)
5. ✅ Configure firewall rules
6. ✅ Enable CORS only for your domain
7. ✅ Set up log rotation
8. ✅ Use PM2 or similar process manager

See `README.md` for full deployment guide.

## Getting Help

- 📖 Read `README.md` for detailed documentation
- 🤖 Check `AI_SETUP.md` for AI assistant configuration
- 🐛 Open an issue on GitHub
- 💬 Ask in the chat room once you get it running!

---

**Time to first message**: ~5 minutes ⏱️
**Difficulty**: Easy 🟢

Happy chatting! 🚀
