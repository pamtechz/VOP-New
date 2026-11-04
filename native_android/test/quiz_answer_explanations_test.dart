import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vop/widgets/quiz_answer_explanations.dart';

void main() {
  Future<void> show(WidgetTester tester, Map<String, dynamic> result) async {
    await tester.pumpWidget(MaterialApp(home: Scaffold(body:
      SingleChildScrollView(child: QuizAnswerExplanations(result: result)))));
  }
  testWidgets('shows submitted correct answers and authored rationale', (tester) async {
    await show(tester, {'feedbackMode': 'after_submit',
      'explanations': ['Correct answer: True\nThe lesson explains this.', '',
        'Correct answer: Mercy']});
    expect(find.text('Correct answers and explanations'), findsOneWidget);
    expect(find.textContaining('Question 1\nCorrect answer: True'), findsOneWidget);
    expect(find.textContaining('Question 3\nCorrect answer: Mercy'), findsOneWidget);
  });
  testWidgets('does not reveal feedback before grading or when withheld', (tester) async {
    for (final mode in ['none', 'score_only']) {
      await show(tester, {'feedbackMode': mode, 'explanations': ['secret']});
      expect(find.textContaining('secret'), findsNothing);
    }
    await show(tester, {'feedbackMode': 'after_submit', 'queued': true,
      'explanations': ['secret']});
    expect(find.textContaining('secret'), findsNothing);
  });
}
