import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateProductionDeployment, productionGitContext } from '../scripts/vercel-production-gate.mjs';

const sha='da4ce02c6c565e542122fe515d356afdbd6a3ef1';
const baseEnv={
  VERCEL_ENV:'production',
  VERCEL_GIT_PROVIDER:'github',
  VERCEL_GIT_REPO_OWNER:'pamtechz',
  VERCEL_GIT_REPO_SLUG:'VOP-New',
  VERCEL_GIT_COMMIT_REF:'main',
  VERCEL_GIT_COMMIT_SHA:sha,
};

test('production gate allows preview but rejects production non-main deployments without network lookup',async()=>{
  let calls=0;
  const fetchImpl=async()=>{calls++;throw new Error('should not run');};
  assert.equal((await evaluateProductionDeployment({env:{...baseEnv,VERCEL_ENV:'preview'},fetchImpl})).allow,true);
  assert.equal((await evaluateProductionDeployment({env:{...baseEnv,VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'feature/test'},fetchImpl})).allow,true);
  const nonMain=await evaluateProductionDeployment({env:{...baseEnv,VERCEL_GIT_COMMIT_REF:'feature/test'},fetchImpl});
  assert.equal(nonMain.allow,false);
  assert.match(nonMain.reason,/must originate from main/);
  const absentRef=await evaluateProductionDeployment({env:{...baseEnv,VERCEL_GIT_COMMIT_REF:''},fetchImpl});
  assert.equal(absentRef.allow,false);
  assert.equal(calls,0);
});

test('production gate allows only the exact merged PR result targeting main',async()=>{
  const fetchImpl=async()=>new Response(JSON.stringify([{
    state:'closed',
    merged_at:'2026-10-09T14:01:34Z',
    merge_commit_sha:sha,
    base:{ref:'main'},
  }]),{status:200,headers:{'content-type':'application/json'}});
  const result=await evaluateProductionDeployment({env:baseEnv,fetchImpl});
  assert.equal(result.allow,true);
  assert.equal(result.reason,'merged PR to main verified');
});

test('production gate rejects direct commits and unrelated associated PRs',async()=>{
  const direct=await evaluateProductionDeployment({
    env:baseEnv,
    fetchImpl:async()=>new Response('[]',{status:200,headers:{'content-type':'application/json'}}),
  });
  assert.equal(direct.allow,false);

  const wrong=await evaluateProductionDeployment({
    env:baseEnv,
    fetchImpl:async()=>new Response(JSON.stringify([{
      state:'closed',merged_at:'2026-10-09T14:01:34Z',
      merge_commit_sha:'1111111111111111111111111111111111111111',
      base:{ref:'main'},
    }]),{status:200,headers:{'content-type':'application/json'}}),
  });
  assert.equal(wrong.allow,false);
});

test('production gate fails closed when GitHub provenance cannot be verified',async()=>{
  const unavailable=await evaluateProductionDeployment({
    env:baseEnv,
    fetchImpl:async()=>new Response('rate limited',{status:403}),
  });
  assert.equal(unavailable.allow,false);

  const network=await evaluateProductionDeployment({
    env:baseEnv,
    fetchImpl:async()=>{throw new Error('offline');},
  });
  assert.equal(network.allow,false);
});

test('production gate rejects unexpected repository, provider and invalid SHA',async()=>{
  for(const env of [
    {...baseEnv,VERCEL_GIT_PROVIDER:'gitlab'},
    {...baseEnv,VERCEL_GIT_REPO_OWNER:'someone-else'},
    {...baseEnv,VERCEL_GIT_REPO_SLUG:'another-repo'},
    {...baseEnv,VERCEL_GIT_COMMIT_SHA:'not-a-sha'},
  ]){
    const result=await evaluateProductionDeployment({
      env,
      fetchImpl:async()=>{throw new Error('must not call');},
    });
    assert.equal(result.allow,false);
  }
  assert.equal(productionGitContext(baseEnv).sha,sha);
});
