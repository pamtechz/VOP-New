import 'package:flutter/material.dart';

/// Only renders feedback released by the server after submission.
class QuizAnswerExplanations extends StatelessWidget {
  const QuizAnswerExplanations({required this.result, super.key});
  final Map<String, dynamic> result;

  @override
  Widget build(BuildContext context) {
    if (result['queued'] == true || result['feedbackMode'] != 'after_submit') {
      return const SizedBox.shrink();
    }
    final entries = result['explanations'];
    if (entries is! List || !entries.any((entry) => entry.toString().trim().isNotEmpty)) {
      return const SizedBox.shrink();
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const SizedBox(height: 20),
      Text('Correct answers and explanations',
        style: Theme.of(context).textTheme.titleMedium),
      for (var index = 0; index < entries.length; index++)
        if (entries[index].toString().trim().isNotEmpty)
          Padding(padding: const EdgeInsets.only(top: 12),
            child: SelectableText('Question ${index + 1}\n${entries[index]}')),
      const SizedBox(height: 16),
    ]);
  }
}
