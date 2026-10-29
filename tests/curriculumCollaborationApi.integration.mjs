import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,getApps} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {createServer} from 'vite';

test('curriculum approval preserves ownership and rejects stale or overlapping reviews',async t=>{
  const project='demo-vop-security-rules';
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST&&process.env.FIREBASE_AUTH_EMULATOR_HOST,
    'This suite requires both emulators and must never use production.');
  assert.ok(!process.env.FIREBASE_ADMIN_PROJECT_ID||process.env.FIREBASE_ADMIN_PROJECT_ID===project);
  process.env.FIREBASE_ADMIN_PROJECT_ID=project;
  const db=getFirestore(getApps()[0]||initializeApp({projectId:project}));
  const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
  try{
    const {authenticateTenant}=await vite.ssrLoadModule('/server/tenant.ts');
    const {handleCurriculumCollaboration}=await vite.ssrLoadModule('/server/curriculumCollaboration.ts');
    async function identity(name,organizationId,role='owner'){
      const result=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+
        '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email:name+'@collaboration-vop.invalid',password:'local-emulator-only',returnSecureToken:true}),
      });
      const account=await result.json();
      assert.equal(result.status,200,JSON.stringify(account));
      await db.doc('organizations/'+organizationId).set({status:'active',name:organizationId});
      await db.doc('organizations/'+organizationId+'/members/'+account.localId).set({uid:account.localId,role,active:true});
      await db.doc('users/'+account.localId).set({uid:account.localId,role:'student',organizationId,organizationRole:role});
      return authenticateTenant({headers:{authorization:'Bearer '+account.idToken}},organizationId);
    }
    const owner=await identity('collaboration-owner','collaboration-org-a');
    const outsider=await identity('collaboration-outsider','collaboration-org-b');
    const editor=await identity('collaboration-editor','collaboration-org-b','editor');
    const response=()=>({code:200,body:null,status(code){this.code=code;return this;},json(body){this.body=body;}});
    async function fixture(name){
      const target=db.doc('guides/collaboration-'+name);
      const suggestion=db.doc('curriculumEditSuggestions/collaboration-'+name);
      await target.set({title:'Original',description:'Study',published:true,sharingScope:'shared',
        organizationId:owner.organizationId,ownerOrganizationId:owner.organizationId,
        ownerTenantId:owner.organizationId,ownerUid:owner.auth.uid});
      await suggestion.set({kind:'guides',recordId:target.id,guideId:'',targetPath:target.path,
        ownerOrganizationId:owner.organizationId,proposerOrganizationId:outsider.organizationId,
        proposerUid:outsider.auth.uid,status:'pending',proposed:{title:'Reviewed title'},baseline:{title:'Original'}});
      return {target,suggestion};
    }
    const review=(ctx,id)=>handleCurriculumCollaboration(ctx,'reviewSuggestedEdit',{id,decision:'approve'},response());
    // Interpose only this request's transaction boundary, keeping all reads,
    // writes and Firestore transaction conflict handling real in the emulator.
    const beforeTransaction=(change)=>({...owner,db:new Proxy(db,{get(target,key){
      if(key==='runTransaction')return async callback=>{await change();return target.runTransaction(callback);};
      const value=Reflect.get(target,key,target);
      return typeof value==='function'?value.bind(target):value;
    }})});
    await t.test('organisation editors cannot change tenant-wide shared curriculum visibility',async()=>{
      const {target}=await fixture('visibility');
      const settings=db.doc('organizations/'+outsider.organizationId+'/settings/sharedCurriculum');
      const payload={kind:'guides',id:target.id,hidden:true};
      await assert.rejects(
        handleCurriculumCollaboration(editor,'setSharedVisibility',payload,response()),
        /Only an organization administrator/);
      assert.equal((await settings.get()).exists,false);
      const reply=response();
      assert.equal(await handleCurriculumCollaboration(outsider,'setSharedVisibility',payload,reply),true);
      assert.equal(reply.code,200);
      assert.deepEqual((await settings.get()).data().hiddenGuideIds,[target.id]);
    });
    await t.test('a foreign administrator cannot approve another organization suggestion',async()=>{
      const {target,suggestion}=await fixture('foreign');
      await assert.rejects(review(outsider,suggestion.id),/Only the content owner/);
      assert.equal((await target.get()).data().title,'Original');
      assert.equal((await suggestion.get()).data().status,'pending');
    });
    await t.test('ownership transfer between authorization and transaction invalidates approval',async()=>{
      const {target,suggestion}=await fixture('transfer');
      const raced=beforeTransaction(()=>target.update({organizationId:outsider.organizationId,
        ownerOrganizationId:outsider.organizationId,ownerTenantId:outsider.organizationId,ownerUid:outsider.auth.uid}));
      await assert.rejects(review(raced,suggestion.id),/Content ownership changed/);
      assert.equal((await target.get()).data().title,'Original');
      assert.equal((await suggestion.get()).data().status,'pending');
    });
    await t.test('deletion between authorization and transaction cannot recreate the original',async()=>{
      const {target,suggestion}=await fixture('deleted');
      await assert.rejects(review(beforeTransaction(()=>target.delete()),suggestion.id),/original was deleted/i);
      assert.equal((await target.get()).exists,false);
      assert.equal((await suggestion.get()).data().status,'pending');
    });
    await t.test('an intervening author edit cannot be overwritten by an old proposal',async()=>{
      const {target,suggestion}=await fixture('edited');
      await assert.rejects(review(beforeTransaction(()=>target.update({title:'New author edit'})),suggestion.id),/owner has edited/);
      assert.equal((await target.get()).data().title,'New author edit');
      assert.equal((await suggestion.get()).data().status,'pending');
    });
    await t.test('concurrent approvals apply once and preserve canonical ownership',async()=>{
      const {target,suggestion}=await fixture('concurrent');
      const results=await Promise.allSettled([review(owner,suggestion.id),review(owner,suggestion.id)]);
      assert.equal(results.filter(item=>item.status==='fulfilled').length,1);
      const rejected=results.find(item=>item.status==='rejected');
      assert.match(String(rejected.reason),/already been reviewed/);
      const record=(await target.get()).data();
      assert.equal(record.title,'Reviewed title');
      assert.equal(record.ownerOrganizationId,owner.organizationId);
      assert.equal(record.ownerUid,owner.auth.uid);
      assert.equal((await suggestion.get()).data().status,'approved');
    });
  }finally{await vite.close();}
});
