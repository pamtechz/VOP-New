import test from 'node:test';
import assert from 'node:assert/strict';
import { backupOutputPrefix, OPERATIONS_POLICY } from '../server/operations.ts';

test('operations policy defines bounded backup and maintenance windows',()=>{
  assert.equal(OPERATIONS_POLICY.backupRpoHours,24);
  assert.equal(OPERATIONS_POLICY.backupStaleAfterHours,36);
  assert.equal(OPERATIONS_POLICY.maintenanceStaleAfterHours,48);
  assert.equal(OPERATIONS_POLICY.alertCooldownHours,24);
});

test('backup output prefixes are deterministic per UTC day',()=>{
  const previous=process.env.FIRESTORE_BACKUP_BUCKET;
  try{
    process.env.FIRESTORE_BACKUP_BUCKET='gs://vop-production-backups';
    assert.equal(
      backupOutputPrefix(new Date('2026-10-05T23:58:00Z')),
      'gs://vop-production-backups/vop-firestore/2026-10-05',
    );
    process.env.FIRESTORE_BACKUP_BUCKET='gs://vop-production-backups/firestore';
    assert.equal(
      backupOutputPrefix(new Date('2026-10-06T00:01:00Z')),
      'gs://vop-production-backups/firestore/vop-firestore/2026-10-06',
    );
  }finally{
    if(previous===undefined)delete process.env.FIRESTORE_BACKUP_BUCKET;
    else process.env.FIRESTORE_BACKUP_BUCKET=previous;
  }
});

test('invalid backup destinations fail before any cloud request',()=>{
  const previous=process.env.FIRESTORE_BACKUP_BUCKET;
  try{
    process.env.FIRESTORE_BACKUP_BUCKET='https://example.com/not-a-gcs-bucket';
    assert.throws(()=>backupOutputPrefix(new Date('2026-10-05T00:00:00Z')),/valid gs:\/\//i);
  }finally{
    if(previous===undefined)delete process.env.FIRESTORE_BACKUP_BUCKET;
    else process.env.FIRESTORE_BACKUP_BUCKET=previous;
  }
});
