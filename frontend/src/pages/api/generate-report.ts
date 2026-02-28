import type { NextApiRequest, NextApiResponse } from 'next';

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY || '';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

interface ReportResponse {
    report: string;
    success: boolean;
    error?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ReportResponse>) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, report: '', error: 'Method not allowed' });
    }

    const { content } = req.body as { content: string };
    if (!content?.trim()) {
        return res.status(400).json({ success: false, report: '', error: 'Content is required' });
    }

    if (!GROQ_API_KEY) {
        return res.status(500).json({ success: false, report: '', error: 'API key not configured' });
    }

    const prompt = `Generate a concise summary report of the following AI response. Focus on key points, main concepts, and actionable insights.

Content:
${content}

IMPORTANT RULES:
1. Create a clear, structured summary
2. Use bullet points for key takeaways
3. Highlight main concepts and important details
4. Keep it concise but comprehensive
5. Use markdown formatting
6. Maximum 300 words

Generate the summary report now:`;

    try {
        const groqResponse = await fetch(GROQ_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages: [
                    { role: 'system', content: 'You are a professional summarizer. Create clear, concise summaries with key points and insights.' },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.3,
                max_tokens: 600,
            }),
        });

        if (!groqResponse.ok) throw new Error('Groq API request failed');

        const data = await groqResponse.json();
        const report: string = data.choices?.[0]?.message?.content || 'Failed to generate report.';

        return res.status(200).json({ success: true, report: report.trim() });
    } catch (error) {
        console.error('[generate-report] Error:', error);
        return res.status(500).json({ success: false, report: '', error: 'Failed to generate report' });
    }
}
