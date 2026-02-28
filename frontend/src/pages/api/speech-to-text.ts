import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import axios from 'axios';
import formidable from 'formidable';

// Load key from environment or fallback to reading from backend/.env
let SARVAM_API_KEY = process.env.SARVAM_API_KEY || '';

if (!SARVAM_API_KEY) {
    try {
        const envPath = path.resolve(process.cwd(), '../backend/.env');
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf8');
            const match = content.match(/SARVAM_API_KEY=(.*)/);
            if (match) {
                SARVAM_API_KEY = match[1].trim();
            }
        }
    } catch (e) {
        console.error('Could not read backend .env', e);
    }
}

export const config = {
    api: {
        bodyParser: false,
    },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!SARVAM_API_KEY) {
        return res.status(500).json({ error: 'SARVAM_API_KEY is not configured' });
    }

    try {
        const form = formidable({ multiples: false });

        const [fields, files] = await new Promise<[formidable.Fields, formidable.Files]>((resolve, reject) => {
            form.parse(req, (err, fields, files) => {
                if (err) reject(err);
                resolve([fields, files]);
            });
        });

        const uploadedFile = files.file;
        const fileObj = Array.isArray(uploadedFile) ? uploadedFile[0] : uploadedFile;

        if (!fileObj || !fileObj.filepath) {
            return res.status(400).json({ error: 'Audio file is required' });
        }

        const formData = new FormData();
        const fileStream = fs.createReadStream(fileObj.filepath);
        formData.append('file', fileStream, {
            filename: fileObj.originalFilename || 'audio.mp4',
            contentType: fileObj.mimetype || 'audio/mp4',
        });

        // Ensure prompt is sent if needed by some older versions
        formData.append('prompt', 'translate to english');

        const response = await axios.post('https://api.sarvam.ai/speech-to-text-translate', formData, {
            headers: {
                'api-subscription-key': SARVAM_API_KEY,
                ...formData.getHeaders()
            },
            maxBodyLength: Infinity
        });

        if (response.status !== 200) {
            throw new Error(`Sarvam API error: ${response.status} ${JSON.stringify(response.data)}`);
        }

        return res.status(200).json({ transcript: response.data.transcript });
    } catch (error: any) {
        console.error('Speech to text error:', error.response?.data || error);
        return res.status(error.response?.status || 500).json({ error: error.response?.data?.error || error.message || 'Translation failed' });
    }
}
