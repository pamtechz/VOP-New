import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,getApps} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {createServer} from 'vite';

// The authenticated integration suite must never operate on real VOP data.
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST)
  throw new Error('Program integration suite requires both local Firebase emulators.');
if(process.env.FIREBASE_ADMIN_PROJECT_ID &&
   process.env.FIREBASE_ADMIN_PROJECT_ID!=='demo-vop-security-rules')
  throw new Error('Refusing to test against a production project.');
process.env.FIREBASE_ADMIN_PROJECT_ID='demo-vop-security-rules';
const app=getApps()[0]||initializeApp({projectId:'demo-vop-security-rules'});
const db=getFirestore(app);
const vite=await createServer({configFile:false,
  server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
after(async()=>vite.close());
const {default:content}=await vite.ssrLoadModule('/api_handlers/admin/content.ts');
const {default:candidates}=await vite.ssrLoadModule('/api_handlers/admin/candidates.ts');
const {default:quizzes}=await vite.ssrLoadModule('/api/quizzes.ts');

async function identity(name,orgId,role='owner'){
  const response=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+
    '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:name+'@vop-test.invalid',
        password:'local-emulator-only',returnSecureToken:true}),
    });
  const data=await response.json();
  assert.equal(response.status,200,JSON.stringify(data));
  await db.doc('users/'+data.localId).set({
    uid:data.localId,role:role==='super_admin'?'super_admin':'student',
    organizationId:role==='super_admin'?'':orgId,
    organizationRole:role==='super_admin'?'':role,
  });
  if(role!=='super_admin')await db.doc('organizations/'+orgId+'/members/'+data.localId)
    .set({uid:data.localId,role,organizationId:orgId,active:true});
  return {uid:data.localId,token:data.idToken};
}
async function hierarchyIdentity(name,role,nodeId){
  const response=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+
    '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:name+'@vop-test.invalid',
        password:'local-emulator-only',returnSecureToken:true}),
    });
  const data=await response.json();
  assert.equal(response.status,200,JSON.stringify(data));
  await db.doc('users/'+data.localId).set({
    uid:data.localId,role,adminNodeId:nodeId,
    adminNodeType:role.replace('_admin',''),organizationId:'',
  });
  return {uid:data.localId,token:data.idToken};
}
async function call(user,body){
  let status=200,value;
  await content({
    method:'POST',
    headers:{authorization:'Bearer '+user.token},
    body,
  },{
    status(code){status=code;return this;},
    json(result){value=result;return this;},
  });
  return {status,value};
}
async function candidateCall(user,body){
  let status=200,value;
  await candidates({
    method:'POST',
    headers:{authorization:'Bearer '+user.token},
    body,
  },{
    status(code){status=code;return this;},
    json(result){value=result;return this;},
  });
  return {status,value};
}
async function quizCall(user,body){
  let status=200,value;
  await quizzes({
    method:'POST',
    headers:{authorization:'Bearer '+user.token},
    body,
  },{
    status(code){status=code;return this;},
    json(result){value=result;return this;},
  });
  return {status,value};
}
const a='program-test-org-a',b='program-test-org-b';
await db.doc('organizations/'+a).set({id:a,status:'active'});
await db.doc('organizations/'+b).set({id:b,status:'active'});
const author=await identity('program-test-author',a);
const coAdmin=await identity('program-test-peer',a);
const coEditor=await identity('program-test-editor',a,'editor');
const learner=await identity('program-test-learner',a,'learner');
const outsider=await identity('program-test-outside',b);
const outsideLearner=await identity('program-test-outside-learner',b,'learner');
const superAdmin=await identity('program-test-platform','','super_admin');
const guideA='program-test-guide-a',guideB='program-test-guide-b';
for(const [id,org,uid] of [[guideA,a,author.uid],[guideB,b,outsider.uid]]){
  await db.doc('guides/'+id).set({
    id,organizationId:org,ownerOrganizationId:org,ownerUid:uid,
    language:'en',title:'Guide for '+org,published:true,
    archived:false,sharingScope:'organization',canonical:true,
  });
}
await test('Super Admin curriculum saves survive stale hierarchy metadata and selected organization drift',async()=>{
  const superProfile=db.doc('users/'+superAdmin.uid);
  await superProfile.update({adminNodeId:'historic-no-longer-linked-union',adminNodeType:'union'});
  const lessonId='program-test-super-admin-cross-scope';
  const ref=db.doc('guides/'+guideA+'/lessons/'+lessonId);
  try {
    // The editor can retain the previous organisation while switching guides.
    // Super Admin must not silently transfer guide A lessons into B.
    const payload={guideId:guideA,lessonId,language:'en',title:'Cross-scope study',
      lessonNumber:'82',type:'Lesson',published:false,sharingScope:'organization'};
    const saved=await call(superAdmin,{collection:'curriculum',action:'upsertLesson',
      id:lessonId,organizationId:b,data:payload});
    assert.equal(saved.status,200,JSON.stringify(saved.value));
    assert.equal((await ref.get()).data()?.organizationId,a);
    assert.equal((await ref.get()).data()?.ownerOrganizationId,a);

    const published=await call(superAdmin,{collection:'curriculum',action:'publishLesson',
      id:lessonId,organizationId:b,data:payload});
    assert.equal(published.status,200,JSON.stringify(published.value));
    assert.equal((await ref.get()).data()?.organizationId,a);
    assert.equal((await ref.get()).data()?.published,true);

    const edited=await call(superAdmin,{collection:'curriculum',action:'upsertLesson',
      id:lessonId,organizationId:b,data:{...payload,title:'Updated across organizations',published:true}});
    assert.equal(edited.status,200,JSON.stringify(edited.value));
    assert.equal((await ref.get()).data()?.title,'Updated across organizations');
    assert.equal((await ref.get()).data()?.organizationId,a);

    const invalid=await call(superAdmin,{collection:'curriculum',action:'upsertLesson',
      id:'program-test-invalid-lesson',organizationId:a,
      data:{guideId:guideA,lessonId:'program-test-invalid-lesson',language:''}});
    assert.equal(invalid.status,400,'missing language is validation, not forbidden');
    assert.equal(invalid.value.code,'INVALID_REQUEST');

    const rejected=await call(outsider,{collection:'curriculum',action:'upsertLesson',
      id:'program-test-forbidden-lesson',organizationId:b,
      data:{...payload,lessonId:'program-test-forbidden-lesson'}});
    assert.notEqual(rejected.status,200,'B owner cannot edit A guide');
  }finally{
    await superProfile.update({adminNodeId:'',adminNodeType:''});
  }
});

