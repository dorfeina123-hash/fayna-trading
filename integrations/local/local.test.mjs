import test from 'node:test';
import assert from 'node:assert/strict';
import { newAttempt, validateCallback, authorize, tokenRequest, GMAIL_SCOPE } from './oauth.mjs';
import { protect } from './vault.mjs';

test('PKCE attempts use unique high-entropy state and challenge',()=>{
  const a=newAttempt(),b=newAttempt();assert.notEqual(a.state,b.state);
  assert.equal(a.verifier.length,43);assert.equal(a.challenge.length,43);assert.notEqual(a.challenge,a.verifier);
});
test('callback rejects forged states, duplicate codes and denied consent',()=>{
  const valid=new URL('http://127.0.0.1/oauth/callback?state=expected&code=ok');
  assert.equal(validateCallback(valid,'expected'),'ok');
  for(const query of ['state=wrong&code=ok','state=expected&code=one&code=two','state=expected&error=access_denied'])
    assert.throws(()=>validateCallback(new URL('http://127.0.0.1/?'+query),'expected'));
});
test('token error messages do not expose provider response or secrets',async()=>{
  await assert.rejects(tokenRequest({client_id:'test',client_secret:'private'}, {},async()=>({ok:false,status:400})),
    {message:'Google token exchange failed (400)'});
});
test('loopback OAuth verifies state and exchanges code with PKCE',async()=>{
  const token=await authorize({client_id:'test.apps.googleusercontent.com'},async href=>{
    const auth=new URL(href);assert.equal(auth.searchParams.get('scope'),GMAIL_SCOPE);
    assert.equal(auth.searchParams.get('code_challenge_method'),'S256');
    const callback=new URL(auth.searchParams.get('redirect_uri'));
    callback.searchParams.set('state','wrong');callback.searchParams.set('code','synthetic-code');
    assert.equal((await fetch(callback)).status,400);
    callback.searchParams.set('state',auth.searchParams.get('state'));
    assert.equal((await fetch(callback)).status,200);
  },{fetchImpl:async(url,options)=>{
    assert.equal(url,'https://oauth2.googleapis.com/token');assert.equal(options.body.get('code'),'synthetic-code');
    assert.equal(options.body.get('code_verifier').length,43);
    return {ok:true,json:async()=>({access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:3600,scope:GMAIL_SCOPE})};
  }});
  assert.equal(token.refresh_token,'synthetic-refresh');
});
test('loopback expires and closes without consent',async()=>{
  await assert.rejects(authorize({client_id:'test.apps.googleusercontent.com'},()=>{}, {timeoutMs:30}),
    {message:'Google authorization timed out'});
});
test('Windows DPAPI round trip protects synthetic tokens',{skip:process.platform!=='win32'},async()=>{
  const plain=Buffer.from('synthetic-only-token');const cipher=await protect(plain);
  assert.ok(!cipher.includes(plain));assert.deepEqual(await protect(cipher,true),plain);
});
