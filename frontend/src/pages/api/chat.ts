import type { NextApiRequest, NextApiResponse } from 'next';

interface Message {
  role: 'user' | 'ai';
  content: string;
}

interface ChatRequest {
  message: string;
  mode: string;
  conversationHistory: Message[];
}

interface ChatResponse {
  response: string;
  success: boolean;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ChatResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      response: '', 
      error: 'Method not allowed' 
    });
  }

  try {
    const { message, mode, conversationHistory } = req.body as ChatRequest;

    if (!message || !message.trim()) {
      return res.status(400).json({ 
        success: false, 
        response: '', 
        error: 'Message is required' 
      });
    }

    // TODO: Replace with your actual AI API endpoint
    // Example: OpenAI, Anthropic, or your custom backend
    const aiResponse = await callAIService(message, mode, conversationHistory);

    return res.status(200).json({
      success: true,
      response: aiResponse,
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return res.status(500).json({
      success: false,
      response: '',
      error: 'Failed to process chat request',
    });
  }
}

// Replace this function with your actual AI service integration
async function callAIService(
  message: string,
  mode: string,
  conversationHistory: Message[]
): Promise<string> {
  // Example: OpenAI API call
  // const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  // const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

  // Uncomment and configure when you have an API key
  /*
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
  */

  // Temporary mock response for development
  return getMockResponse(message, mode);
}

function getSystemPrompt(mode: string): string {
  const prompts = {
    'study-buddy': 'You are a friendly study buddy helping students learn. Be encouraging, explain concepts clearly, and use examples.',
    'teacher': 'You are an experienced teacher. Provide structured explanations, ask questions to check understanding, and give detailed feedback.',
    'mentor': 'You are a wise mentor guiding students. Offer strategic advice, help with long-term planning, and provide career guidance.',
  };
  return prompts[mode as keyof typeof prompts] || prompts['study-buddy'];
}

// Mock response for development (remove when integrating real AI)
function getMockResponse(message: string, mode: string): string {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('calculus') || lowerMessage.includes('integral')) {
    return 'The fundamental theorem of calculus connects differentiation and integration. An integral represents the area under a curve, and we can calculate it by finding the antiderivative. Would you like me to show you a specific example?';
  }
  
  if (lowerMessage.includes('physics') || lowerMessage.includes('newton')) {
    return 'Newton\'s laws of motion are fundamental to classical mechanics. The first law states that an object at rest stays at rest unless acted upon by a force. The second law (F=ma) relates force, mass, and acceleration. The third law states that for every action, there\'s an equal and opposite reaction.';
  }
  
  if (lowerMessage.includes('chemistry') || lowerMessage.includes('organic')) {
    return 'Organic chemistry focuses on carbon-containing compounds. The main types include alkanes, alkenes, alkynes, and aromatic compounds. Each has unique properties based on their molecular structure and bonding patterns.';
  }
  
  if (lowerMessage.includes('history') || lowerMessage.includes('revolution')) {
    return 'The Industrial Revolution was a period of major industrialization that began in Britain in the late 18th century. Key factors included technological innovations, access to resources, and changes in agricultural practices. It fundamentally transformed society, economy, and daily life.';
  }
  
  if (lowerMessage.includes('essay') || lowerMessage.includes('write')) {
    return 'For a strong essay, start with a clear thesis statement. Structure your essay with an introduction, body paragraphs (each with a topic sentence and supporting evidence), and a conclusion. Make sure to cite your sources and proofread carefully.';
  }
  
  // Default response
  const modeResponses = {
    'study-buddy': 'That\'s a great question! Let me help you understand this better. Could you tell me more about what specifically you\'d like to learn?',
    'teacher': 'I understand your question. Let\'s break this down step by step to ensure you grasp the concept fully. What\'s your current understanding of this topic?',
    'mentor': 'Excellent question. This is an important topic to master. Let me guide you through this and show you how it connects to broader concepts in your field.',
  };
  
  return modeResponses[mode as keyof typeof modeResponses] || modeResponses['study-buddy'];
}
