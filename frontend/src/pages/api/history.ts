/**
 * Next.js API proxy for /rag/session/history
 * Routes: GET /api/history?limit=N  →  backend GET /rag/session/history?firebase_uid=...&limit=N
 *         DELETE /api/history?id=X  →  backend DELETE /rag/session/history/{id}?firebase_uid=...
 *
 * Proxying through Next.js eliminates browser CORS issues entirely.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const BACKEND = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const SESSION_KEY = 'vidyaai_session_token';
const USER_KEY = 'vidyaai_user';

function getUserIdFromCookies(req: NextApiRequest): string {
    // User info is in localStorage (client-side). For server-side proxy calls,
    // the client passes firebase_uid as a query param directly.
    return (req.query.firebase_uid as string) || '';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const userId = getUserIdFromCookies(req);

    if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        if (req.method === 'GET') {
            const limit = req.query.limit || '100';
            const backendUrl = `${BACKEND}/rag/session/history?firebase_uid=${encodeURIComponent(userId)}&limit=${limit}`;
            const upstream = await fetch(backendUrl);
            const data = await upstream.json();
            return res.status(upstream.status).json(data);
        }

        if (req.method === 'DELETE') {
            const id = req.query.id as string;
            if (!id) return res.status(400).json({ error: 'Missing id' });
            const backendUrl = `${BACKEND}/rag/session/history/${encodeURIComponent(id)}?firebase_uid=${encodeURIComponent(userId)}`;
            const upstream = await fetch(backendUrl, { method: 'DELETE' });
            const data = await upstream.json();
            return res.status(upstream.status).json(data);
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err: any) {
        console.error('[api/history] Backend error:', err.message);
        return res.status(502).json({ error: 'Backend unavailable', detail: err.message });
    }
}
