import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createServer } from 'vite';

test('personal notifications are account-scoped and survive stale tenant/profile state', async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Firestore emulator required; never run against production.');
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, 'Auth emulator required; never run against production.');
  if (process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_PROJECT_ID !== 'demo-vop-security-rules') {
    throw new Error('Refusing to test on a non-demo Firebase project.');
  }
  process.env.FIREBASE_ADMIN_PROJECT_ID='demo-vop-security-rules';

  const app=getApps()[0] || initializeApp({projectId:'demo-vop-security-rules'});
  const db=getFirestore(app);
  const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});

  async function identity(name,profile){
    const response=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+
      '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email:name+'@notifications.invalid',password:'local-emulator-only',returnSecureToken:true}),
      });
    const account=await response.json();
    assert.equal(response.status,200,JSON.stringify(account));
    if(profile)await db.doc('users/'+account.localId).set({uid:account.localId,...profile});
    return {uid:account.localId,token:account.idToken};
  }

  try{
    const {default:notifications}=await vite.ssrLoadModule('/api_handlers/admin/notifications.ts');

    async function api(user,{method='GET',query={},body}={}){
      let status=200,output;
      await notifications({
        method,
        headers:user?{authorization:'Bearer '+user.token}:{},
        query,
        body,
      },{
        status(code){status=code;return this;},
        json(data){output=data;return this;},
      });
      assert.ok(output&&typeof output==='object','Notification API must return JSON');
      return {status,...output};
    }

    const profileless=await identity('notification-profileless');
    await db.doc('notifications/profileless-alert').set({
      recipientId:profileless.uid,userId:profileless.uid,
      title:'Welcome',body:'Account-level notification',read:false,
      createdAt:Timestamp.now(),
    });

    const profilelessList=await api(profileless,{query:{action:'list'}});
    assert.equal(profilelessList.status,200,JSON.stringify(profilelessList));
    assert.equal(profilelessList.items.length,1);
    assert.equal(profilelessList.items[0].id,'profileless-alert');
    assert.equal(profilelessList.unread,1);

    const marked=await api(profileless,{
      method:'POST',
      body:{action:'markRead',notificationId:'profileless-alert'},
    });
    assert.equal(marked.status,200,JSON.stringify(marked));
    assert.equal(marked.read,true);
    assert.equal((await db.doc('notifications/profileless-alert').get()).data()?.read,true);

    // A stale hierarchy assignment must not block the user's own inbox. Full
    // tenant authorization is required only for administrative send actions.
    const staleHierarchy=await identity('notification-stale-hierarchy',{
      role:'union_admin',adminNodeId:'deleted-union-node',adminNodeType:'union',
    });
    await db.doc('notifications/stale-hierarchy-alert').set({
      recipientId:staleHierarchy.uid,userId:staleHierarchy.uid,
      title:'Personal alert',body:'Still visible after tenant repair is needed',read:false,
      createdAt:Timestamp.now(),
    });

    const staleList=await api(staleHierarchy,{query:{action:'list'}});
    assert.equal(staleList.status,200,JSON.stringify(staleList));
    assert.equal(staleList.items.some(item=>item.id==='stale-hierarchy-alert'),true);

    const blockedSend=await api(staleHierarchy,{
      method:'POST',
      body:{
        action:'send',recipientId:profileless.uid,title:'Should fail',body:'No valid tenant',
      },
    });
    assert.equal(blockedSend.status,403,JSON.stringify(blockedSend));

    const unauthenticated=await api(null,{query:{action:'list'}});
    assert.equal(unauthenticated.status,401,JSON.stringify(unauthenticated));
    assert.match(String(unauthenticated.error||''),/sign in/i);
  }finally{
    await vite.close();
    if(getApps().includes(app))await deleteApp(app);
  }
});


