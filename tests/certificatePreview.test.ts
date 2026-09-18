import test from 'node:test';
import assert from 'node:assert/strict';
import { canShowLocalCertificatePreview } from '../src/services/certificatePreview.ts';
import type { CurriculumProgress } from '../src/services/progress.ts';
import type { GraduationRequest, User } from '../src/types/index.ts';

const candidate = { uid: 'candidate-1', information: { graduated: true } } as User;
const completed = {
  certificateEligible: true,
  guides: [{ guideId: 'required-guide' }],
} as CurriculumProgress;
const approval = {
  candidateId: 'candidate-1', guideId: 'required-guide',
  status: 'approved', approvedAt: '2026-09-18T11:00:00Z',
} as GraduationRequest;

test('allows only an unverified preview when completion and matching approval exist', () => {
  assert.equal(canShowLocalCertificatePreview(completed, [approval], candidate), true);
});

test('does not borrow an approval from an unrelated guide or candidate', () => {
  assert.equal(canShowLocalCertificatePreview(completed, [{ ...approval, guideId: 'unrelated' }], candidate), false);
  assert.equal(canShowLocalCertificatePreview(completed, [{ ...approval, candidateId: 'other' }], candidate), false);
});

test('undated or rejected approvals cannot authorize a preview', () => {
  assert.equal(canShowLocalCertificatePreview(completed, [{ ...approval, approvedAt: undefined }], candidate), false);
  assert.equal(canShowLocalCertificatePreview(completed, [{ ...approval, approvedAt: 'bad date' }], candidate), false);
  assert.equal(canShowLocalCertificatePreview(completed, [{ ...approval, status: 'rejected' }], candidate), false);
});

test('a user graduation flag and required curriculum are both mandatory', () => {
  assert.equal(canShowLocalCertificatePreview({ ...completed, certificateEligible: false }, [approval], candidate), false);
  assert.equal(canShowLocalCertificatePreview({ ...completed, guides: [] }, [approval], candidate), false);
  assert.equal(canShowLocalCertificatePreview(completed, [approval], { ...candidate, information: { ...candidate.information, graduated: false } }), false);
});
