import { readFile, mkdir, writeFile, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { authorize, tokenRequest } from './oauth.mjs';
import { readVault, saveVault } from './vault.mjs';
import { invoiceSearch } from '../core.mjs';
import { scanInvoiceCandidates } from '../gmail.mjs';

// Local preview: OAuth + Gmail candidates. Does not write Firebase or expenses.
const [command,configPath,profile,preferencesPath]=process.argv.slice(2);
if (!['connect','scan','disconnect'].includes(command) || !configPath || !/^[a-zA-Z0-9_-]{1,64}$/.test(profile||'')) {
  console.error('Usage: node connector.mjs connect|scan|disconnect <desktop-oauth.json> <local-profile> [supplier-preferences.json]');
  process.exit(1);
}
const base=join(process.env.FAYNA_DATA_DIR || join(process.env.LOCALAPPDATA || '', 'Fayna','LocalConnector'),profile);
const vaultPath=join(base,'google.token');
try {
  if (!process.env.LOCALAPPDATA || process.platform!=='win32') throw new Error('Windows local application data required');
  const config=JSON.parse(await readFile(configPath,'utf8')).installed;
  if (!config?.client_id?.endsWith('.apps.googleusercontent.com')) throw new Error('Expected installed-app OAuth config');
  if (command==='connect') {
    try {await readFile(vaultPath);throw new Error('Profile already connected; disconnect first');}
    catch(error) {if(error.code!=='ENOENT') throw error;}
    const token=await authorize(config,url=>console.log('Open this Google authorization URL in your browser:\n'+url));
    const response=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile',{
      headers:{Authorization:`Bearer ${token.access_token}`},signal:AbortSignal.timeout(20000)});
    if(!response.ok) throw new Error(`Gmail profile request failed (${response.status})`);
    const info=await response.json();
    if(!info.emailAddress) throw new Error('Gmail identity missing');
    await saveVault(vaultPath,{clientId:config.client_id,mailbox:info.emailAddress,token});
    console.log('Gmail connected locally. No messages have been scanned or uploaded.');
  } else {
    const session=await readVault(vaultPath);
    if(session.clientId!==config.client_id) throw new Error('OAuth client does not match this profile');
    if(command==='disconnect') {
      const response=await fetch('https://oauth2.googleapis.com/revoke',{method:'POST',
        body:new URLSearchParams({token:session.token.refresh_token}),signal:AbortSignal.timeout(20000)});
      if(!response.ok) throw new Error(`Google revocation failed (${response.status}); local token retained for retry`);
      await unlink(vaultPath);console.log('Disconnected. Local invoice drafts retained.');
    } else {
      if(!preferencesPath) throw new Error('Supplier preferences file required');
      const preferences=JSON.parse(await readFile(preferencesPath,'utf8'));
      invoiceSearch(preferences);
      if(session.token.expires_at<Date.now()+60000) {
        const refreshed=await tokenRequest(config,{grant_type:'refresh_token',refresh_token:session.token.refresh_token});
        session.token={...session.token,...refreshed};await saveVault(vaultPath,session);
      }
      const folder=join(base,'invoice-drafts');await mkdir(folder,{recursive:true});
      const uid=createHash('sha256').update(session.mailbox.toLowerCase()).digest('hex');
      // Scan at most 250 candidates per run. Manual continuation remains explicit.
      let nextPageToken, pages=0, examined=0;
      do {
        const result=await scanInvoiceCandidates({uid,preferences:{...preferences,pageToken:nextPageToken},
          getAccessToken:async()=>session.token.access_token,
          saveDraft:async(_,draft)=>{
            try {await writeFile(join(folder,draft.id+'.json'),JSON.stringify(draft,null,2),{flag:'wx'});}
            catch(error){if(error.code!=='EEXIST')throw error;}
          }});
        examined+=result.examined;nextPageToken=result.nextPageToken;pages++;
      } while(nextPageToken && pages<10);
      console.log(JSON.stringify({examined,localDrafts:(await readdir(folder)).filter(n=>n.endsWith('.json')).length,
        truncated:!!nextPageToken,uploaded:false}));
    }
  }
} catch(error) {console.error(error.message);process.exitCode=1;}