test('notification delivery enforces preferences, provider state and retry semantics', async t => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Firestore emulator required; never run against production.');
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, 'Auth emulator required; never run against production.');
  process.env.FIREBASE_ADMIN_PROJECT_ID='demo-vop-security-rules';

  const app=getApps()[0] || initializeApp({projectId:'demo-vop-security-rules'});
  const db=getFirestore(app);
  const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
  const originalFetch=globalThis.fetch;
  const originalApiKey=process.env.RESEND_API_KEY;
  const originalFrom=process.env.RESEND_FROM_EMAIL;

  async function identity(name){
    const response=await originalFetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+
      '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email:name+'@notifications.invalid',password:'local-emulator-only',returnSecureToken:true}),
      });
    const account=await response.json();
    assert.equal(response.status,200,JSON.stringify(account));
    await db.doc('users/'+account.localId).set({
      uid:account.localId,email:name+'@notifications.invalid',role:'student',
    });
    return {uid:account.localId,token:account.idToken};
  }

  try{
    const {deliverNotification,retryPendingEmailNotifications,notifyOrganizationMembers}=await vite.ssrLoadModule('/server/notifications.ts');
    const user=await identity('delivery-policy');
    await db.doc('system/settings').set({
      notifications:{emailEnabled:true},
      systemOptions:{enableEmailNotifications:false},
    });

    await t.test('global opt-out suppresses ordinary in-app notices but mandatory security notices bypass it',async()=>{
      await db.doc('users/'+user.uid+'/settings/personal').set({
        notifications:{enabled:false,email:false,announcements:false,certificates:false},
      });
      const suppressed=await deliverNotification(db,{
        recipientId:user.uid,title:'Ordinary notice',body:'Should not enter inbox',type:'assignment',
      });
      assert.equal(suppressed.state,'suppressed_by_preference');
      assert.equal((await db.collection('notifications').where('recipientId','==',user.uid).get()).size,0);
      assert.equal((await db.doc('notificationDeliveries/'+suppressed.id).get()).data()?.state,'suppressed_by_preference');

      const security=await deliverNotification(db,{
        recipientId:user.uid,title:'Security notice',body:'Mandatory account protection notice',type:'security',mandatory:true,
      });
      assert.equal(security.state,'sent');
      assert.equal((await db.doc('notifications/'+security.notificationId).get()).exists,true);
    });

    await t.test('announcement and certificate preferences suppress only their categories',async()=>{
      await db.doc('users/'+user.uid+'/settings/personal').set({
        notifications:{enabled:true,email:true,announcements:false,certificates:false},
      });
      const announcement=await deliverNotification(db,{
        recipientId:user.uid,title:'Announcement',body:'Publication',type:'announcement',
      });
      const certificate=await deliverNotification(db,{
        recipientId:user.uid,title:'Certificate',body:'Award',type:'certificate',
      });
      const assignment=await deliverNotification(db,{
        recipientId:user.uid,title:'Assignment',body:'Continue study',type:'assignment',
      });
      assert.equal(announcement.state,'suppressed_by_preference');
      assert.equal(certificate.state,'suppressed_by_preference');
      assert.equal(assignment.state,'sent');
    });

    await t.test('email opt-out is enforced before contacting the provider',async()=>{
      await db.doc('users/'+user.uid+'/settings/personal').set({
        notifications:{enabled:true,email:false,announcements:true,certificates:true},
      });
      process.env.RESEND_API_KEY='test-key';
      process.env.RESEND_FROM_EMAIL='VOP <noreply@vop.invalid>';
      let resendCalls=0;
      globalThis.fetch=async(input,init)=>{
        if(String(input)==='https://api.resend.com/emails'){
          resendCalls+=1;
          return new Response(JSON.stringify({id:'should-not-send'}),{status:200,headers:{'Content-Type':'application/json'}});
        }
        return originalFetch(input,init);
      };
      const result=await deliverNotification(db,{
        recipientId:user.uid,title:'Email',body:'Do not send',type:'assignment',channel:'email',
      });
      assert.equal(result.state,'suppressed_by_preference');
      assert.equal(resendCalls,0);
    });

    await t.test('configured email delivery records provider success instead of pretending an email was sent',async()=>{
      await db.doc('users/'+user.uid+'/settings/personal').set({
        notifications:{enabled:true,email:true,announcements:true,certificates:true},
      });
      process.env.RESEND_API_KEY='test-key';
      process.env.RESEND_FROM_EMAIL='VOP <noreply@vop.invalid>';
      globalThis.fetch=async(input,init)=>{
        if(String(input)==='https://api.resend.com/emails'){
          const request=JSON.parse(String(init?.body||'{}'));
          assert.deepEqual(request.to,['delivery-policy@notifications.invalid']);
          assert.equal(request.subject,'Real email');
          return new Response(JSON.stringify({id:'resend-message-1'}),{status:200,headers:{'Content-Type':'application/json'}});
        }
        return originalFetch(input,init);
      };
      const result=await deliverNotification(db,{
        recipientId:user.uid,title:'Real email',body:'Provider-backed delivery',type:'assignment',channel:'email',
      });
      assert.equal(result.state,'sent');
      assert.equal(result.providerMessageId,'resend-message-1');
      const delivery=(await db.doc('notificationDeliveries/'+result.id).get()).data();
      assert.equal(delivery?.state,'sent');
      assert.equal(delivery?.provider,'resend');
      assert.equal(delivery?.providerMessageId,'resend-message-1');
    });

    await t.test('transient provider failures retry and can later succeed idempotently on the same delivery record',async()=>{
      process.env.RESEND_API_KEY='test-key';
      process.env.RESEND_FROM_EMAIL='VOP <noreply@vop.invalid>';
      globalThis.fetch=async(input,init)=>{
        if(String(input)==='https://api.resend.com/emails'){
          return new Response(JSON.stringify({message:'temporary'}),{status:503,headers:{'Content-Type':'application/json'}});
        }
        return originalFetch(input,init);
      };
      const first=await deliverNotification(db,{
        recipientId:user.uid,title:'Retry email',body:'Retry me',type:'assignment',channel:'email',
      });
      assert.equal(first.state,'retrying');
      await db.doc('notificationDeliveries/'+first.id).set({nextAttemptAt:new Date(Date.now()-1000).toISOString()},{merge:true});

      globalThis.fetch=async(input,init)=>{
        if(String(input)==='https://api.resend.com/emails'){
          return new Response(JSON.stringify({id:'resend-retry-success'}),{status:200,headers:{'Content-Type':'application/json'}});
        }
        return originalFetch(input,init);
      };
      const retried=await retryPendingEmailNotifications(db,20);
      assert.ok(retried.attempted>=1,JSON.stringify(retried));
      assert.ok(retried.sent>=1,JSON.stringify(retried));
      const final=(await db.doc('notificationDeliveries/'+first.id).get()).data();
      assert.equal(final?.state,'sent');
      assert.equal(final?.providerMessageId,'resend-retry-success');
    });

    await t.test('publication fan-out tracks recipient preference suppression without creating inbox records',async()=>{
      const allowed=await identity('publication-allowed');
      const muted=await identity('publication-muted');
      await db.doc('organizations/org-notification').set({id:'org-notification',status:'active'});
      for(const person of [allowed,muted]){
        await db.doc('organizations/org-notification/members/'+person.uid).set({
          uid:person.uid,organizationId:'org-notification',role:'learner',active:true,
        });
      }
      await db.doc('users/'+allowed.uid+'/settings/personal').set({notifications:{enabled:true,announcements:true}});
      await db.doc('users/'+muted.uid+'/settings/personal').set({notifications:{enabled:true,announcements:false}});
      const result=await notifyOrganizationMembers(db,{
        organizationId:'org-notification',sourceId:'announcement-1',
        title:'Published update',body:'News',type:'announcement',actionUrl:'/?route=announcements',createdBy:'system',
      });
      assert.equal(result.recipients,2);
      assert.equal(result.delivered,1);
      assert.equal(result.suppressed,1);
      assert.equal((await db.collection('notifications').where('recipientId','==',allowed.uid).get()).size,1);
      assert.equal((await db.collection('notifications').where('recipientId','==',muted.uid).get()).size,0);
    });
  } finally {
    globalThis.fetch=originalFetch;
    if(originalApiKey===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=originalApiKey;
    if(originalFrom===undefined)delete process.env.RESEND_FROM_EMAIL;else process.env.RESEND_FROM_EMAIL=originalFrom;
    await vite.close();
    if(getApps().includes(app))await deleteApp(app);
  }
});

