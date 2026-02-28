/**
 * Next.js API proxy for /rag/session/save
 * Bridges the browser → backend CORS gap for saving Q&A pairs.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const BACKEND = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { firebase_uid, question, answer, subject = 'General' } = req.body as {
        firebase_uid: string;
        question: string;
        answer: string;
        subject?: string;
    };

    if (!firebase_uid || !question) {
        return res.status(400).json({ error: 'Missing firebase_uid or question' });
    }

    try {
        const params = new URLSearchParams({
            firebase_uid,
            question: question.slice(0, 400),
            answer: (answer || '').slice(0, 400),
            subject,
        });

        const upstream = await fetch(`${BACKEND}/rag/session/save?${params}`, {
            method: 'POST',
        });

        const data = await upstream.json().catch(() => ({ status: 'ok' }));
        return res.status(200).json(data);
    } catch (err: any) {
        console.error('[api/save] error:', err.message);
        return res.status(200).json({ status: 'skipped', reason: err.message });
    }
}
