import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createServer } from 'vite';

test('platform language governance and localization contributor workflow',async t=>{
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST,'Firestore emulator required.');
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST,'Auth emulator required.');
  if(process.env.FIREBASE_ADMIN_PROJECT_ID&&process.env.FIREBASE_ADMIN_PROJECT_ID!=='demo-vop-security-rules'){
    throw new Error('Refusing tests outside the demo Firebase project.');
  }
  process.env.FIREBASE_ADMIN_PROJECT_ID='demo-vop-security-rules';
  const app=getApps()[0]||initializeApp({projectId:'demo-vop-security-rules'});
  const db=getFirestore(app);
  const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
  try{
    const {default:languages}=await vite.ssrLoadModule('/api_handlers/admin/languages.ts');
    const {default:workflow}=await vite.ssrLoadModule('/api_handlers/admin/localization.ts');
    const {default:publicLocalization}=await vite.ssrLoadModule('/api/localization.ts');
    const org='org-localization-a';
    await db.doc('organizations/'+org).set({id:org,name:'Localization Org',status:'active'});

    async function identity(name,role='learner'){
      const response=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+
        '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({email:name+'@vop-test.invalid',password:'local-emulator-only',returnSecureToken:true}),
        });
      const user=await response.json();
      assert.equal(response.status,200,JSON.stringify(user));
      const superAdmin=role==='super_admin';
      await db.doc('users/'+user.localId).set({
        uid:user.localId,email:name+'@vop-test.invalid',displayName:name,
        role:superAdmin?'super_admin':'student',
        organizationId:superAdmin?'':org,
        organizationRole:superAdmin?'':role,
      });
      if(!superAdmin)await db.doc(`organizations/${org}/members/${user.localId}`).set({
        uid:user.localId,organizationId:org,role,active:true,
      });
      return {uid:user.localId,token:user.idToken,email:name+'@vop-test.invalid'};
    }
    async function call(handler,user,body={},method='POST',query={}){
      let status=200,payload;
      await handler({method,headers:user?{authorization:'Bearer '+user.token}:{},body,query},{
        status(code){status=code;return this;},json(value){payload=value;return this;},
      });
      return {status,payload};
    }

    const superAdmin=await identity('localization-platform','super_admin');
    const applicant=await identity('localization-applicant');
    const reviewerA=await identity('localization-reviewer-a');
    const reviewerB=await identity('localization-reviewer-b');
    const orgAdmin=await identity('localization-org-admin','admin');
    const code='bem';

    await t.test('tenant administrators cannot create private language registries anymore',async()=>{
      const denied=await call(languages,orgAdmin,{action:'tenantupsert',code:'zxx',name:'Tenant language'});
      assert.equal(denied.status,403,JSON.stringify(denied.payload));
      assert.match(String(denied.payload.error),/platform-wide|Super Admin|localization/i);
      assert.equal((await db.doc('organizations/'+org+'/languages/zxx').get()).exists,false);
    });

    await t.test('only Super Admin creates and changes platform languages',async()=>{
      const denied=await call(languages,orgAdmin,{action:'upsert',code,name:'Bemba',nativeName:'Ichibemba',enabled:true});
      assert.equal(denied.status,403);
      const created=await call(languages,superAdmin,{action:'upsert',code,name:'Bemba',nativeName:'Ichibemba',enabled:true});
      assert.equal(created.status,200,JSON.stringify(created.payload));
      assert.equal((await db.doc('languages/'+code).get()).data()?.name,'Bemba');
    });

    await t.test('any authenticated VOP account may apply for localization',async()=>{
      const applied=await call(workflow,applicant,{
        action:'apply',languages:[code],roles:['translator'],note:'Native speaker and Bible-study translator',
      });
      assert.equal(applied.status,200,JSON.stringify(applied.payload));
      const record=(await db.doc('localizationApplications/'+applicant.uid).get()).data();
      assert.equal(record?.status,'pending');
      assert.deepEqual(record?.languages,[code]);
      const queue=await call(workflow,superAdmin,{action:'listApplications'});
      assert.equal(queue.status,200,JSON.stringify(queue.payload));
      assert.ok(queue.payload.items.some(item=>item.id===applicant.uid));
    });

    await t.test('Super Admin approves applicants and directly invites reviewers',async()=>{
      const approved=await call(workflow,superAdmin,{action:'setApplication',uid:applicant.uid,decision:'approve'});
      assert.equal(approved.status,200,JSON.stringify(approved.payload));
      assert.equal((await db.doc('localizationCollaborators/'+applicant.uid).get()).data()?.status,'active');
      for(const reviewer of [reviewerA,reviewerB]){
        const invited=await call(workflow,superAdmin,{
          action:'setCollaborator',email:reviewer.email,roles:['reviewer'],languages:[code],status:'active',
        });
        assert.equal(invited.status,200,JSON.stringify(invited.payload));
      }
    });

    let proposalId='';
    await t.test('translator proposal stays pending below the 90 percent reviewer threshold',async()=>{
      const proposed=await call(workflow,applicant,{
        action:'submitProposal',languageId:code,key:'common.save',proposedValue:'Sunga',reason:'Natural Bemba command',
      });
      assert.equal(proposed.status,200,JSON.stringify(proposed.payload));
      proposalId=proposed.payload.item.id;
      const selfReview=await call(workflow,applicant,{action:'recommend',languageId:code,proposalId,decision:'recommend'});
      assert.equal(selfReview.status,403,JSON.stringify(selfReview.payload));
      const first=await call(workflow,reviewerA,{action:'recommend',languageId:code,proposalId,decision:'recommend'});
      assert.equal(first.status,200,JSON.stringify(first.payload));
      assert.equal(first.payload.autoPublished,false);
      assert.equal(first.payload.recommendationPercent,50);
      assert.equal((await db.doc(`locales/${code}/translations/common.save`).get()).exists,false);
    });

    await t.test('90 percent or higher reviewer recommendation automatically approves and publishes',async()=>{
      const second=await call(workflow,reviewerB,{action:'recommend',languageId:code,proposalId,decision:'recommend'});
      assert.equal(second.status,200,JSON.stringify(second.payload));
      assert.equal(second.payload.autoPublished,true);
      assert.equal(second.payload.status,'approved');
      const canonical=await db.doc(`locales/${code}/translations/common.save`).get();
      assert.equal(canonical.data()?.value,'Sunga');
      assert.equal((await db.doc(`translations/${code}/proposals/${proposalId}`).get()).data()?.publicationMode,'automatic');
      const publicRead=await call(publicLocalization,null,{},'GET',{locale:code});
      assert.equal(publicRead.status,200,JSON.stringify(publicRead.payload));
      assert.equal(publicRead.payload.translations['common.save'],'Sunga');
    });

    await t.test('organization admins cannot review or publish canonical translations',async()=>{
      const next=await call(workflow,applicant,{
        action:'submitProposal',languageId:code,key:'common.cancel',proposedValue:'Leka',
      });
      assert.equal(next.status,200,JSON.stringify(next.payload));
      const denied=await call(workflow,orgAdmin,{action:'approveProposal',languageId:code,proposalId:next.payload.item.id});
      assert.equal(denied.status,403);
      const manual=await call(workflow,superAdmin,{action:'approveProposal',languageId:code,proposalId:next.payload.item.id});
      assert.equal(manual.status,200,JSON.stringify(manual.payload));
      assert.equal((await db.doc(`locales/${code}/translations/common.cancel`).get()).data()?.value,'Leka');
    });
  }finally{
    await vite.close();
    if(getApps().includes(app))await deleteApp(app);
  }
});