test('personal settings API rejects malformed runtime preferences', async () => {
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, 'Auth emulator required; never run against production.');
  process.env.FIREBASE_ADMIN_PROJECT_ID='demo-vop-security-rules';
  const app=getApps()[0] || initializeApp({projectId:'demo-vop-security-rules'});
  const db=getFirestore(app);
  const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
  try{
    const signup=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+
      '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email:'settings-validation@notifications.invalid',password:'local-emulator-only',returnSecureToken:true}),
      });
    const account=await signup.json();
    assert.equal(signup.status,200,JSON.stringify(account));
    await db.doc('users/'+account.localId).set({uid:account.localId,email:'settings-validation@notifications.invalid',role:'student'});
    const {default:users}=await vite.ssrLoadModule('/api_handlers/admin/users.ts');
    async function save(settings){
      let status=200,output;
      await users({
        method:'POST',headers:{authorization:'Bearer '+account.idToken},
        body:{action:'personalSettings',settings},
      },{
        status(code){status=code;return this;},
        json(data){output=data;return this;},
      });
      return {status,...output};
    }

    assert.equal((await save({notifications:{enabled:'yes'}})).status,400);
    assert.equal((await save({accessibility:{largeText:'yes'}})).status,400);
    assert.equal((await save({privacy:{profileVisibility:'public'}})).status,400);
    assert.equal((await save({studyPreferences:{reminders:true,preferredStudyTime:'25:99',timezone:'Africa/Lusaka'}})).status,400);
    assert.equal((await save({studyPreferences:{reminders:true,preferredStudyTime:'19:30',timezone:'not a timezone'}})).status,400);

    const valid=await save({
      notifications:{enabled:true,email:false,announcements:true,certificates:true},
      accessibility:{reducedMotion:true,largeText:true,highContrast:false},
      privacy:{profileVisibility:'private'},
      studyPreferences:{reminders:true,preferredStudyTime:'19:30',timezone:'Africa/Lusaka'},
    });
    assert.equal(valid.status,200,JSON.stringify(valid));
    assert.equal(valid.settings.studyPreferences.preferredStudyTime,'19:30');
    assert.equal(valid.settings.studyPreferences.timezone,'Africa/Lusaka');
    assert.equal(valid.settings.privacy.profileVisibility,'private');
  }finally{
    await vite.close();
    if(getApps().includes(app))await deleteApp(app);
  }
});
