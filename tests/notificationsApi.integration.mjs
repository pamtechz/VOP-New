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