await test('platform curriculum taxonomy is editable only by the Super Admin',async()=>{
  for(const collection of ['learningPaths','bibleTopics','seasons']){
    const id='program-test-global-'+collection;
    const published=await call(superAdmin,{
      collection,action:'upsert',id,
      data:{title:'Platform '+collection,published:true},
    });
    assert.equal(published.status,200,JSON.stringify(published.value));
    const ref=db.doc(collection+'/'+id);
    assert.equal((await ref.get()).data()?.organizationId,'');
    assert.equal((await ref.get()).data()?.scope,'platform');
    assert.equal((await ref.get()).data()?.sharingScope,'shared');

    const updated=await call(superAdmin,{
      collection,action:'upsert',id,organizationId:b,
      data:{title:'Updated global '+collection,published:true},
    });
    assert.equal(updated.status,200,JSON.stringify(updated.value));
    assert.equal((await ref.get()).data()?.organizationId,'');
    assert.equal((await ref.get()).data()?.title,'Updated global '+collection);

    const denied=await call(outsider,{
      collection,action:'upsert',id,organizationId:b,
      data:{title:'Unauthorized update',published:true},
    });
    assert.notEqual(denied.status,200);
    assert.equal((await ref.get()).data()?.title,'Updated global '+collection);
  }
  const certificate=await call(superAdmin,{
    collection:'certificates',action:'upsert',id:'program-test-no-platform-certificate',
    data:{title:'Not an issuance'},
  });
  assert.notEqual(certificate.status,200);
});

const base={title:'Foundations of Faith',description:'A guided study',
  coverImageUrl:'',entryMode:'sections',guideIds:[guideA],
  sharingScope:'organization',published:true,archived:false};
let programId='';
let sharedReferenceProgram='';
await test('unpublished platform guides cannot leak lesson metadata to foreign tenants',async()=>{
  const guideId='program-test-unpublished-platform-guide';
  const guide=db.doc('guides/'+guideId);
  await guide.set({
    id:guideId,title:'Unpublished platform draft',language:'en',
    organizationId:'',scope:'platform',sharingScope:'shared',
    published:false,archived:false,canonical:true,ownerUid:superAdmin.uid,
  });
  await guide.collection('lessons').doc('unexpected').set({
    id:'unexpected',title:'Unreleased outline',
    published:true,archived:false,sharingScope:'shared',type:'Lesson',
  });
  const denied=await call(outsider,{
    collection:'curriculum',action:'listGuideLessons',guideId,organizationId:b,
  });
  assert.notEqual(denied.status,200);
  const owner=await call(superAdmin,{
    collection:'curriculum',action:'listGuideLessons',guideId,
  });
  assert.equal(owner.status,200,JSON.stringify(owner.value));
  assert.ok(owner.value.items.some(item=>item.id==='unexpected'));
});

