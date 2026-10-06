import http from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export function newAttempt() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, state: randomBytes(32).toString('base64url'),
    challenge: createHash('sha256').update(verifier).digest('base64url') };
}
export function validateCallback(url, expected) {
  const states = url.searchParams.getAll('state');
  const actual = states[0] || '';
  if (states.length !== 1 || Buffer.byteLength(actual) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) throw new Error('Invalid OAuth state');
  if (url.searchParams.has('error')) throw new Error('Google authorization was declined');
  const codes = url.searchParams.getAll('code');
  if (codes.length !== 1 || !codes[0] || codes[0].length > 4096) throw new Error('Missing authorization code');
  return codes[0];
}
export async function tokenRequest(config, fields, fetchImpl = fetch) {
  const body = new URLSearchParams({client_id:config.client_id, ...fields});
  if (config.client_secret) body.set('client_secret',config.client_secret);
  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method:'POST', body, signal:AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`Google token exchange failed (${response.status})`);
  const token = await response.json();
  if (!token.access_token || !Number.isFinite(token.expires_in) || token.expires_in <= 0)
    throw new Error('Invalid Google token response');
  return {...token, expires_at:Date.now()+token.expires_in*1000};
}

// Only a random loopback port; no public listener, no arbitrary redirects.
export async function authorize(config, onUrl, {timeoutMs=180000, fetchImpl=fetch} = {}) {
  if (!config?.client_id?.endsWith('.apps.googleusercontent.com')) throw new Error('Desktop OAuth configuration required');
  const attempt = newAttempt();
  let resolveCode, rejectCode, consumed = false, redirect;
  const codePromise = new Promise((resolve,reject)=>{resolveCode=resolve;rejectCode=reject;});
  // Attach a handler immediately so a denied callback cannot become an unhandled rejection.
  codePromise.catch(()=>{});
  const server = http.createServer((req,res)=>{
    res.setHeader('Cache-Control','no-store'); res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Type','text/plain; charset=utf-8');
    if (req.method !== 'GET' || req.headers.host !== new URL(redirect).host) {
      res.writeHead(400); res.end('Invalid request'); return;
    }
    const url = new URL(req.url,redirect);
    if (url.pathname !== '/oauth/callback') {res.writeHead(404);res.end();return;}
    if (consumed) {res.writeHead(409);res.end('Already handled');return;}
    try {
      const code = validateCallback(url,attempt.state);
      consumed = true; res.end('Google authorization received. Return to Fayna Connector.'); resolveCode(code);
    } catch (error) {
      res.writeHead(400);res.end('Authorization could not be accepted. Return to Fayna Connector.');
      // Invalid-state traffic does not cancel the legitimate user's login attempt.
      if (url.searchParams.get('state') === attempt.state) {consumed=true;rejectCode(error);}
    }
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  redirect = `http://127.0.0.1:${server.address().port}/oauth/callback`;
  const timer = setTimeout(()=>rejectCode(new Error('Google authorization timed out')),timeoutMs);
  try {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    for (const [k,v] of Object.entries({client_id:config.client_id,redirect_uri:redirect,response_type:'code',
      scope:GMAIL_SCOPE,access_type:'offline',prompt:'consent',state:attempt.state,
      code_challenge:attempt.challenge,code_challenge_method:'S256'})) url.searchParams.set(k,v);
    await onUrl(url.href);
    const code = await codePromise;
    const token = await tokenRequest(config,{code,code_verifier:attempt.verifier,redirect_uri:redirect,grant_type:'authorization_code'},fetchImpl);
    if (!token.scope?.split(' ').includes(GMAIL_SCOPE)) throw new Error('Gmail read permission was not granted');
    if (!token.refresh_token) throw new Error('Offline permission was not granted');
    return token;
  } finally {clearTimeout(timer);server.closeAllConnections();server.close();}
}
