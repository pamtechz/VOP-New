import 'package:flutter_test/flutter_test.dart';
import 'package:vop/screens/learner_support_screen.dart';

void main() {
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