await test('one published canonical guide can be reused across tenants without copying content',async()=>{
  const sharedGuide='program-test-cross-tenant-guide';
  const source=db.doc('guides/'+sharedGuide);
  await source.set({
    id:sharedGuide,title:'Shared Bible studies',language:'en',
    organizationId:a,ownerOrganizationId:a,ownerUid:author.uid,
    sharingScope:'shared',published:true,archived:false,canonical:true,
  });
  const response=await call(outsider,{collection:'programs',action:'upsert',
    organizationId:b,data:{
      ...base,title:'Org B curated studies',guideIds:[sharedGuide],
      sharingScope:'organization',published:true,
    }});
  assert.equal(response.status,200,JSON.stringify(response.value));
  sharedReferenceProgram=response.value.item.id;
  const ref=db.doc('programs/'+sharedReferenceProgram);
  assert.deepEqual((await ref.get()).data()?.guideIds,[sharedGuide]);
  const original=(await source.get()).data();
  assert.equal(original?.organizationId,a);
  await source.collection('lessons').doc('public').set({
    id:'public',title:'Published lesson',published:true,
    archived:false,sharingScope:'shared',type:'Lesson',language:'en',
  });
  await source.collection('lessons').doc('draft').set({
    id:'draft',title:'Private unfinished lesson',published:false,
    archived:false,sharingScope:'shared',type:'Lesson',language:'en',
  });
  const view=await call(outsider,{
    collection:'curriculum',action:'listGuideLessons',guideId:sharedGuide,organizationId:b,
  });
  assert.equal(view.status,200,JSON.stringify(view.value));
  assert.ok(view.value.items.some(item=>item.id==='public'));
  assert.ok(!view.value.items.some(item=>item.id==='draft'),
    'tenant B cannot enumerate unpublished content from tenant A');
  const authorView=await call(author,{
    collection:'curriculum',action:'listGuideLessons',guideId:sharedGuide,organizationId:a,
  });
  assert.equal(authorView.status,200,JSON.stringify(authorView.value));
  assert.ok(authorView.value.items.some(item=>item.id==='draft'));

  // Attaching a second shared guide must change only associations, not
  // publication/owner metadata or the canonical guide itself.
  const secondGuide='program-test-cross-tenant-shared-two';
  await db.doc('guides/'+secondGuide).set({
    id:secondGuide,title:'Prophecy studies',language:'en',
    organizationId:a,ownerOrganizationId:a,ownerUid:author.uid,
    sharingScope:'shared',published:true,archived:false,canonical:true,
  });
  const append=async(guideId,user=outsider)=>call(user,{
    collection:'programs',action:'attachGuide',organizationId:b,
    data:{programId:sharedReferenceProgram,guideId},
  });
  const linked=await append(secondGuide);
  assert.equal(linked.status,200,JSON.stringify(linked.value));
  const repeat=await append(secondGuide);
  assert.equal(repeat.status,200,JSON.stringify(repeat.value));
  assert.equal(repeat.value.alreadyLinked,true);
  const record=(await ref.get()).data();
  assert.deepEqual(record.guideIds,[sharedGuide,secondGuide]);
  assert.equal(record.title,'Org B curated studies');
  assert.equal(record.organizationId,b);
  assert.equal(record.published,true);
  assert.equal(record.sharingScope,'organization');
  assert.equal((await source.get()).data()?.organizationId,a);

  const privateDenied=await append(guideA);
  assert.notEqual(privateDenied.status,200);
  assert.deepEqual((await ref.get()).data()?.guideIds,[sharedGuide,secondGuide]);
  const foreignEditor=await append(secondGuide,author);
  assert.notEqual(foreignEditor.status,200);

  const listed=await call(outsideLearner,{collection:'programs',action:'learnerList'});
  assert.equal(listed.status,200,JSON.stringify(listed.value));
  assert.ok(listed.value.items.some(item=>item.id===sharedReferenceProgram));
});

