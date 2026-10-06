import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

// DPAPI binds ciphertext to the current Windows user. Secret bytes travel on stdin,
// never command-line arguments, console output, environment variables or public files.
export function protect(bytes, decrypt=false) {
  if (process.platform !== 'win32') throw new Error('Windows DPAPI is required');
  const method = decrypt ? 'Unprotect' : 'Protect';
  const script = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; `+
    `$b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); `+
    `$r=[Security.Cryptography.ProtectedData]::${method}($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); `+
    `[Console]::Out.Write([Convert]::ToBase64String($r))`;
  return new Promise((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    const chunks=[]; let size=0;
    const timer=setTimeout(()=>{child.kill();reject(new Error('Windows vault timed out'));},15000);
    child.stdout.on('data',b=>{size+=b.length;if(size>1024*1024){child.kill();return;}chunks.push(b);});
    child.stderr.resume();
    child.on('error',()=>{clearTimeout(timer);reject(new Error('Windows vault unavailable'));});
    child.on('close',code=>{clearTimeout(timer);code===0?resolve(Buffer.from(Buffer.concat(chunks).toString(),'base64')):reject(new Error('Windows vault operation failed'));});
    child.stdin.on('error',()=>{});child.stdin.end(Buffer.from(bytes).toString('base64'));
  });
}
export async function saveVault(path,value) {
  const encrypted=await protect(Buffer.from(JSON.stringify(value)));
  await mkdir(dirname(path),{recursive:true});
  const temp=path+'.'+randomBytes(8).toString('hex')+'.tmp';
  await writeFile(temp,encrypted,{flag:'wx'}); await rename(temp,path);
}
export async function readVault(path) {
  return JSON.parse((await protect(await readFile(path),true)).toString('utf8'));
}
