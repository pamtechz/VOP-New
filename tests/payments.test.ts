import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import {
  amountToMinor, canTransitionPaymentStatus, isThreeDSecureValidated, mapProviderStatus,
  minorToDecimal, normalizeCurrency, paymentMethodOperator,
} from '../shared/payments.ts';
import { verifyLencoWebhookSignature } from '../server/payments/lencoSignature.ts';
import { assertPciDssCompliance, passesLuhnCheck } from '../server/payments/pciCompliance.ts';

test('payment amounts use currency-aware integer minor units',()=>{
  assert.equal(amountToMinor('500.25','ZMW'),50025);
  assert.equal(minorToDecimal(50025,'ZMW'),'500.25');
  assert.equal(amountToMinor('100','JPY'),100);
  assert.equal(minorToDecimal(100,'JPY'),'100');
  assert.equal(normalizeCurrency('zmw'),'ZMW');
  assert.throws(()=>amountToMinor('0','ZMW'),/greater than zero/i);
  assert.throws(()=>normalizeCurrency('kwacha'),/three-letter/i);
});

test('provider statuses map without allowing paid state to regress',()=>{
  assert.equal(mapProviderStatus('successful'),'paid');
  assert.equal(mapProviderStatus('pay-offline'),'requires_action');
  assert.equal(mapProviderStatus('3ds-auth-required'),'requires_action');
  assert.equal(mapProviderStatus('failed'),'failed');
  assert.equal(canTransitionPaymentStatus('pending','paid'),true);
  assert.equal(canTransitionPaymentStatus('paid','pending'),false);
  assert.equal(canTransitionPaymentStatus('paid','refunded'),true);
  assert.equal(canTransitionPaymentStatus('failed','pending'),false);
});

test('mobile money methods map to provider operator names',()=>{
  assert.equal(paymentMethodOperator('airtel_money'),'airtel');
  assert.equal(paymentMethodOperator('mtn_money'),'mtn');
  assert.equal(paymentMethodOperator('zamtel_money'),'zamtel');
  assert.equal(paymentMethodOperator('card'),'');
});

test('Lenco webhook verification follows the documented API-token signature derivation',()=>{
  const prior=process.env.LENCO_API_TOKEN;
  process.env.LENCO_API_TOKEN='unit-test-lenco-token';
  try{
    const body=Buffer.from(JSON.stringify({event:'collection.successful',data:{reference:'VOP-TEST-001'}}));
    const hashKey=createHash('sha256').update(process.env.LENCO_API_TOKEN).digest('hex');
    const signature=createHmac('sha512',hashKey).update(body).digest('hex');
    assert.equal(verifyLencoWebhookSignature(body,signature,process.env.LENCO_API_TOKEN),true);
    assert.equal(verifyLencoWebhookSignature(body,signature.slice(0,-2)+'00',process.env.LENCO_API_TOKEN),false);
  }finally{
    if(prior===undefined)delete process.env.LENCO_API_TOKEN;
    else process.env.LENCO_API_TOKEN=prior;
  }
});

test('PCI-DSS zero cardholder data guard prevents storing or processing PAN/CVV/PIN',()=>{
  assert.equal(passesLuhnCheck('49927398716'),true);
  assert.equal(passesLuhnCheck('49927398717'),false);

  // Clean compliant payloads succeed
  assert.doesNotThrow(()=>assertPciDssCompliance({payableItemId:'item-1',paymentMethod:'card'}));
  assert.doesNotThrow(()=>assertPciDssCompliance({payableItemId:'item-1',paymentMethod:'mtn_money',phone:'0960000000'}));

  // Payloads attempting to transmit PAN or CVV directly are rejected with PCI-DSS violation
  assert.throws(()=>assertPciDssCompliance({cardNumber:'49927398716'}),/PCI-DSS compliance violation/i);
  assert.throws(()=>assertPciDssCompliance({pan:'49927398716'}),/PCI-DSS compliance violation/i);
  assert.throws(()=>assertPciDssCompliance({cvv:'123'}),/PCI-DSS compliance violation/i);
  assert.throws(()=>assertPciDssCompliance({pin:'1234'}),/PCI-DSS compliance violation/i);
  assert.throws(()=>assertPciDssCompliance({metadata:{nested:{cvv2:'999'}}}),/PCI-DSS compliance violation/i);
});

test('3D-Secure 2.0 verification validates customer identity and certifies liability shift',()=>{
  const pendingTx={
    threeDSecure:{
      required:true,
      version:'2.2.0',
      status:'challenge_required' as const,
      liabilityShifted:false,
      summary:'3D-Secure challenge required',
    },
  };
  assert.equal(isThreeDSecureValidated(pendingTx),false);

  const certifiedTx={
    threeDSecure:{
      required:true,
      version:'2.2.0',
      status:'authenticated' as const,
      liabilityShifted:true,
      summary:'Certified via 3D-Secure 2.0 (Verified by Visa / Mastercard Identity Check - Liability Shifted)',
      authenticatedAt:new Date().toISOString(),
      eci:'05',
    },
  };
  assert.equal(isThreeDSecureValidated(certifiedTx),true);
});
