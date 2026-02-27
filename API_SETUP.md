# API Setup Guide

This guide explains how to integrate AI endpoints into the Vidya AI chat application.

## Current Status

The chat interface is fully functional with a **mock API** that provides sample responses. To enable real AI-powered responses, you need to integrate an AI service.

## Quick Start (Development)

The app currently works with mock responses. No setup needed for testing the UI!

## Production Setup

### Option 1: OpenAI Integration (Recommended)

1. **Get an API Key**
   - Sign up at [OpenAI Platform](https://platform.openai.com/)
   - Navigate to API Keys section
   - Create a new API key

2. **Configure Environment Variables**
   ```bash
   cp .env.example .env.local
   ```
   
   Edit `.env.local`:
   ```env
   OPENAI_API_KEY=sk-your-actual-api-key-here
   ```

3. **Update the API Handler**
   
   In `src/pages/api/chat.ts`, uncomment the OpenAI integration code:
   
   ```typescript
   async function callAIService(
     message: string,
     mode: string,
     conversationHistory: Message[]
   ): Promise<string> {
     const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
     const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
     
     const systemPrompt = getSystemPrompt(mode);
     
     const response = await fetch(OPENAI_API_URL, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${OPENAI_API_KEY}`,
       },
       body: JSON.stringify({
         model: 'gpt-4',
         messages: [
           { role: 'system', content: systemPrompt },
           ...conversationHistory.map(msg => ({
             role: msg.role === 'ai' ? 'assistant' : 'user',
             content: msg.content,
           })),
           { role: 'user', content: message },
         ],
         temperature: 0.7,
         max_tokens: 1000,
       }),
     });

     if (!response.ok) {
       throw new Error('AI service request failed');
     }

     const data = await response.json();
     return data.choices[0].message.content;
   }
   ```

4. **Restart the Development Server**
   ```bash
   npm run dev
   ```

### Option 2: Anthropic Claude

1. Get API key from [Anthropic Console](https://console.anthropic.com/)

2. Install the SDK:
   ```bash
   npm install @anthropic-ai/sdk
   ```

3. Update `.env.local`:
   ```env
   ANTHROPIC_API_KEY=your-anthropic-key
   ```

4. Modify `callAIService` function to use Anthropic's API

### Option 3: Custom Backend

If you have your own AI backend:

1. Update `.env.local`:
   ```env
   CUSTOM_AI_API_URL=https://your-backend.com/api/chat
   CUSTOM_AI_API_KEY=your-api-key
   ```

2. Modify the `callAIService` function:
   ```typescript
   async function callAIService(
     message: string,
     mode: string,
     conversationHistory: Message[]
   ): Promise<string> {
     const response = await fetch(process.env.CUSTOM_AI_API_URL!, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${process.env.CUSTOM_AI_API_KEY}`,
       },
       body: JSON.stringify({
         message,
         mode,
         history: conversationHistory,
       }),
     });

     const data = await response.json();
     return data.response;
   }
   ```

## API Endpoint Details

### POST `/api/chat`

**Request Body:**
```json
{
  "message": "Explain Newton's laws",
  "mode": "teacher",
  "conversationHistory": [
    {
      "role": "user",
      "content": "Previous message"
    },
    {
      "role": "ai",
      "content": "Previous response"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "response": "Newton's laws of motion are..."
}
```

**Error Response:**
```json
{
  "success": false,
  "response": "",
  "error": "Error message"
}
```

## Chat Modes

The app supports three modes, each with a different system prompt:

1. **Study Buddy**: Friendly, encouraging, uses examples
2. **Teacher**: Structured, asks questions, detailed feedback
3. **Mentor**: Strategic advice, long-term planning, career guidance

## Features

- ✅ Real-time chat interface
- ✅ Three AI modes (Study Buddy, Teacher, Mentor)
- ✅ Conversation history tracking
- ✅ Mermaid diagram generation
- ✅ File upload support (UI ready)
- ✅ Typing indicators
- ✅ Error handling with fallback responses

## Next Steps

1. **Add Database**: Store chat history in a database (PostgreSQL, MongoDB, etc.)
2. **User Authentication**: Implement user accounts with NextAuth.js
3. **File Processing**: Add backend logic to process uploaded PDFs/images
4. **Rate Limiting**: Implement rate limiting to prevent API abuse
5. **Streaming Responses**: Add streaming for real-time AI responses
6. **Memory System**: Implement the "Memories" feature for long-term context

## Security Notes

- Never commit `.env.local` to version control
- Keep API keys secure
- Implement rate limiting in production
- Add authentication before deploying
- Validate and sanitize all user inputs

## Cost Considerations

- OpenAI GPT-4: ~$0.03 per 1K tokens (input) + $0.06 per 1K tokens (output)
- OpenAI GPT-3.5-Turbo: ~$0.0015 per 1K tokens (much cheaper)
- Consider implementing token limits and user quotas

## Support

For issues or questions, refer to:
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)
- [Anthropic Claude API](https://docs.anthropic.com/)
