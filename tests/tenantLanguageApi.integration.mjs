import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createServer } from 'vite';

// Never point this integration test at live ministry or production projects.
test('tenant languages, organization overrides and irreversible platform adoption',async t=>{
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST,'Firestore emulator required.');
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST,'Auth emulator required.');
  if(process.env.FIREBASE_ADMIN_PROJECT_ID &&
      process.env.FIREBASE_ADMIN_PROJECT_ID!=='demo-vop-security-rules'){
    throw new Error('Refusing tests outside the demo Firebase project.');
  }
  process.env.FIREBASE_ADMIN_PROJECT_ID='demo-vop-security-rules';
  const app=getApps()[0]||initializeApp({projectId:'demo-vop-security-rules'});
  const db=getFirestore(app);
  const vite=await createServer({configFile:false,
    server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
  try{
    const {default:languages}=await vite.ssrLoadModule('/api_handlers/admin/languages.ts');
    const {default:content}=await vite.ssrLoadModule('/api_handlers/admin/content.ts');
    const {default:localization}=await vite.ssrLoadModule('/api/localization.ts');
    const prefix='org-language-a';
    const foreignId='org-language-b';
    await db.doc('organizations/'+prefix).set({id:prefix,status:'active'});
    await db.doc('organizations/'+foreignId).set({id:foreignId,status:'active'});

    async function identity(name,orgId,role='owner'){
      const response=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+
        '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            email:name+'@vop-test.invalid',
            password:'local-emulator-only',returnSecureToken:true,
          }),
        });
      const user=await response.json();
      assert.equal(response.status,200,JSON.stringify(user));
      await db.doc('users/'+user.localId).set({
        uid:user.localId,role:role==='super_admin'?'super_admin':'student',
        organizationId:role==='super_admin'?'':orgId,
        organizationRole:role==='super_admin'?'':role,
      });
      if(role!=='super_admin')await db.doc(`organizations/${orgId}/members/${user.localId}`)
        .set({uid:user.localId,organizationId:orgId,role,active:true});
      return {uid:user.localId,token:user.idToken};
    }
    async function call(handler,user,body,method='POST',query={}){
      let status=200,payload;
      await handler({
        method,headers:user?{authorization:'Bearer '+user.token}:{},
        body,query,
      },{
        status(code){status=code;return this;},
        json(value){payload=value;return this;},
      });
      return {status,payload};
    }
    const author=await identity('language-author',prefix);
    const peer=await identity('language-peer',prefix);
    const outsider=await identity('language-outsider',foreignId);
    const superAdmin=await identity('language-platform-admin','','super_admin');
    const code='zvq';

    await t.test('organization language creation never writes to canonical registry',async()=>{
      const created=await call(languages,author,{
        action:'tenantupsert',code,name:'Organization Language',nativeName:'Private Language',
      });
      assert.equal(created.status,200,JSON.stringify(created.payload));
      assert.equal((await db.doc('languages/'+code).get()).exists,false);
      const privateDoc=await db.doc(`organizations/${prefix}/languages/${code}`).get();
      assert.equal(privateDoc.data()?.ownerUid,author.uid);
      const canonicalAttempt=await call(languages,author,{action:'upsert',code,name:'Platform takeover'});
      assert.equal(canonicalAttempt.status,403,JSON.stringify(canonicalAttempt.payload));
      assert.equal((await db.doc('languages/'+code).get()).exists,false);
    });

    await t.test('same-organization co-editor and foreign organization cannot mutate author language',async()=>{
      const peerEdit=await call(languages,peer,{action:'tenantupsert',code,name:'Peer takeover'});
      assert.equal(peerEdit.status,403,JSON.stringify(peerEdit.payload));
      const outsiderRead=await call(languages,outsider,{action:'tenantlist'});
      assert.equal(outsiderRead.status,200);
      assert.equal(outsiderRead.payload.items.some(item=>item.code===code),false);
      const crossTenant=await call(languages,outsider,{
        action:'tenantupsert',organizationId:prefix,code,name:'Cross-tenant takeover',
      });
      assert.equal(crossTenant.status,403,JSON.stringify(crossTenant.payload));
    });

    await t.test('private locale and translations are available only to own signed-in tenant',async()=>{
      const saved=await call(localization,author,{
        action:'tenantbulksave',locale:code,values:{'common.save':'Save for org A'},
      });
      assert.equal(saved.status,200,JSON.stringify(saved.payload));
      assert.equal((await db.doc('locales/'+code).get()).exists,false);
      assert.equal((await db.doc('translations/'+code).get()).exists,false);
      const privateLanguageRegistry=await call(localization,author,{},'GET');
      assert.equal(privateLanguageRegistry.status,200);
      assert.equal(privateLanguageRegistry.payload.items.some(item=>item.code===code),true);
      const anonymousRegistry=await call(localization,null,{},'GET');
      assert.equal(anonymousRegistry.payload.items.some(item=>item.code===code),false);
      const foreignRegistry=await call(localization,outsider,{},'GET');
      assert.equal(foreignRegistry.payload.items.some(item=>item.code===code),false);
      const ownerTranslation=await call(localization,author,{},'GET',{locale:code});
      assert.equal(ownerTranslation.status,200);
      assert.equal(ownerTranslation.payload.translations['common.save'],'Save for org A');
      const outsiderTranslation=await call(localization,outsider,{},'GET',{locale:code});
      assert.equal(outsiderTranslation.status,404);
      const peerEdit=await call(localization,peer,{
        action:'tenantsave',locale:code,key:'common.save',value:'Peer overwrite',
      });
      assert.equal(peerEdit.status,403);
      assert.equal((await db.doc(`organizations/${prefix}/locales/${code}/translations/common.save`).get()).data()?.value,'Save for org A');
    });

    let guideId='';
    await t.test('guide use prevents deletion before global adoption',async()=>{
      const guide=await call(content,author,{
        action:'upsertGuide',collection:'guides',
        data:{language:code,title:'Local-language study module',published:false,sharingScope:'organization'},
      });
      assert.equal(guide.status,200,JSON.stringify(guide.payload));
      guideId=guide.payload.item.id;
      const deleteAttempt=await call(languages,author,{action:'tenantdelete',code});
      assert.notEqual(deleteAttempt.status,200);
      assert.equal((await db.doc('languages/'+code).get()).exists,false);
    });

    await t.test('publishing a shared guide atomically adopts its language',async()=>{
      const published=await call(content,author,{
        action:'upsertGuide',collection:'guides',
        data:{id:guideId,language:code,title:'Shared study module',published:true,sharingScope:'shared'},
      });
      assert.equal(published.status,200,JSON.stringify(published.payload));
      const platformLanguage=(await db.doc('languages/'+code).get()).data();
      assert.equal(platformLanguage?.platformOwned,true);
      assert.equal(platformLanguage?.sourceOrganizationId,prefix);
      assert.equal((await db.doc(`organizations/${prefix}/languages/${code}`).get()).data()?.adoptedByPlatform,true);
      const foreignRegistry=await call(localization,outsider,{},'GET');
      assert.equal(foreignRegistry.payload.items.some(item=>item.code===code),true);
      const ownerRead=await call(localization,author,{},'GET',{locale:code});
      assert.equal(ownerRead.payload.translations['common.save'],'Save for org A');
      const foreignRead=await call(localization,outsider,{},'GET',{locale:code});
      assert.equal(foreignRead.status,200);
      assert.equal(foreignRead.payload.translations['common.save'],undefined);
      const orgEdit=await call(languages,author,{action:'tenantupsert',code,name:'Unauthorized rename'});
      assert.equal(orgEdit.status,403,JSON.stringify(orgEdit.payload));
      const orgDelete=await call(languages,author,{action:'tenantdelete',code});
      assert.notEqual(orgDelete.status,200);
      const guideEdit=await call(content,author,{
        action:'upsertGuide',collection:'guides',
        data:{id:guideId,language:code,title:'Unauthorized edit',published:true,sharingScope:'shared'},
      });
      assert.notEqual(guideEdit.status,200);
      assert.equal((await db.doc('guides/'+guideId).get()).data()?.title,'Shared study module');
      const foreignGuide=await call(content,outsider,{
        action:'upsertGuide',collection:'guides',
        data:{language:code,title:'Foreign org reuses shared language',published:false,sharingScope:'organization'},
      });
      assert.equal(foreignGuide.status,200,JSON.stringify(foreignGuide.payload));
    });

    await t.test('Super Admin retains platform language authority',async()=>{
      const update=await call(languages,superAdmin,{
        action:'upsert',code,name:'Managed by VOP',nativeName:'Platform language',enabled:true,
      });
      assert.equal(update.status,200,JSON.stringify(update.payload));
      assert.equal((await db.doc('languages/'+code).get()).data()?.name,'Managed by VOP');
    });

    await t.test('unused local drafts can be removed; explicit share promotes a new language',async()=>{
      const unused='zvr';
      const saved=await call(languages,author,{action:'tenantupsert',code:unused,name:'Unused'});
      assert.equal(saved.status,200,JSON.stringify(saved.payload));
      const deleted=await call(languages,author,{action:'tenantdelete',code:unused});
      assert.equal(deleted.status,200,JSON.stringify(deleted.payload));
      assert.equal((await db.doc(`organizations/${prefix}/languages/${unused}`).get()).exists,false);
      await call(languages,author,{action:'tenantupsert',code:unused,name:'Shareable'});
      const shared=await call(languages,author,{action:'tenantshare',code:unused});
      assert.equal(shared.status,200,JSON.stringify(shared.payload));
      assert.equal((await db.doc('languages/'+unused).get()).data()?.platformOwned,true);
      assert.notEqual((await call(languages,author,{action:'tenantdelete',code:unused})).status,200);
    });
  }finally{
    await vite.close();
    if(getApps().includes(app))await deleteApp(app);
  }
});