await test('program ownership, tenant scope, and read permissions',async t=>{
  await t.test('contributor creates a published program from owned published guides',async()=>{
    const response=await call(author,{collection:'programs',action:'upsert',data:base,organizationId:a});
    assert.equal(response.status,200,JSON.stringify(response.value));
    programId=response.value.item.id;
    assert.ok(programId.startsWith('program-'));
    assert.equal((await db.doc('programs/'+programId).get()).data()?.entryMode,'sections');
    assert.deepEqual((await db.doc('programs/'+programId).get()).data()?.guideIds,[guideA]);
  });
  await t.test('ordinary learners receive only their published organization catalogue without curriculum-admin permission',async()=>{
    const own=await call(learner,{collection:'programs',action:'learnerList'});
    assert.equal(own.status,200,JSON.stringify(own.value));
    const row=own.value.items.find(item=>item.id===programId);
    assert.ok(row,'organization learner should receive the published organization program');
    assert.equal(row.title,base.title);
    assert.equal(row.canEdit,undefined);
    assert.equal(row.ownerUid,undefined);
    const outside=await call(outsideLearner,{collection:'programs',action:'learnerList'});
    assert.equal(outside.status,200,JSON.stringify(outside.value));
    assert.equal(outside.value.items.some(item=>item.id===programId),false);
  });
  await t.test('another organization cannot claim a foreign guide',async()=>{
    const bad=await call(outsider,{collection:'programs',action:'upsert',data:{
      ...base,guideIds:[guideA],
    },organizationId:b});
    assert.notEqual(bad.status,200);
    assert.match(String(bad.value.error),/another organization|missing|belongs|shared guides/);
  });
  await t.test('owning co-admin updates the canonical program while nonauthor editors and foreign admins cannot',async()=>{
    const before=(await db.collection('programs').get()).size;
    const saved=await call(coAdmin,{collection:'programs',action:'upsert',
      id:programId,organizationId:a,data:{...base,title:'Organization update'}});
    assert.equal(saved.status,200,JSON.stringify(saved.value));
    const record=(await db.doc('programs/'+programId).get()).data();
    assert.equal(record.title,'Organization update');
    assert.equal(record.ownerUid,author.uid,'editing does not transfer authorship');
    assert.equal(record.ownerOrganizationId,a);
    assert.equal((await db.collection('programs').get()).size,before,'editing does not clone the program');
    for(const actor of [coEditor,outsider]){
      const denied=await call(actor,{collection:'programs',action:'upsert',
        id:programId,organizationId:actor===outsider?b:a,data:{...base,title:'Unauthorized update'}});
      assert.notEqual(denied.status,200);
      assert.equal((await db.doc('programs/'+programId).get()).data()?.title,'Organization update');
    }
    const restored=await call(author,{collection:'programs',action:'upsert',id:programId,organizationId:a,data:base});
    assert.equal(restored.status,200);
  });
  await t.test('cross-tenant private programs are invisible to other org admins',async()=>{
    const outside=await call(outsider,{collection:'programs',action:'list',organizationId:b});
    assert.equal(outside.status,200);
    assert.equal(outside.value.items.some(item=>item.id===programId),false);
    const inside=await call(author,{collection:'programs',action:'list',organizationId:a});
    assert.equal(inside.status,200);
    assert.equal(inside.value.items.find(item=>item.id===programId).canEdit,true);
    const peer=await call(coAdmin,{collection:'programs',action:'list',organizationId:a});
    assert.equal(peer.status,200);
    assert.equal(peer.value.items.find(item=>item.id===programId).canEdit,true);
    const editor=await call(coEditor,{collection:'programs',action:'list',organizationId:a});
    assert.equal(editor.status,200);
    assert.equal(editor.value.items.find(item=>item.id===programId).canEdit,false);
  });
  await t.test('a tenant cannot unilaterally make a program system-wide',async()=>{
    const attempt=await call(author,{collection:'programs',action:'upsert',
      id:programId,organizationId:a,data:{...base,sharingScope:'shared'}});
    assert.notEqual(attempt.status,200);
    assert.equal((await db.doc('programs/'+programId).get()).data()?.sharingScope,'organization');
  });
  await t.test('program publication rejects draft guides and foreign guides',async()=>{
    await db.doc('guides/'+guideA).update({published:false});
    const draft=await call(author,{collection:'programs',action:'upsert',
      id:programId,organizationId:a,data:base});
    assert.notEqual(draft.status,200);
    await db.doc('guides/'+guideA).update({published:true});
    const foreign=await call(superAdmin,{collection:'programs',action:'upsert',
      id:programId,organizationId:a,data:{...base,guideIds:[guideB]}});
    assert.notEqual(foreign.status,200);
  });
  await t.test('super admin may review and approve a shared program only with shared guides',async()=>{
    const forbidden=await call(superAdmin,{collection:'programs',action:'upsert',
      id:programId,organizationId:a,data:{...base,sharingScope:'shared'}});
    assert.notEqual(forbidden.status,200);
    await db.doc('guides/'+guideA).update({sharingScope:'shared'});
    const approved=await call(superAdmin,{collection:'programs',action:'upsert',
      id:programId,organizationId:a,data:{...base,sharingScope:'shared'}});
    assert.equal(approved.status,200,JSON.stringify(approved.value));
    assert.equal((await db.doc('guides/'+guideA).get()).data()?.adoptedByPlatform,true,
      'approving a shared program must atomically adopt its referenced guides');
    const outside=await call(outsider,{collection:'programs',action:'list',organizationId:b});
    assert.equal(outside.value.items.find(item=>item.id===programId).canEdit,false);
    const learnerCatalogue=await call(outsideLearner,{collection:'programs',action:'learnerList'});
    assert.equal(learnerCatalogue.status,200,JSON.stringify(learnerCatalogue.value));
    assert.equal(learnerCatalogue.value.items.find(item=>item.id===programId).entryMode,'sections');

    assert.equal(outside.value.items.find(item=>item.id===programId).entryMode,'sections');
    const contributor=await call(author,{collection:'programs',action:'upsert',
      id:programId,organizationId:a,data:base});
    assert.notEqual(contributor.status,200,'platform adoption revokes contributor mutation');
    const lessonAttempt=await call(author,{collection:'curriculum',action:'upsertLesson',
      id:'attempt-adopted-lesson',organizationId:a,data:{
        guideId:guideA,lessonId:'attempt-adopted-lesson',language:'en',
        title:'Unauthorized change',lessonNumber:'99',type:'Lesson',
      }});
    assert.notEqual(lessonAttempt.status,200,'adopted guides must also block lesson edits');
  });
  await t.test('platform adoption stays permanent after archive and restoration',async()=>{
    const archived=await call(superAdmin,{collection:'programs',action:'delete',
      id:programId,organizationId:a});
    assert.equal(archived.status,200,JSON.stringify(archived.value));
    const record=await db.doc('programs/'+programId).get();
    assert.equal(record.data()?.archived,true);
    assert.equal(record.data()?.published,false);
    assert.equal(record.data()?.adoptedByPlatform,true);
    assert.equal((await db.doc('guides/'+guideA).get()).data()?.adoptedByPlatform,true,
      'archiving a shared program must not return its guides to tenant control');
    const foreign=await call(outsider,{collection:'programs',action:'list',organizationId:b});
    assert.equal(foreign.value.items.some(item=>item.id===programId),false);
    const ownList=await call(author,{collection:'programs',action:'list',organizationId:a});
    assert.equal(ownList.value.items.find(item=>item.id===programId).canEdit,false);
    const rejected=await call(author,{collection:'programs',action:'upsert',organizationId:a,
      id:programId,data:{...base,published:false,archived:false}});
    assert.notEqual(rejected.status,200);
    const restored=await call(superAdmin,{collection:'programs',action:'upsert',
      id:programId,organizationId:a,
      data:{...base,published:false,archived:false,sharingScope:'shared'}});
    assert.equal(restored.status,200,JSON.stringify(restored.value));
    assert.equal((await db.doc('programs/'+programId).get()).data()?.adoptedByPlatform,true);
  });
});

