import type { NextApiRequest, NextApiResponse } from 'next';

interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

interface QuizData {
  questions: QuizQuestion[];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { content } = req.body;

  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Content is required' });
  }

  try {
    const systemPrompt = `You are a quiz generator. Generate 5-8 multiple choice questions based on the provided content.

Format your response as a JSON array with this exact structure:
[
  {
    "question": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": 0,
    "explanation": "Explanation of why this is correct"
  }
]

Rules:
- Generate 5-8 questions
- Each question must have exactly 4 options
- correctAnswer is the index (0-3) of the correct option
- Provide clear explanations
- Questions should test understanding, not just memorization
- Return ONLY the JSON array, no other text`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate a quiz based on this content:\n\n${content.slice(0, 3000)}` }
        ],
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    const quizText = data.choices?.[0]?.message?.content || '';

    // Parse the JSON response
    let questions: QuizQuestion[];
    try {
      // Try to extract JSON from the response
      const jsonMatch = quizText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        questions = JSON.parse(jsonMatch[0]);
      } else {
        questions = JSON.parse(quizText);
      }
    } catch (parseError) {
      console.error('Failed to parse quiz JSON:', parseError);
      throw new Error('Failed to parse quiz data');
    }

    // Validate quiz structure
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('Invalid quiz format');
    }

    for (const q of questions) {
      if (!q.question || !Array.isArray(q.options) || q.options.length !== 4 || 
          typeof q.correctAnswer !== 'number' || q.correctAnswer < 0 || q.correctAnswer > 3 ||
          !q.explanation) {
        throw new Error('Invalid question format');
      }
    }

    const quizData: QuizData = { questions };
    return res.status(200).json({ quiz: quizData });

  } catch (error) {
    console.error('Quiz generation error:', error);
    return res.status(500).json({ 
      error: 'Failed to generate quiz',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
