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
const a='program-test-org-a',b='program-test-org-b';
await db.doc('organizations/'+a).set({id:a,status:'active'});
await db.doc('organizations/'+b).set({id:b,status:'active'});
const author=await identity('program-test-author',a);
const coAdmin=await identity('program-test-peer',a);
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
const base={title:'Foundations of Faith',description:'A guided study',
  coverImageUrl:'',entryMode:'sections',guideIds:[guideA],
  sharingScope:'organization',published:true,archived:false};
let programId='';
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
    assert.match(String(bad.value.error),/another organization|missing|belongs/);
  });
  await t.test('co-admin cannot edit the other author program',async()=>{
    const bad=await call(coAdmin,{collection:'programs',action:'upsert',
      id:programId,organizationId:a,data:{...base,title:'Account takeover'}});
    assert.notEqual(bad.status,200);
    assert.equal((await db.doc('programs/'+programId).get()).data()?.title,base.title);
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
    assert.equal(peer.value.items.find(item=>item.id===programId).canEdit,false);
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

await test('hierarchy administrators cannot bypass descendant subscription entitlements or quotas',async()=>{
  const unionId='program-test-union-metering';
  const orgId='program-test-org-metering';
  const guideId='program-test-guide-metering';
  await db.doc('unions/'+unionId).set({id:unionId,name:'Metering Union'});
  await db.doc('organizations/'+orgId).set({
    id:orgId,name:'Metered Organization',status:'active',unionId,
    plan:'metered-plan',
    featureEntitlements:{curriculum:false},
    quotas:{maxPrograms:1},
  });
  const unionAdmin=await hierarchyIdentity('program-test-union-admin','union_admin',unionId);
  await db.doc('guides/'+guideId).set({
    id:guideId,organizationId:orgId,ownerOrganizationId:orgId,ownerUid:unionAdmin.uid,
    language:'en',title:'Metered Guide',published:true,archived:false,
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
  assert.notEqual(excluded.status,200,'excluded curriculum capability must block hierarchy writes');
  assert.match(String(excluded.value?.error||''),/subscription plan does not include|Curriculum Studio/i);

  await db.doc('organizations/'+orgId).update({
    featureEntitlements:{curriculum:true},
  });
  const first=await call(unionAdmin,{
    collection:'programs',action:'upsert',organizationId:orgId,data:draft,
  });
  assert.equal(first.status,200,JSON.stringify(first.value));

  const overLimit=await call(unionAdmin,{
    collection:'programs',action:'upsert',organizationId:orgId,
    data:{...draft,title:'Second metered program'},
  });
  assert.notEqual(overLimit.status,200,'hierarchy actor must consume the descendant organization quota');
  assert.match(String(overLimit.value?.error||''),/maxPrograms|limit|usage/i);
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

const notesGuide='program-test-notes-guide';
await db.doc('guides/'+notesGuide).set({
  id:notesGuide,organizationId:a,ownerOrganizationId:a,ownerUid:author.uid,
  language:'en',title:'Private notes guide',published:true,
  archived:false,sharingScope:'organization',canonical:true,
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
  await t.test('authorized author receives notes, co-editor only metadata, outsider nothing',async()=>{
    const own=await call(author,{collection:'curriculum',action:'listGuideLessons',id:notesGuide,
      organizationId:a});
    assert.equal(own.status,200,JSON.stringify(own.value));
    assert.equal(own.value.items.find(item=>item.id===lessonId).teacherNotes,notes);
    const peer=await call(coAdmin,{collection:'curriculum',action:'listGuideLessons',id:notesGuide,
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
