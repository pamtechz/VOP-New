import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,getApps,deleteApp} from 'firebase-admin/app';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {createServer} from 'vite';

test('mentor workspace is assignment-scoped end to end',async t=>{
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
    const {default:mentorship}=await vite.ssrLoadModule('/api/mentorship.ts');
    const org='org-mentor-a',foreignOrg='org-mentor-b';
    await db.doc('organizations/'+org).set({id:org,status:'active'});
    await db.doc('organizations/'+foreignOrg).set({id:foreignOrg,status:'active'});

    async function identity(name,organizationId,role='student',organizationRole=''){
      const response=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+
        '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({email:name+'@vop-test.invalid',password:'local-emulator-only',returnSecureToken:true}),
        });
      const user=await response.json();
      assert.equal(response.status,200,JSON.stringify(user));
      await db.doc('users/'+user.localId).set({
        uid:user.localId,email:name+'@vop-test.invalid',displayName:name,
        role,organizationId,organizationRole,
        progress:{discoverProgress:42,completedLessons:['en:guide-a:lesson-a']},
      });
      await db.doc(`organizations/${organizationId}/members/${user.localId}`).set({
        uid:user.localId,organizationId,role:organizationRole||role,active:true,
      });
      return {uid:user.localId,token:user.idToken};
    }
    async function call(user,body){
      let status=200,payload;
      await mentorship({method:'POST',headers:{authorization:'Bearer '+user.token},body},{
        status(code){status=code;return this;},json(value){payload=value;return this;},
      });
      assert.ok(payload&&typeof payload==='object');
      return {status,payload};
    }

    const mentor=await identity('mentor-assigned',org,'mentor','mentor');
    const unassignedMentor=await identity('mentor-unassigned',org,'mentor','mentor');
    const learner=await identity('mentor-learner',org,'student','learner');
    const supportAdmin=await identity('support-admin',org,'staff','admin');
    const foreignMentor=await identity('mentor-foreign',foreignOrg,'mentor','mentor');
    const foreignAdmin=await identity('support-foreign-admin',foreignOrg,'staff','admin');

    await db.doc('mentorAssignments/'+learner.uid).set({
      studentId:learner.uid,mentorId:mentor.uid,organizationId:org,status:'active',
      assignedAt:FieldValue.serverTimestamp(),notes:'Support this learner',
    });
    await db.doc('users/'+learner.uid+'/assessmentAttempts/attempt-one').set({
      organizationId:org,language:'en',guideId:'guide-a',lessonId:'quiz-a',
      score:60,passed:false,createdAt:FieldValue.serverTimestamp(),
      questionResults:[{key:'q1',question:'A difficult question',correct:false,guideId:'guide-a',lessonId:'quiz-a'}],
    });

    await t.test('assigned mentor receives only assigned learner roster and performance',async()=>{
      const roster=await call(mentor,{action:'listMyAssignments'});
      assert.equal(roster.status,200,JSON.stringify(roster.payload));
      assert.equal(roster.payload.items.length,1);
      assert.equal(roster.payload.items[0].studentId,learner.uid);
      assert.equal(roster.payload.items[0].student.displayName,'mentor-learner');
      const performance=await call(mentor,{action:'performance',studentId:learner.uid});
      assert.equal(performance.status,200,JSON.stringify(performance.payload));
      assert.equal(performance.payload.item.assessments,1);
      assert.equal(performance.payload.item.failedAssessments,1);
      assert.equal(performance.payload.item.weakQuestions[0].key,'q1');
    });

    await t.test('unassigned and foreign mentors cannot access another mentor learner',async()=>{
      const empty=await call(unassignedMentor,{action:'listMyAssignments'});
      assert.equal(empty.status,200,JSON.stringify(empty.payload));
      assert.equal(empty.payload.items.length,0);
      const deniedConversation=await call(unassignedMentor,{
        action:'listConversations',studentId:learner.uid,mentorId:unassignedMentor.uid,
      });
      assert.equal(deniedConversation.status,403,JSON.stringify(deniedConversation.payload));
      const deniedMessage=await call(foreignMentor,{
        action:'sendMessage',studentId:learner.uid,mentorId:foreignMentor.uid,message:'Cross tenant',
      });
      assert.equal(deniedMessage.status,403,JSON.stringify(deniedMessage.payload));
    });

    await t.test('assigned mentor and learner can exchange private support messages',async()=>{
      const sent=await call(mentor,{
        action:'sendMessage',studentId:learner.uid,mentorId:mentor.uid,message:'Please revisit the first question.',
        references:[{type:'lesson',id:'lesson-a',label:'Lesson A'}],
      });
      assert.equal(sent.status,200,JSON.stringify(sent.payload));
      const studentThreads=await call(learner,{action:'listMyConversations'});
      assert.equal(studentThreads.status,200,JSON.stringify(studentThreads.payload));
      assert.equal(studentThreads.payload.items.length,1);
      const thread=studentThreads.payload.items[0];
      assert.equal(thread.mentorId,mentor.uid);
      const studentMessages=await call(learner,{action:'messages',conversationId:thread.id});
      assert.equal(studentMessages.status,200,JSON.stringify(studentMessages.payload));
      assert.equal(studentMessages.payload.items[0].body,'Please revisit the first question.');
      const reply=await call(learner,{
        action:'sendMessage',studentId:learner.uid,mentorId:mentor.uid,message:'Thank you, I will review it.',
      });
      assert.equal(reply.status,200,JSON.stringify(reply.payload));
      const mentorMessages=await call(mentor,{action:'messages',conversationId:thread.id});
      assert.equal(mentorMessages.status,200,JSON.stringify(mentorMessages.payload));
      assert.equal(mentorMessages.payload.items.length,2);
    });

    await t.test('candidate can open contextual doctrine support with mentor, organization team and One Voice 27 follow-up',async()=>{
      const created=await call(learner,{
        action:'createSupportRequest',
        subject:'I need help understanding the Sabbath',
        message:'Please help me understand how this doctrine connects with the lesson and the Bible texts.',
        category:'doctrine',
        target:'both',
        channel:'both',
        priority:'high',
        spiritualInterest:'one_voice_27',
        references:[
          {type:'guide',id:'guide-a',label:'Discover Bible Course'},
          {type:'lesson',id:'lesson-a',label:'Lesson A'},
          {type:'doctrine',id:'lesson-a:doctrine:sabbath',label:'The Sabbath'},
        ],
      });
      assert.equal(created.status,201,JSON.stringify(created.payload));
      assert.equal(created.payload.item.assignedMentorId,mentor.uid);
      assert.equal(created.payload.item.category,'doctrine');
      assert.equal(created.payload.item.spiritualInterest,'one_voice_27');
      assert.equal(created.payload.item.campaignTag,'one_voice_27');
      assert.equal(created.payload.item.references.length,3);
      const requestId=created.payload.item.id;

      const mine=await call(learner,{action:'listMySupportRequests'});
      assert.equal(mine.status,200,JSON.stringify(mine.payload));
      assert.ok(mine.payload.items.some(item=>item.id===requestId));

      const mentorQueue=await call(mentor,{action:'listSupportRequests'});
      assert.equal(mentorQueue.status,200,JSON.stringify(mentorQueue.payload));
      assert.ok(mentorQueue.payload.items.some(item=>item.id===requestId));

      const teamQueue=await call(supportAdmin,{action:'listSupportRequests'});
      assert.equal(teamQueue.status,200,JSON.stringify(teamQueue.payload));
      assert.ok(teamQueue.payload.items.some(item=>item.id===requestId));

      const initial=await call(mentor,{action:'supportRequestMessages',requestId});
      assert.equal(initial.status,200,JSON.stringify(initial.payload));
      assert.equal(initial.payload.items.length,1);
      assert.match(initial.payload.items[0].body,/help me understand/i);

      const reply=await call(mentor,{
        action:'replySupportRequest',requestId,
        message:'Let us compare the lesson with the Bible passages together.',
        references:[{type:'scripture',id:'exodus-20-8-11',label:'Exodus 20:8–11'}],
      });
      assert.equal(reply.status,200,JSON.stringify(reply.payload));

      const candidateThread=await call(learner,{action:'supportRequestMessages',requestId});
      assert.equal(candidateThread.status,200,JSON.stringify(candidateThread.payload));
      assert.equal(candidateThread.payload.items.length,2);
      assert.equal(candidateThread.payload.items[1].senderId,mentor.uid);

      const resolved=await call(supportAdmin,{action:'updateSupportRequest',requestId,status:'resolved'});
      assert.equal(resolved.status,200,JSON.stringify(resolved.payload));
      assert.equal(resolved.payload.item.status,'resolved');

      const reopen=await call(learner,{
        action:'replySupportRequest',requestId,
        message:'I still have one more question about the same doctrine.',
      });
      assert.equal(reopen.status,200,JSON.stringify(reopen.payload));

      const reopenedMine=await call(learner,{action:'listMySupportRequests'});
      assert.equal(reopenedMine.payload.items.find(item=>item.id===requestId)?.status,'open');

      const foreignDenied=await call(foreignAdmin,{action:'supportRequestMessages',requestId});
      assert.equal(foreignDenied.status,403,JSON.stringify(foreignDenied.payload));
    });

    await t.test('inactive assignment immediately removes mentor workspace access',async()=>{
      await db.doc('mentorAssignments/'+learner.uid).update({status:'inactive'});
      const roster=await call(mentor,{action:'listMyAssignments'});
      assert.equal(roster.status,200,JSON.stringify(roster.payload));
      assert.equal(roster.payload.items.length,0);
      const denied=await call(mentor,{
        action:'sendMessage',studentId:learner.uid,mentorId:mentor.uid,message:'Should be blocked',
      });
      assert.equal(denied.status,403,JSON.stringify(denied.payload));
    });
  }finally{
    await vite.close();
    if(getApps().includes(app))await deleteApp(app);
  }
});
