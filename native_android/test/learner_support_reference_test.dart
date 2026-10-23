import 'package:flutter_test/flutter_test.dart';
import 'package:vop/screens/learner_support_screen.dart';

void main() {
  test('support retries reuse their idempotency key until the payload changes', () {
    final keys = SupportSubmissionIdempotency();
    final request = <String, dynamic>{
      'action': 'createSupportRequest',
      'subject': 'Bible question',
      'message': 'Please explain this lesson',
      'references': <Map<String, String>>[],
    };
    final first = keys.keyFor(request);
    expect(first, matches(RegExp(r'^[a-f0-9]{32}  test('lesson references retain canonical server-supported attachment keys', () {
    const reference = StudySupportReference(
      type: 'lesson',
      id: 'lesson-2',
      label: 'The Promise',
      route: 'lesson',
      description: 'Guide: guide-1',
    );
    expect(reference.toJson(), {
      'type': 'lesson',
      'id': 'lesson-2',
      'label': 'The Promise',
      'route': 'lesson',
      'description': 'Guide: guide-1',
    });
  });

  test('references omit optional route and description when absent', () {
    const reference = StudySupportReference(
      type: 'program', id: 'program-1', label: 'Bible studies',
    );
    expect(reference.toJson(), {
      'type': 'program', 'id': 'program-1', 'label': 'Bible studies',
    });
  });
}
)));
    expect(keys.keyFor(Map<String, dynamic>.from(request)), first);

    final edited = Map<String, dynamic>.from(request)
      ..['message'] = 'Please explain this lesson in more detail';
    final next = keys.keyFor(edited);
    expect(next, matches(RegExp(r'^[a-f0-9]{32}  test('lesson references retain canonical server-supported attachment keys', () {
    const reference = StudySupportReference(
      type: 'lesson',
      id: 'lesson-2',
      label: 'The Promise',
      route: 'lesson',
      description: 'Guide: guide-1',
    );
    expect(reference.toJson(), {
      'type': 'lesson',
      'id': 'lesson-2',
      'label': 'The Promise',
      'route': 'lesson',
      'description': 'Guide: guide-1',
    });
  });

  test('references omit optional route and description when absent', () {
    const reference = StudySupportReference(
      type: 'program', id: 'program-1', label: 'Bible studies',
    );
    expect(reference.toJson(), {
      'type': 'program', 'id': 'program-1', 'label': 'Bible studies',
    });
  });
}
)));
    expect(next, isNot(first));
    expect(keys.keyFor(edited), next);
  });

  test('lesson references retain canonical server-supported attachment keys', () {
    const reference = StudySupportReference(
      type: 'lesson',
      id: 'lesson-2',
      label: 'The Promise',
      route: 'lesson',
      description: 'Guide: guide-1',
    );
    expect(reference.toJson(), {
      'type': 'lesson',
      'id': 'lesson-2',
      'label': 'The Promise',
      'route': 'lesson',
      'description': 'Guide: guide-1',
    });
  });

  test('references omit optional route and description when absent', () {
    const reference = StudySupportReference(
      type: 'program', id: 'program-1', label: 'Bible studies',
    );
    expect(reference.toJson(), {
      'type': 'program', 'id': 'program-1', 'label': 'Bible studies',
    });
  });
}
