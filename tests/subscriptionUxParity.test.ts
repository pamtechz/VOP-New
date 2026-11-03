import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const legacy = readFileSync('src/components/admin/SubscriptionWorkspace.tsx','utf8');
const css = readFileSync('src/pages/payments.css','utf8');
const flutterPlans = readFileSync('native_android/lib/screens/plans_management_screen.dart','utf8');
const flutterCheckout = readFileSync('native_android/lib/screens/payment_checkout_screen.dart','utf8');
const flutterOperations = readFileSync('native_android/lib/screens/workspace_operations_screen.dart','utf8');

test('Legacy subscription workspace rejects stale organization billing results',()=>{
  assert.match(legacy,/latestRequest = useRef\(0\)/);
  assert.match(legacy,/if \(request !== latestRequest\.current\) return;/);
  assert.match(legacy,/latestRequest\.current\+\+/);
  assert.match(legacy,/const active = status === 'active' \|\| status === 'trialing'/);
});

test('Legacy plan journey uses verified activation and accessible messages',()=>{
  assert.match(legacy,/vop-subscription-journey/);
  assert.match(legacy,/Await verified activation/);
  assert.match(legacy,/role="alert"/);
  assert.match(css,/vop-subscription-journey/);
  assert.match(css,/@media\(max-width:740px\)/);
});

test('Classic passes exact institutional plan to the existing checkout catalog',()=>{
  assert.match(flutterPlans,/focusPayableItemId:'subscription_\$\{plan\['id'\]\}'/);
  assert.match(flutterOperations,/final String\? focusPayableItemId/);
  assert.match(flutterOperations,/items\.sort\(/);
  assert.match(flutterOperations,/widget\.api\.action\('\/api\/payments\/checkout'/);
});

test('Flutter subscription confirmations require provider and fulfilment status',()=>{
  assert.match(flutterCheckout,/payment\['fulfilmentStatus'\]=='fulfilled'/);
  assert.match(flutterCheckout,/Payment confirmed; subscription access is being activated/);
  assert.match(flutterPlans,/LinearProgressIndicator/);
  assert.match(flutterPlans,/Cancel at period end/);
});