await test('hierarchy-owned resources use the hierarchy tenant subscription instead of descendant organization limits',async()=>{
  const unionId='program-test-union-metering';
  const orgId='program-test-org-metering';
  const guideId='program-test-guide-metering';
  const ownerTenantId='union_admin:'+unionId;
  await db.doc('unions/'+unionId).set({
    id:unionId,name:'Metering Union',status:'active',
    plan:'metered-union-plan',
    featureEntitlements:{curriculum:false},
    quotas:{maxPrograms:1,maxGuides:1,maxQuizzes:1},
  });
  // The descendant organization is deliberately permissive. It must not be
  // charged for resources owned and authored by the Union tenant.
  await db.doc('organizations/'+orgId).set({
    id:orgId,name:'Metered Organization',status:'active',unionId,
    plan:'permissive-org-plan',
    featureEntitlements:{curriculum:true},
    quotas:{maxPrograms:99,maxGuides:99,maxQuizzes:99},
  });
  const unionAdmin=await hierarchyIdentity('program-test-union-admin','union_admin',unionId);
  await db.doc('guides/'+guideId).set({
    id:guideId,organizationId:orgId,ownerOrganizationId:orgId,ownerUid:unionAdmin.uid,
    ownerTenantId,language:'en',title:'Metered Guide',published:true,archived:false,
    sharingScope:'organization',canonical:true,
  });
  const draft={
    title:'Metered Program',description:'Hierarchy-managed curriculum',
    coverImageUrl:'',entryMode:'lessons',guideIds:[guideId],
    sharingScope:'organization',published:true,archived:false,
  };

  const excluded=await call(unionAdmin,{
    collection:'programs',action:'upsert',organizationId:orgId,data:draft,
  });
  assert.notEqual(excluded.status,200,'Union plan exclusion must block Union-owned programme writes');
  assert.match(String(excluded.value?.error||''),/subscription plan does not include|Curriculum Studio/i);

  const excludedQuiz=await quizCall(unionAdmin,{
    action:'upsert',organizationId:orgId,data:{
      attachmentType:'guide',guideId,language:'en',title:'Excluded hierarchy assessment',
      published:true,sharingScope:'organization',
      questions:[{question:'Ready?',options:['No','Yes'],correctOptionIndex:1}],
    },
  });
  assert.notEqual(excludedQuiz.status,200,'Union plan exclusion must block Union-owned quiz writes');
  assert.match(String(excludedQuiz.value?.error||''),/subscription plan does not include|Curriculum Studio/i);

  await db.doc('unions/'+unionId).update({featureEntitlements:{curriculum:true}});

  const guideOverLimit=await call(unionAdmin,{
    collection:'guides',action:'upsertGuide',organizationId:orgId,
    data:{title:'Second Guide',language:'en',published:false,archived:false},
  });
  assert.notEqual(guideOverLimit.status,200,'Union-owned guide must consume Union maxGuides');
  assert.match(String(guideOverLimit.value?.error||''),/maxGuides|limit|usage/i);

  await db.doc('guides/'+guideId).update({archived:true,published:false});
  const secondGuide=await call(unionAdmin,{
    collection:'guides',action:'upsertGuide',organizationId:orgId,
    data:{title:'Second Guide',language:'en',published:false,archived:false},
  });
  assert.equal(secondGuide.status,200,JSON.stringify(secondGuide.value));
  assert.equal(secondGuide.value.item.organizationId,orgId);
  assert.equal((await db.doc('guides/'+secondGuide.value.item.id).get()).data()?.ownerTenantId,ownerTenantId);

  await db.doc('unions/'+unionId).update({quotas:{maxPrograms:1,maxGuides:2,maxQuizzes:1}});
  await db.doc('guides/'+guideId).update({archived:false,published:true});

  const quizPayload={
    attachmentType:'guide',guideId,language:'en',title:'Hierarchy assessment',
    published:true,sharingScope:'organization',
    questions:[{question:'Ready?',options:['No','Yes'],correctOptionIndex:1}],
  };
  const firstQuiz=await quizCall(unionAdmin,{action:'upsert',organizationId:orgId,data:quizPayload});
  assert.equal(firstQuiz.status,200,JSON.stringify(firstQuiz.value));
  assert.equal(firstQuiz.value.item.organizationId,orgId);
  assert.equal((await db.doc('quizzes/'+firstQuiz.value.item.id).get()).data()?.ownerTenantId,ownerTenantId);

  const secondQuiz=await quizCall(unionAdmin,{
    action:'upsert',organizationId:orgId,data:{...quizPayload,title:'Second hierarchy assessment'},
  });
  assert.notEqual(secondQuiz.status,200,'Union-owned quiz must consume Union maxQuizzes');
  assert.match(String(secondQuiz.value?.error||''),/maxQuizzes|limit|usage/i);

  await db.doc('quizzes/'+firstQuiz.value.item.id).update({archived:true,published:false});
  const replacementQuiz=await quizCall(unionAdmin,{
    action:'upsert',organizationId:orgId,data:{...quizPayload,title:'Replacement hierarchy assessment'},
  });
  assert.equal(replacementQuiz.status,200,JSON.stringify(replacementQuiz.value));

  const first=await call(unionAdmin,{
    collection:'programs',action:'upsert',organizationId:orgId,data:draft,
  });
  assert.equal(first.status,200,JSON.stringify(first.value));
  assert.equal((await db.doc('programs/'+first.value.item.id).get()).data()?.ownerTenantId,ownerTenantId);

  const overLimit=await call(unionAdmin,{
    collection:'programs',action:'upsert',organizationId:orgId,
    data:{...draft,title:'Second metered program'},
  });
  assert.notEqual(overLimit.status,200,'Union-owned programme must consume Union maxPrograms');
  assert.match(String(overLimit.value?.error||''),/maxPrograms|limit|usage/i);

  const archived=await call(unionAdmin,{
    collection:'programs',action:'delete',organizationId:orgId,id:first.value.item.id,
  });
  assert.equal(archived.status,200,JSON.stringify(archived.value));
  const replacementProgram=await call(unionAdmin,{
    collection:'programs',action:'upsert',organizationId:orgId,
    data:{...draft,title:'Replacement metered program'},
  });
  assert.equal(replacementProgram.status,200,JSON.stringify(replacementProgram.value));
});

