import test from 'node:test';
import assert from 'node:assert/strict';
import { audienceAllowsRole, normalizePublicationAudience, publicationNotificationId } from '../server/notifications.ts';

test('publication notification IDs are deterministic and source/recipient scoped', () => {
  assert.equal(
    publicationNotificationId('announcement','news-1','member-1'),
    'announcement__news-1__member-1',
  );
  assert.equal(
    publicationNotificationId('announcement','news-1','member-1'),
    publicationNotificationId('announcement','news-1','member-1'),
  );
  assert.notEqual(
    publicationNotificationId('announcement','news-1','member-1'),
    publicationNotificationId('announcement','news-1','member-2'),
  );
  assert.notEqual(
    publicationNotificationId('announcement','news-1','member-1'),
    publicationNotificationId('event','news-1','member-1'),
  );
});

test('publication notification IDs sanitize Firestore-unsafe external identifiers', () => {
  assert.equal(
    publicationNotificationId('event','event/../../1','member@example.com'),
    'event__event_______1__member_example_com',
  );
  assert.throws(() => publicationNotificationId('event','','member-1'));
});


test('publication audiences normalize legacy labels and enforce membership roles', () => {
  assert.equal(normalizePublicationAudience('All Users'), 'all');
  assert.equal(normalizePublicationAudience('Students'), 'learners');
  assert.equal(normalizePublicationAudience('Administrators'), 'leaders');
  assert.equal(normalizePublicationAudience('Ministry Team'), 'staff');
  assert.throws(() => normalizePublicationAudience('youth club 13-15'));

  assert.equal(audienceAllowsRole('learners','learner'), true);
  assert.equal(audienceAllowsRole('learners','admin'), false);
  assert.equal(audienceAllowsRole('leaders','admin'), true);
  assert.equal(audienceAllowsRole('leaders','mentor'), true);
  assert.equal(audienceAllowsRole('mentors','teacher'), false);
  assert.equal(audienceAllowsRole('teachers','teacher'), true);
  assert.equal(audienceAllowsRole('staff','editor'), true);
});
