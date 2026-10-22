#!/usr/bin/env node
/** Explicit, isolated preview/apply entry point for approved server execution.
 * It emits only a static status page; it never promotes or replaces the app.
 */
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const mode=process.argv.find(value=>value.startsWith('--mode='))?.slice(7)||'preview';
if(!['preview','apply'].includes(mode))throw new Error('Choose --mode=preview or --mode=apply.');
if(process.env.VERCEL&&mode==='apply'){
  if(process.env.VERCEL_ENV==='production')throw new Error('Import execution must not promote or replace the production deployment.');
  if(process.env.VERCEL_PROJECT_ID&&process.env.VERCEL_PROJECT_ID!=='prj_zxOpr6AsBlSI0PuzQtflJmL2RPrU')
    throw new Error('Unexpected Vercel project for this controlled import.');
}
const args=[join(here,'seed-vop-guides.mjs'),'--connect','--project-id','voiceofprophecy',
  '--program-id','program-8f8ef60d94fa4c16b8236a678fbf5e76','--publish'];
if(mode==='apply')args.push('--apply','--confirm-project','voiceofprophecy',
  '--backup-file',join(tmpdir(),`vop-guide-import-before-${Date.now()}-${process.pid}.json`));
execFileSync(process.execPath,args,{cwd:resolve(here,'../..'),stdio:'inherit',timeout:180000});
const output=join(here,'import-report');
await mkdir(output,{recursive:true});
await writeFile(join(output,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><title>VOP lesson import ${mode}</title><main><h1>VOP lesson import ${mode} completed</h1><p>The controlled import process completed successfully. Refer to the authenticated administration workspace and import receipt for the saved state.</p><p>This preview does not replace the VOP application.</p></main></html>`);
