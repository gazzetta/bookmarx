import type { Request, Response } from 'express';
import { sendContactEmail } from '../utils/email';

const topics = new Set(['Support', 'Sales', 'Privacy request', 'Cancellation or refund', 'Complaint']);
const attempts = new Map<string, { count: number; until: number }>();

export async function submitContact(req: Request, res: Response) {
    const origins = new Set(['https://www.bookmarx.cc']);
    if (process.env.PUBLIC_BASE_URL) origins.add(process.env.PUBLIC_BASE_URL.replace(/\/$/, ''));
    if (process.env.NODE_ENV !== 'production') { origins.add('http://localhost:3005'); origins.add('http://127.0.0.1:3005'); }
    if (!origins.has(req.headers.origin || '')) return res.status(403).json({ success: false, error: { message: 'Please submit the contact form from the BookMarx website.' } });
    const now = Date.now();
    for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key);
    const key = req.ip || 'unknown';
    const entry = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
    if (entry.count >= 5 || attempts.size >= 5000 && !attempts.has(key)) {
        res.setHeader('Retry-After', Math.max(1, Math.ceil((entry.until - now) / 1000)));
        return res.status(429).json({ success: false, error: { message: 'Too many contact attempts. Please try again in 15 minutes.' } });
    }
    entry.count++; attempts.set(key, entry);
    const body = req.body;
    if (!body || typeof body !== 'object') return res.status(400).json({ success: false, error: { message: 'Invalid contact request.' } });
    if (typeof body.website === 'string' && body.website) return res.json({ success: true });
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const topic = typeof body.topic === 'string' ? body.topic : '';
    if (email.length > 254 || !/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(email)
        || message.length < 10 || message.length > 5000 || !topics.has(topic)) {
        return res.status(400).json({ success: false, error: { message: 'Enter a valid email, topic and message between 10 and 5,000 characters.' } });
    }
    if (!await sendContactEmail({ email, topic, message })) return res.status(503).json({ success: false,
        error: { message: 'We could not deliver your message. Your text has been kept on this page; please try again later or use our postal address.' } });
    return res.json({ success: true });
}
