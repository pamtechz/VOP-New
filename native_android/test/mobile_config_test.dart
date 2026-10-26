import 'package:flutter_test/flutter_test.dart';
import 'package:vop/core/config.dart';
import 'package:vop/widgets/plate_page.dart';

void main() {
  test('Classic uses its own origin for all nested study URLs', () {
    for (final path in [
      '/classic/',
      '/classic/programmes',
      '/classic/guide/one',
    ]) {
      expect(
        resolveVopApiOrigin(
          isWeb: true,
          page: Uri.parse('https://preview.example$path'),
          configured: 'https://backend.example',
        ),
        'https://preview.example',
      );
    }
  });

  test(
    'local HTTP development retains configured backend',
    () {
      for (final url in [
        'http://127.0.0.1:7357/',
        'http://localhost:7358/',
      ]) {
        expect(
          resolveVopApiOrigin(
            isWeb: true,
            page: Uri.parse(url),
            configured: 'https://backend.example',
          ),
          'https://backend.example',
        );
      }
    },
  );

  test('standalone HTTPS Flutter browser deployments use the same-origin API', () {
    for (final url in [
      'https://vop-flutter-example.vercel.app/',
      'https://vopafrica.vercel.app/classic/',
      'https://study.example.org/',
    ]) {
      final page = Uri.parse(url);
      expect(resolveVopApiOrigin(
        isWeb: true,
        page: page,
        configured: 'https://vopafrica.vercel.app',
      ), page.origin);
    }
  });

  test('Android never derives a backend from a browser page', () {
    expect(
      resolveVopApiOrigin(
        isWeb: false,
        page: Uri.parse('https://preview.example/classic/'),
        configured: 'https://backend.example',
      ),
      'https://backend.example',
    );
  });

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
    expect(
      plainNode({
        'type': 'p',
        'children': [
          {'text': 'Grace'},
          {'text': ' and love'},
        ],
      }),
      'Grace  and love',
    );
  });
}
