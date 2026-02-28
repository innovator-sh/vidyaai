import type { NextApiRequest, NextApiResponse } from 'next';

interface Message {
  role: 'user' | 'ai';
  content: string;
}

interface ChatRequest {
  message: string;
  mode: string;
  conversationHistory: Message[];
  documentContext?: string;  // OCR text, knowledge-base text, etc.
  firebase_uid?: string;
}

interface ChatResponse {
  response: string;
  success: boolean;
  error?: string;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
// Accept both GROQ_API_KEY (server-side) and NEXT_PUBLIC_GROQ_API_KEY (shared)
const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY || '';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/** Save a Q&A pair to the backend ChromaDB via server-to-server (no CORS). */
async function saveToHistory(firebase_uid: string, question: string, answer: string) {
  if (!firebase_uid) return;
  try {
    const params = new URLSearchParams({
      firebase_uid,
      question: question.slice(0, 400),
      answer: answer.slice(0, 400),
      subject: 'General',
    });
    await fetch(`${BACKEND_URL}/rag/session/save?${params}`, { method: 'POST' });
  } catch { /* non-critical */ }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ChatResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, response: '', error: 'Method not allowed' });
  }

  const { message, mode, conversationHistory, documentContext, firebase_uid } = req.body as ChatRequest;

  if (!message?.trim()) {
    return res.status(400).json({ success: false, response: '', error: 'Message is required' });
  }

  // Build the final user message — always include document context (OCR text, KB text) if present
  const ctxBlock = documentContext?.trim()
    ? `\n\n<context>\n${documentContext.trim()}\n</context>`
    : '';
  const finalUserMessage = message + ctxBlock;

  // System prompt selection
  const systemPrompt = getSystemPrompt(mode);

  const groqMessages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.map((m) => ({
      role: m.role === 'ai' ? 'assistant' : 'user',
      content: m.content,
    })),
    { role: 'user', content: finalUserMessage },
  ];

  // ─────────────────────────────────────────────
  // Primary: Groq direct call (fast, reliable)
  // ─────────────────────────────────────────────
  if (GROQ_API_KEY) {
    try {
      const groqResp = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: groqMessages,
          temperature: 0.6,
          max_tokens: 1024,
        }),
      });

      if (groqResp.ok) {
        const data = await groqResp.json();
        const aiText: string = data.choices?.[0]?.message?.content || '';

        if (aiText) {
          // Persist Q&A to ChromaDB (server-to-server, no CORS)
          await saveToHistory(firebase_uid || '', message, aiText);
          return res.status(200).json({ success: true, response: aiText });
        }
      } else {
        const errBody = await groqResp.text();
        console.error('[api/chat] Groq non-OK:', groqResp.status, errBody);
      }
    } catch (groqErr) {
      console.error('[api/chat] Groq fetch error:', groqErr);
    }
  } else {
    console.warn('[api/chat] GROQ_API_KEY is not set in environment.');
  }

  // ─────────────────────────────────────────────
  // Fallback: Python backend RAG endpoint
  // ─────────────────────────────────────────────
  try {
    const backendResp = await fetch(`${BACKEND_URL}/rag/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firebase_uid: firebase_uid || 'anonymous_user',
        session_id: `chat_${Date.now()}`,
        document_text: documentContext || '',
        query_text: message,
      }),
    });

    if (backendResp.ok) {
      const data = await backendResp.json();
      const aiResp = data.solution || data.response || '';
      if (aiResp) {
        // Persist Q&A on the backend fallback path too
        await saveToHistory(firebase_uid || '', message, aiResp);
        return res.status(200).json({ success: true, response: aiResp });
      }
    } else {
      const errBody = await backendResp.text();
      console.error('[api/chat] Backend non-OK:', backendResp.status, errBody);
    }
  } catch (backendErr) {
    console.error('[api/chat] Backend fetch error:', backendErr);
  }

  // ─────────────────────────────────────────────
  // Hard fail — tell the user something useful
  // ─────────────────────────────────────────────
  return res.status(200).json({
    success: false,
    response: 'I was unable to generate a response. Please check that the backend server is running and GROQ_API_KEY is set in .env.local.',
  });
}

function getSystemPrompt(mode: string): string {
  const base =
    'You are VidyaAI, an intelligent educational AI tutor. ' +
    'When the user provides a <context> block, use it as the primary source of information to answer their question. ' +
    'Be detailed, accurate, and educational in your responses. Format using markdown where appropriate.';

  const personas: Record<string, string> = {
    'study-buddy': `${base} Speak like a friendly study partner — encouraging, relatable examples, make learning fun.`,
    teacher: `${base} Speak like an experienced teacher — structured explanations, step-by-step, check for understanding.`,
    mentor: `${base} Speak like a wise mentor — strategic advice, big-picture thinking, career guidance.`,
  };
  return personas[mode] || personas['study-buddy'];
}
