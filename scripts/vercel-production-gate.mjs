import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_OWNER='pamtechz';
const EXPECTED_REPO='VOP-New';
const MAIN_BRANCH='main';
const SHA_RE=/^[a-f0-9]{40}$/i;

function text(value){return String(value??'').trim();}

export function productionGitContext(env=process.env){
  const environment=text(env.VERCEL_TARGET_ENV||env.VERCEL_ENV).toLowerCase();
  return {
    production:environment==='production',
    provider:text(env.VERCEL_GIT_PROVIDER).toLowerCase(),
    owner:text(env.VERCEL_GIT_REPO_OWNER),
    repo:text(env.VERCEL_GIT_REPO_SLUG),
    ref:text(env.VERCEL_GIT_COMMIT_REF),
    sha:text(env.VERCEL_GIT_COMMIT_SHA).toLowerCase(),
  };
}

export async function evaluateProductionDeployment({
  env=process.env,
  fetchImpl=globalThis.fetch,
}={}){
  const context=productionGitContext(env);
  if(!context.production){
    return {allow:true,reason:'non-production',context};
  }
  if(context.ref!==MAIN_BRANCH){
    return {allow:false,reason:'production deployments must originate from main',context};
  }

  if(context.provider!=='github'){
    return {allow:false,reason:'production-main must originate from GitHub',context};
  }
  if(context.owner!==EXPECTED_OWNER||context.repo!==EXPECTED_REPO){
    return {allow:false,reason:'unexpected production Git repository',context};
  }
  if(!SHA_RE.test(context.sha)){
    return {allow:false,reason:'missing or invalid production commit SHA',context};
  }
  if(typeof fetchImpl!=='function'){
    return {allow:false,reason:'GitHub provenance verification is unavailable',context};
  }

  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetchImpl(
      `https://api.github.com/repos/${encodeURIComponent(EXPECTED_OWNER)}/${encodeURIComponent(EXPECTED_REPO)}/commits/${context.sha}/pulls?per_page=100`,
      {
        headers:{
          Accept:'application/vnd.github+json',
          'User-Agent':'vop-vercel-production-gate',
          'X-GitHub-Api-Version':'2022-11-28',
        },
        signal:controller.signal,
      },
    );
    if(!response?.ok){
      return {allow:false,reason:`GitHub provenance lookup failed (${response?.status||'unknown'})`,context};
    }
    const payload=await response.json();
    const pulls=Array.isArray(payload)?payload:[];
    const approved=pulls.some(pr=>
      pr&&pr.state==='closed'
      &&Boolean(pr.merged_at)
      &&pr.base?.ref===MAIN_BRANCH
      &&text(pr.merge_commit_sha).toLowerCase()===context.sha
    );
    return approved
      ?{allow:true,reason:'merged PR to main verified',context}
      :{allow:false,reason:'production commit is not a verified merged PR result',context};
  }catch(error){
    const reason=error instanceof Error&&error.name==='AbortError'
      ?'GitHub provenance lookup timed out'
      :'GitHub provenance lookup failed';
    return {allow:false,reason,context};
  }finally{
    clearTimeout(timeout);
  }
}

export async function runProductionGate(options={}){
  const result=await evaluateProductionDeployment(options);
  const action=result.allow?'CONTINUE':'IGNORE';
  console.log(`[vop-production-gate] ${action}: ${result.reason}`);
  return result.allow?1:0;
}

const entry=process.argv[1]?resolve(process.argv[1]):'';
if(entry&&entry===resolve(fileURLToPath(import.meta.url))){
  process.exitCode=await runProductionGate();
}
