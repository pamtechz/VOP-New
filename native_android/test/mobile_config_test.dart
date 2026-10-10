import 'package:flutter_test/flutter_test.dart';
import 'package:vop/core/config.dart';
import 'package:vop/widgets/plate_page.dart';

void main() {
  test('configuration fails closed without the required Android values', () {
    // CI passes public dart defines for build; unit tests intentionally do not.
    expect(VopConfig.error, isNotNull);
  });

  test('rich text colors only accept six-character hex values', () {
    expect(plateColor('#112233'), isNotNull);
    expect(plateColor('red'), isNull);
    expect(plateColor('url(https://example.com)'), isNull);
  });

  test('Plate plain text traverses children, not arbitrary HTML', () {
    expect(plainNode({
      'type': 'p',
      'children': [
        {'text': 'Grace'},
        {'text': ' and love'}
      ]
    }), 'Grace  and love');
  });
}