await test('platform-published curriculum is inherited system-wide by organizations',async()=>{
  const platformGuide='program-test-platform-guide';
  const platformLesson='program-test-platform-lesson';
  const guide=await call(superAdmin,{collection:'guides',action:'upsertGuide',data:{
    id:platformGuide,title:'Platform Bible Course',subtitle:'System-wide',
    description:'Published by VOP for every organization',language:'en',
    discoverNumber:77,published:true,archived:false,sharingScope:'private',
    certificateEligible:true,requiresFinalExam:true,
  }});
  assert.equal(guide.status,200,JSON.stringify(guide.value));
  assert.equal((await db.doc('guides/'+platformGuide).get()).data()?.organizationId,'');
  assert.equal((await db.doc('guides/'+platformGuide).get()).data()?.scope,'platform');
  assert.equal((await db.doc('guides/'+platformGuide).get()).data()?.sharingScope,'shared');

  const lesson=await call(superAdmin,{collection:'curriculum',action:'upsertLesson',
    id:platformLesson,data:{
      guideId:platformGuide,lessonId:platformLesson,language:'en',
      title:'Platform lesson',lessonNumber:'1',type:'Lesson',
      published:true,archived:false,sharingScope:'organization',
      chapters:[{id:'chapter-one',title:'Chapter one',sections:[{id:'section-one',title:'Section one',blocks:[{id:'block-one',type:'paragraph',text:'Shared platform study.'}]}]}],
    }});
  assert.equal(lesson.status,200,JSON.stringify(lesson.value));
  assert.equal((await db.doc('guides/'+platformGuide+'/lessons/'+platformLesson).get()).data()?.sharingScope,'shared');

  const program=await call(superAdmin,{collection:'programs',action:'upsert',data:{
    title:'Platform VOP Program',description:'Available to every organization',
    coverImageUrl:'',entryMode:'lessons',guideIds:[platformGuide],
    sharingScope:'private',published:true,archived:false,
  }});
  assert.equal(program.status,200,JSON.stringify(program.value));
  assert.equal((await db.doc('programs/'+program.value.item.id).get()).data()?.sharingScope,'shared');

  const orgCatalogue=await call(outsideLearner,{collection:'programs',action:'learnerList'});
  assert.equal(orgCatalogue.status,200,JSON.stringify(orgCatalogue.value));
  assert.ok(orgCatalogue.value.items.some(item=>item.id===program.value.item.id),
    'organization learner should see the platform program');

  const orgGuides=await call(outsider,{collection:'guides',action:'listGuides',organizationId:b});
  assert.equal(orgGuides.status,200,JSON.stringify(orgGuides.value));
  const visibleGuide=orgGuides.value.items.find(item=>item.id===platformGuide);
  assert.ok(visibleGuide,'organization course selector should include system-wide guide');
  assert.equal(visibleGuide.published,true);
  assert.equal(visibleGuide.canEdit,false);

  const enrollment=await candidateCall(outsider,{
    action:'enroll',organizationId:b,guideId:platformGuide,
    displayName:'Platform Course Candidate',
    email:'platform-course-candidate@vop-test.invalid',
    password:'local-emulator-only',
  });
  assert.equal(enrollment.status,200,JSON.stringify(enrollment.value));
  assert.equal(enrollment.value.candidate.organizationId,b);
  assert.equal(enrollment.value.candidate.guideId,platformGuide);
  const enrollmentId=b+'_'+enrollment.value.candidate.uid+'_'+platformGuide;
  assert.equal((await db.doc('courseEnrollments/'+enrollmentId).get()).data()?.status,'active');
});

