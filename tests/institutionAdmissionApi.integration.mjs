import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,getApps} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {createServer} from 'vite';

test('public institution admission creates only learner memberships and preserves tenant boundaries',async t=>{
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST,'Firestore emulator required; never use production.');
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST,'Auth emulator required; never use production.');
  const projectId='demo-vop-security-rules';
  assert.ok(!process.env.FIREBASE_ADMIN_PROJECT_ID||process.env.FIREBASE_ADMIN_PROJECT_ID===projectId);
  process.env.FIREBASE_ADMIN_PROJECT_ID=projectId;
  const app=getApps()[0]||initializeApp({projectId});
  const db=getFirestore(app),auth=getAuth(app);
  const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
  const organizationId='org-public-admission',otherOrganizationId='org-private-admission';
  await db.doc('organizations/'+organizationId).set({name:'Public Study Ministry',status:'active',isPublicMinistry:true,plan:'admission-plan',quotas:{},featureEntitlements:{candidates:true},city:'Lusaka'});
  await db.doc('organizations/'+otherOrganizationId).set({name:'Invitation Ministry',status:'active',allowSelfEnrollment:false,plan:'admission-plan'});
  await db.doc('organizations/org-legacy-closed').set({
    name:'Legacy without admission settings',status:'active',plan:'admission-plan',
  });
  async function identity(label,profile={}){
    const result=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:label+'@vop-admission.invalid',password:'local-emulator-only',returnSecureToken:true}),
    });
    const row=await result.json();assert.equal(result.status,200,JSON.stringify(row));
    await db.doc('users/'+row.localId).set({uid:row.localId,role:'student',organizationId:'',organizationRole:'',...profile});
    return {uid:row.localId,token:row.idToken};
  }
  try{
    const {default:handler}=await vite.ssrLoadModule('/api_handlers/admin/organizations.ts');
    const {default:mobile}=await vite.ssrLoadModule('/api_handlers/admin/mobile.ts');
    const {default:candidates}=await vite.ssrLoadModule('/api_handlers/admin/candidates.ts');
    async function call(identity,body){
      const result={code:200,body:null,status(code){this.code=code;return this;},json(value){this.body=value;return this;}};
      await handler({method:'POST',headers:identity?{authorization:'Bearer '+identity.token}:{},body},result);return result;
    }
    const learner=await identity('unattached');
    await auth.setCustomUserClaims(learner.uid,{existingSafeClaim:'retained'});
    await t.test('unauthenticated callers cannot read or join',async()=>{
      const result=await call(null,{action:'joinInstitution',organizationId});assert.notEqual(result.code,200);
    });
    await t.test('directory exposes actual public metadata and excludes invitation-only institutions',async()=>{
      const result=await call(learner,{action:'publicDirectory',search:'Public Study Ministry'});
      assert.equal(result.code,200,JSON.stringify(result.body));
      assert.ok(result.body.items.some(item=>item.id===organizationId&&item.city==='Lusaka'));
      assert.ok(!result.body.items.some(item=>item.id===otherOrganizationId));
      assert.ok(!result.body.items.some(item=>item.id==='org-legacy-closed'),
        'Missing opt-in flag must never expose a legacy tenant for public joining');
    });
    await t.test('directory search scans beyond its first Firestore page',async()=>{
      const batch=db.batch();
      for(let i=0;i<110;i++){
        batch.set(db.doc('organizations/aaa-directory-'+String(i).padStart(3,'0')),{
          name:'Unrelated Directory '+i,status:'active',allowSelfEnrollment:true,
        });
      }
      batch.set(db.doc('organizations/zzzz-directory-late'),{
        name:'Late Search Ministry',status:'active',allowSelfEnrollment:true,city:'Kitwe',
      });
      await batch.commit();
      const result=await call(learner,{action:'publicDirectory',search:'Late Search Ministry',limit:1});
      assert.equal(result.code,200,JSON.stringify(result.body));
      assert.equal(result.body.items.length,1);
      assert.equal(result.body.items[0].id,'zzzz-directory-late');
      assert.equal(result.body.items[0].city,'Kitwe');
      assert.equal(result.body.hasMore,false);
    });
    await t.test('first-time join succeeds without existing membership and never grants staff access',async()=>{
      const result=await call(learner,{action:'joinInstitution',organizationId,role:'super_admin',organizationRole:'owner'});
      assert.equal(result.code,200,JSON.stringify(result.body));
      const profile=(await db.doc('users/'+learner.uid).get()).data();
      const member=(await db.doc('organizations/'+organizationId+'/members/'+learner.uid).get()).data();
      assert.equal(profile.role,'student');assert.equal(profile.organizationId,organizationId);
      assert.equal(profile.organizationRole,'learner');assert.equal(member.role,'learner');assert.equal(member.active,true);
      const claims=(await auth.getUser(learner.uid)).customClaims;
      assert.equal(claims.existingSafeClaim,'retained');assert.equal(claims.organizationRole,'learner');
    });
    await t.test('replaying a successful admission is idempotent',async()=>{
      const before=(await db.doc('organizations/'+organizationId+'/members/'+learner.uid).get()).data();
      const result=await call(learner,{action:'joinInstitution',organizationId});assert.equal(result.code,200,JSON.stringify(result.body));
      assert.equal((await db.doc('organizations/'+organizationId+'/members/'+learner.uid).get()).data().joinedAt,before.joinedAt);
    });
    await t.test('learners cannot silently transfer between institutions',async()=>{
      const result=await call(learner,{action:'joinInstitution',organizationId:otherOrganizationId});assert.notEqual(result.code,200);
      assert.equal((await db.doc('users/'+learner.uid).get()).data().organizationId,organizationId);
    });
    await t.test('invitation-only and suspended memberships cannot be bypassed',async()=>{
      const unattached=await identity('invitation-only');
      assert.notEqual((await call(unattached,{action:'joinInstitution',organizationId:otherOrganizationId})).code,200);
      assert.notEqual((await call(unattached,{action:'joinInstitution',organizationId:'org-legacy-closed'})).code,200);
      await db.doc('organizations/'+organizationId+'/members/'+unattached.uid).set({uid:unattached.uid,role:'learner',active:false});
      assert.notEqual((await call(unattached,{action:'joinInstitution',organizationId})).code,200);
    });
    await t.test('staff cannot overwrite their own role through learner admission',async()=>{
      const staff=await identity('staff',{organizationId,organizationRole:'admin'});
      await db.doc('organizations/'+organizationId+'/members/'+staff.uid).set({uid:staff.uid,role:'admin',active:true});
      assert.notEqual((await call(staff,{action:'joinInstitution',organizationId})).code,200);
      assert.equal((await db.doc('organizations/'+organizationId+'/members/'+staff.uid).get()).data().role,'admin');
    });
    await t.test('only Super Admin may designate a public ministry',async()=>{
      assert.notEqual((await call(learner,{action:'setPublicMinistry',organizationId,isPublicMinistry:false})).code,200);
      assert.equal((await db.doc('organizations/'+organizationId).get()).data().isPublicMinistry,true);
    });
    await t.test('Super Admin configures public admission and can later transfer the learner to a church',async()=>{
      const administrator=await identity('public-admin',{role:'super_admin'});
      const configured=await call(administrator,{action:'setPublicMinistry',organizationId:otherOrganizationId,isPublicMinistry:true});
      assert.equal(configured.code,200,JSON.stringify(configured.body));
      assert.equal((await db.doc('organizations/'+otherOrganizationId).get()).data().allowSelfEnrollment,true);
      const closed=await call(administrator,{action:'setPublicMinistry',
        organizationId:otherOrganizationId,isPublicMinistry:false});
      assert.equal(closed.code,200,JSON.stringify(closed.body));
      assert.equal((await db.doc('organizations/'+otherOrganizationId).get()).data().allowSelfEnrollment,false);
      const outsider=await identity('depublished-ministry');
      assert.notEqual((await call(outsider,{action:'joinInstitution',organizationId:otherOrganizationId})).code,200);
      const reopened=await call(administrator,{action:'setPublicMinistry',
        organizationId:otherOrganizationId,isPublicMinistry:true});
      assert.equal(reopened.code,200,JSON.stringify(reopened.body));
      const churchId='org-church-admission';
      await db.doc('organizations/'+churchId).set({name:'Local Church',status:'active',organizationType:'church',plan:'admission-plan'});
      const result={code:200,body:null,status(code){this.code=code;return this;},json(value){this.body=value;return this;}};
      await candidates({method:'POST',headers:{authorization:'Bearer '+administrator.token},body:{action:'updateCandidate',candidateId:learner.uid,organizationId:churchId,churchName:'Local Church'}},result);
      assert.equal(result.code,200,JSON.stringify(result.body));
      assert.equal((await db.doc('users/'+learner.uid).get()).data().organizationId,churchId);
      assert.equal((await db.doc('organizations/'+organizationId+'/members/'+learner.uid).get()).data().active,false);
      assert.equal((await db.doc('organizations/'+churchId+'/members/'+learner.uid).get()).data().role,'learner');
    });
    await t.test('learner workspace metadata contains no management forms or server secrets',async()=>{
      const result={code:200,body:null,status(code){this.code=code;return this;},json(value){this.body=value;return this;},setHeader(){}};
      await mobile({method:'GET',headers:{authorization:'Bearer '+learner.token},query:{resource:'workspace'}},result);
      assert.equal(result.code,200,JSON.stringify(result.body));assert.deepEqual(result.body.schemas,{});
      assert.doesNotMatch(JSON.stringify(result.body),/private_key|FIREBASE_ADMIN|RESEND_API_KEY/);
    });
  }finally{await vite.close();}
});
