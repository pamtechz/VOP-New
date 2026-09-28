import test from 'node:test';
import assert from 'node:assert/strict';
import { publicationNotificationId } from '../server/notifications.ts';

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
    'event__event______1__member_example_com',
  );
  assert.throws(() => publicationNotificationId('event','','member-1'));
});
