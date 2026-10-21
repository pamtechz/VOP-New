import 'dart:convert';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:vop/core/vop_api.dart';
import 'package:vop/screens/workspace_operations_screen.dart';

class _TestUser extends Fake implements User {
  @override
  String get uid => 'finance-admin';
  @override
  Future<String?> getIdToken([bool forceRefresh = false]) async => 'test-token';
}

class _TestAuth extends Fake implements FirebaseAuth {
  @override
  User? get currentUser => _TestUser();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Super Admin reconciliation displays real pending payments and reconciles by transaction ID', (tester) async {
    final paths = <String>[];
    final requests = <Map<String, dynamic>>[];
    final api = VopApi(
      auth: _TestAuth(),
      apiBaseUrl: 'https://vop-test.invalid',
      connectivity: const Stream<List<ConnectivityResult>>.empty(),
      client: MockClient((request) async {
        paths.add(request.url.path);
        final body = jsonDecode(request.body) as Map;
        requests.add(Map<String, dynamic>.from(body));
        if (request.url.path == '/api/payments/admin/transactions') {
          return http.Response(jsonEncode({
            'ok': true,
            'items': [
              {'id': 'pending-1', 'reference': 'VOP-2026-1', 'description': 'Pending enrolment', 'amountDecimal': 10, 'currency': 'ZMW', 'status': 'pending'},
              {'id': 'paid-2', 'reference': 'VOP-2026-2', 'description': 'Completed payment', 'amountDecimal': 15, 'currency': 'ZMW', 'status': 'paid'},
            ],
          }), 200);
        }
        if (request.url.path == '/api/payments/admin/reconcile') {
          return http.Response(jsonEncode({'ok': true, 'payment': {'id': 'pending-1', 'status': 'paid'}}), 200);
        }
        return http.Response(jsonEncode({'ok': true, 'items': []}), 200);
      }),
    );
    addTearDown(api.dispose);

    await tester.pumpWidget(MaterialApp(
      home: WorkspaceOperationsScreen(
        api: api,
        kind: 'payments',
        workspace: const {'isSuperAdmin': true, 'options': {}},
      ),
    ));
    await tester.pumpAndSettle();
    final reconciliation = find.text('Reconciliation');
    await tester.ensureVisible(reconciliation);
    await tester.tap(reconciliation);
    await tester.pumpAndSettle();

    expect(paths, contains('/api/payments/admin/transactions'));
    expect(find.text('Pending transactions (1)'), findsOneWidget);
    expect(find.text('Pending enrolment'), findsOneWidget);
    expect(find.text('Completed payment'), findsNothing);

    await tester.tap(find.byTooltip('Reconcile this payment'));
    await tester.pumpAndSettle();

    final individualCalls = requests.where((request) => request['paymentId'] == 'pending-1');
    expect(individualCalls.length, 1);
    expect(paths, contains('/api/payments/admin/reconcile'));
  });
}