await test('lesson Save publishes once, preserves its ID and never forks on repeat',async()=>{
  const id='program-test-one-step-published-lesson';
  const ownedGuide='program-test-one-step-owned-guide';
  // Other tests adopt guideA into platform stewardship. An organization
  // correctly cannot edit that shared canonical resource after adoption.
  await db.doc('guides/'+ownedGuide).set({
    id:ownedGuide,organizationId:a,ownerOrganizationId:a,
    ownerUid:author.uid,language:'en',title:'Editable source guide',
    published:true,archived:false,sharingScope:'organization',canonical:true,
  });
  const document=db.doc('guides/'+ownedGuide+'/lessons/'+id);
  const payload={lessonId:id,guideId:ownedGuide,language:'en',
    title:'One published canonical lesson',lessonNumber:'49',
    type:'Lesson',published:true,sharingScope:'organization'};
  const first=await call(author,{collection:'curriculum',action:'upsertLesson',
    id,organizationId:a,data:payload});
  assert.equal(first.status,200,JSON.stringify(first.value));
  const before=(await document.get()).data();
  assert.equal(before?.published,true);
  assert.ok(before?.publishedAt,'one-step publication must record its timestamp');
  const second=await call(author,{collection:'curriculum',action:'upsertLesson',
    id,organizationId:a,data:{...payload,title:'Revised same lesson'}});
  assert.equal(second.status,200,JSON.stringify(second.value));
  const after=(await document.get()).data();
  assert.equal(after?.title,'Revised same lesson');
  assert.equal(after?.id,id);
  assert.equal(after?.createdAt,before?.createdAt);
  const lessons=await db.collection('guides/'+ownedGuide+'/lessons').get();
  assert.equal(lessons.docs.filter(doc=>doc.id===id).length,1);
});

