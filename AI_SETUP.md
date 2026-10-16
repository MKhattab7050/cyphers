# AI Assistant Setup Guide

The Cyphers Chat application includes an integrated AI assistant powered by OpenRouter API.

## Current Configuration

- **Model**: `meta-llama/llama-3.2-3b-instruct:free` (Free tier)
- **Provider**: OpenRouter
- **Max Tokens**: 500 per response
- **Temperature**: 0.7

## How to Use the AI Assistant

### Method 1: AI Chat Room
1. Click the **"AI Assistant"** button in the sidebar
2. A dedicated AI chat room will open
3. Type your message (automatically prefixed with `@ai`)
4. Press Send or hit Enter

### Method 2: Mention in Any Room
1. In any chat room, type `@ai` followed by your question
2. Example: `@ai What is JavaScript?`
3. The AI will respond in the same room

### Method 3: Natural Trigger
1. Start your message with "hey ai" or just "ai"
2. Example: `hey ai, can you help me?`

## Features

✅ **Context-Aware**: AI remembers the last 10 messages in conversation
✅ **Multi-Room**: Each room has its own conversation history
✅ **Error Handling**: Helpful error messages if API fails
✅ **Auto-Clean**: Removes thinking patterns and formatting artifacts
✅ **History Management**: Automatically keeps last 20 messages to prevent token overload

## Changing the AI Model

To use a different model, edit `client/chat-script.js`:

```javascript
const AI_CONFIG = {
    NAME: "AI Assistant",
    MODEL: "your-model-here", // Change this
    API_KEY: "your-api-key-here",
    API_URL: "https://openrouter.ai/api/v1/chat/completions"
};
```

### Available Free Models on OpenRouter:

1. **meta-llama/llama-3.2-3b-instruct:free** (Current)
   - Fast, good for general chat
   - 3B parameters

2. **google/gemma-2-9b-it:free**
   - Better quality, slightly slower
   - 9B parameters

3. **microsoft/phi-3-mini-128k-instruct:free**
   - Good for longer contexts
   - 128k context window

4. **mistralai/mistral-7b-instruct:free**
   - Balanced performance
   - 7B parameters

To change model, simply update the `MODEL` field in `AI_CONFIG`.

## API Key Configuration

### Getting Your Own OpenRouter API Key:

1. Visit [OpenRouter.ai](https://openrouter.ai)
2. Sign up for a free account
3. Go to Keys section
4. Create a new API key
5. Replace the key in `client/chat-script.js`:
   ```javascript
   API_KEY: "sk-or-v1-YOUR-KEY-HERE"
   ```

### Using Environment Variables (Recommended):

Instead of hardcoding the API key, you can load it from the backend:

1. Add to `.env`:
   ```
   OPENROUTER_API_KEY=sk-or-v1-your-key-here
   ```

2. Create an API endpoint in `server.js`:
   ```javascript
   app.get('/api/config', (req, res) => {
       res.json({
           aiApiKey: process.env.OPENROUTER_API_KEY
       });
   });
   ```

3. Fetch it in `chat-script.js`:
   ```javascript
   async function loadAIConfig() {
       const response = await fetch('/api/config');
       const config = await response.json();
       AI_CONFIG.API_KEY = config.aiApiKey;
   }
   
   // Call on init
   loadAIConfig();
   ```

## Troubleshooting

### Error: "Authentication failed"
- Check if your API key is valid
- Verify the key format starts with `sk-or-v1-`
- Regenerate a new key from OpenRouter

### Error: "Too many requests"
- You've hit the rate limit
- Wait a few minutes before trying again
- Consider upgrading to a paid plan

### Error: "AI service temporarily unavailable"
- OpenRouter servers might be down
- Try a different model
- Check [OpenRouter Status](https://status.openrouter.ai)

### AI responses are cut off
- Increase `max_tokens` in the fetch request
- Current limit is 500, you can increase to 1000-2000

### AI doesn't remember conversation
- Check if `aiChatHistory` is being maintained
- Verify room name consistency
- Clear browser cache and try again

## Rate Limits

**Free Tier:**
- 10 requests per minute
- 200 requests per day
- No credit card required

**Paid Tier:**
- Much higher limits
- Pay per token used
- Better models available

## Best Practices

1. **Be Specific**: Clearer questions get better answers
2. **Provide Context**: AI works better with more information
3. **Keep It Concise**: Shorter prompts = faster responses
4. **Use System Prompts**: Customize AI personality in the code
5. **Monitor Usage**: Track your API usage on OpenRouter dashboard

## Advanced: Custom System Prompts

Edit the system prompt in `handleAIResponse()`:

```javascript
aiChatHistory[room].push({
    role: "system",
    content: "You are a helpful coding assistant specializing in JavaScript and Node.js. Provide code examples when relevant."
});
```

## Security Notes

⚠️ **Important:**
- Never commit API keys to git
- Use environment variables for production
- Implement rate limiting on your server
- Validate user input before sending to AI
- Consider adding authentication for AI features

## Support

For issues with:
- **OpenRouter API**: [OpenRouter Discord](https://discord.gg/openrouter)
- **Cyphers Chat**: Open an issue on GitHub
- **Model-specific**: Check the model's documentation

---

**Last Updated**: December 2024
**Model Version**: Llama 3.2 3B Instruct
