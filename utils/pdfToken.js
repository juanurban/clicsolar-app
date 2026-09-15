const crypto = require('crypto');

const secret = process.env.PDF_TOKEN_SECRET || process.env.SESSION_SECRET || 'clicsolar-local-pdf-secret';

function createPdfToken(cotizacionId) {
  const timestamp = Date.now().toString();
  const payload = `${cotizacionId}.${timestamp}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${timestamp}.${signature}`;
}

function verifyPdfToken(cotizacionId, token, maxAgeMs = 5 * 60 * 1000) {
  if (!token || typeof token !== 'string') return false;
  const [timestamp, signature] = token.split('.');
  if (!timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  const age = Date.now() - Number(timestamp);
  if (age < 0 || age > maxAgeMs) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${cotizacionId}.${timestamp}`).digest('hex');
  return signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

module.exports = { createPdfToken, verifyPdfToken };