const notesGuide='program-test-notes-guide';
await db.doc('guides/'+notesGuide).set({
  id:notesGuide,organizationId:a,ownerOrganizationId:a,ownerUid:author.uid,
  language:'en',title:'Private notes guide',published:true,
  archived:false,sharingScope:'organization',canonical:true,
});
await test('stale curriculum edits cannot recreate deleted originals or move lessons',async t=>{
  await t.test('a deleted programme stays deleted after an editor retry',async()=>{
    const id='program-test-deleted-program';
    const result=await call(author,{collection:'programs',action:'upsert',id,
      organizationId:a,data:{expectedExisting:true,title:'Stale programme'}});
    assert.notEqual(result.status,200);
    assert.match(result.value.error,/removed|Reload/);
    assert.equal((await db.doc('programs/'+id).get()).exists,false);
  });
  await t.test('a deleted guide stays deleted after an editor retry',async()=>{
    const id='program-test-deleted-guide';
    const result=await call(author,{collection:'guides',action:'upsertGuide',id,
      organizationId:a,data:{expectedExisting:true,language:'en',title:'Stale guide'}});
    assert.notEqual(result.status,200);
    assert.match(result.value.error,/no longer exists/);
    assert.equal((await db.doc('guides/'+id).get()).exists,false);
  });
  await t.test('a deleted lesson stays deleted and cannot acquire new private notes',async()=>{
    const id='program-test-deleted-lesson';
    const ref=db.doc('guides/'+notesGuide+'/lessons/'+id);
    const result=await call(author,{collection:'curriculum',action:'upsertLesson',id,
      organizationId:a,data:{expectedExisting:true,originalGuideId:notesGuide,
        guideId:notesGuide,language:'en',title:'Stale lesson',teacherNotes:'Stale notes'}});
    assert.notEqual(result.status,200);
    assert.match(result.value.error,/original lesson is missing/);
    assert.equal((await ref.get()).exists,false);
    assert.equal((await ref.collection('private').doc('instructorNotes').get()).exists,false);
  });
  await t.test('changing the guide field cannot create a copy under another guide',async()=>{
    const id='program-test-moved-lesson';
    const result=await call(author,{collection:'curriculum',action:'upsertLesson',id,
      organizationId:a,data:{originalGuideId:guideA,guideId:notesGuide,
        language:'en',title:'Moved lesson'}});
    assert.notEqual(result.status,200);
    assert.match(result.value.error,/Moving a lesson by editing is not allowed/);
    assert.equal((await db.doc('guides/'+notesGuide+'/lessons/'+id).get()).exists,false);
  });
  await t.test('deletion after authorization aborts the entire lesson and private-note batch',async()=>{
    const id='program-test-delete-during-save';
    const ref=db.doc('guides/'+notesGuide+'/lessons/'+id);
    await ref.set({id,lessonId:id,title:'Original',organizationId:a,
      ownerOrganizationId:a,ownerTenantId:a,ownerUid:author.uid});
    const originalBatch=db.batch;
    db.batch=function(){
      const batch=originalBatch.call(this);
      const commit=batch.commit.bind(batch);
      batch.commit=async()=>{await ref.delete();return commit();};
      return batch;
    };
    try{
      const result=await call(author,{collection:'curriculum',action:'upsertLesson',id,
        organizationId:a,data:{expectedExisting:true,originalGuideId:notesGuide,
          guideId:notesGuide,language:'en',title:'Stale replacement',teacherNotes:'Private text'}});
      assert.notEqual(result.status,200);
      assert.equal((await ref.get()).exists,false);
      assert.equal((await ref.collection('private').doc('instructorNotes').get()).exists,false);
    }finally{db.batch=originalBatch;}
  });
});
await test('teacher notes are private and transferred atomically from legacy lessons',async t=>{
  const lessonId='program-test-study-lesson';
  const privatePath='guides/'+notesGuide+'/lessons/'+lessonId+'/private/instructorNotes';
  const notes='Instructor-only assessment instructions. NEVER SHOW TO LEARNERS.';
  const payload={guideId:notesGuide,lessonId,language:'en',
    title:'Study the Sabbath',lessonNumber:'1',
    type:'Lesson',published:false,teacherNotes:notes,
    sharingScope:'organization'};
  await t.test('new lesson stores notes only in a denied private subdocument',async()=>{
    const saved=await call(author,{collection:'curriculum',action:'upsertLesson',
      id:lessonId,organizationId:a,data:payload});
    assert.equal(saved.status,200,JSON.stringify(saved.value));
    assert.equal((await db.doc('guides/'+notesGuide+'/lessons/'+lessonId).get())
      .data()?.teacherNotes,undefined);
    assert.equal((await db.doc(privatePath).get()).data()?.text,notes);
  });
  await t.test('author and owning admin receive instructor notes, nonauthor editor receives metadata and outsider nothing',async()=>{
    const own=await call(author,{collection:'curriculum',action:'listGuideLessons',id:notesGuide,
      organizationId:a});
    assert.equal(own.status,200,JSON.stringify(own.value));
    assert.equal(own.value.items.find(item=>item.id===lessonId).teacherNotes,notes);
    const admin=await call(coAdmin,{collection:'curriculum',action:'listGuideLessons',id:notesGuide,
      organizationId:a});
    assert.equal(admin.status,200,JSON.stringify(admin.value));
    assert.equal(admin.value.items.find(item=>item.id===lessonId).teacherNotes,notes);
    const peer=await call(coEditor,{collection:'curriculum',action:'listGuideLessons',id:notesGuide,
      organizationId:a});
    assert.equal(peer.status,200,JSON.stringify(peer.value));
    assert.equal(peer.value.items.find(item=>item.id===lessonId).teacherNotes,undefined);
    const foreign=await call(outsider,{collection:'curriculum',action:'listGuideLessons',
      id:notesGuide,organizationId:b});
    assert.notEqual(foreign.status,200);
  });
  await t.test('editing legacy notes extracts them and deletes the public field',async()=>{
    const legacy='program-test-legacy-study';
    const ref=db.doc('guides/'+notesGuide+'/lessons/'+legacy);
    await ref.set({
      ...payload,id:legacy,lessonId:legacy,teacherNotes:'Historical private text',
      ownerUid:author.uid,ownerOrganizationId:a,organizationId:a,
    });
    const updated=await call(author,{collection:'curriculum',action:'upsertLesson',
      id:legacy,organizationId:a,data:{
        ...payload,lessonId:legacy,title:'Safe update',
        teacherNotes:'Updated instructor note',
      }});
    assert.equal(updated.status,200,JSON.stringify(updated.value));
    assert.equal((await ref.get()).data()?.teacherNotes,undefined);
    assert.equal((await ref.collection('private').doc('instructorNotes').get()).data()?.text,
      'Updated instructor note');
  });
});
