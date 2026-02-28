import type { NextApiRequest, NextApiResponse } from 'next';

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY || '';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

interface FlowchartResponse {
    mermaidCode: string;
    success: boolean;
    error?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<FlowchartResponse>) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, mermaidCode: '', error: 'Method not allowed' });
    }

    const { content } = req.body as { content: string };
    if (!content?.trim()) {
        return res.status(400).json({ success: false, mermaidCode: '', error: 'Content is required' });
    }

    if (!GROQ_API_KEY) {
        return res.status(500).json({ success: false, mermaidCode: '', error: 'API key not configured' });
    }

    const prompt = `Based on the following content, generate a Mermaid flowchart diagram.

Content:
${content}

IMPORTANT RULES:
1. Start with ONLY "graph TD" or "graph LR" (no extra text)
2. Use simple node IDs like A, B, C, etc.
3. Node definition MUST be: A["Label Text"]
4. NEVER repeat the node ID. (WRONG: A A[Text], CORRECT: A["Text"])
5. Use --> for arrows connecting nodes
6. Keep labels short and clear
7. Maximum 10-12 nodes
8. Use proper Mermaid syntax only
9. CRITICAL: Wrap ALL label text in double quotes: A["Text"]
10. REMOVE or spell out any special characters in the text (like brackets [], parentheses (), or math symbols like ^ or =).

Generate ONLY the Mermaid code. No explanations, no markdown blocks, no extra text.`;

    try {
        const groqResponse = await fetch(GROQ_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages: [
                    { role: 'system', content: 'You are a Mermaid diagram expert. Generate ONLY valid Mermaid flowchart code. Never put duplicate node IDs. No explanations. No markdown.' },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.2,
                max_tokens: 800,
            }),
        });

        if (!groqResponse.ok) throw new Error('Groq API request failed');

        const data = await groqResponse.json();
        let mermaidCode: string = data.choices?.[0]?.message?.content || '';
        mermaidCode = mermaidCode.trim();

        if (mermaidCode.startsWith('```mermaid')) {
            mermaidCode = mermaidCode.replace(/```mermaid\n?/g, '').replace(/```\n?$/g, '');
        } else if (mermaidCode.startsWith('```')) {
            mermaidCode = mermaidCode.replace(/```\n?/g, '');
        }
        mermaidCode = mermaidCode.trim();

        if (!mermaidCode.startsWith('graph ') && !mermaidCode.startsWith('flowchart ')) {
            mermaidCode = `graph TD\n    A[Start] --> B[Process Content]\n    B --> C[Analyze Information]\n    C --> D[Generate Output]\n    D --> E[End]`;
        }

        return res.status(200).json({ success: true, mermaidCode });
    } catch (error) {
        console.error('[generate-flowchart] Error:', error);
        return res.status(500).json({ success: false, mermaidCode: '', error: 'Failed to generate flowchart' });
    }
}
