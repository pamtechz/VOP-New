import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function verifyLencoWebhookSignature(rawBody:Buffer,signature:unknown,apiToken:unknown){
  const token=String(apiToken||'').trim();
  const supplied=String(signature||'').trim().toLowerCase();
  if(!token||!/^[a-f0-9]{128}$/.test(supplied))return false;
  const webhookHashKey=createHash('sha256').update(token).digest('hex');
  const expected=createHmac('sha512',webhookHashKey).update(rawBody).digest('hex');
  const a=Buffer.from(expected,'hex'),b=Buffer.from(supplied,'hex');
  return a.length===b.length&&timingSafeEqual(a,b);
}
