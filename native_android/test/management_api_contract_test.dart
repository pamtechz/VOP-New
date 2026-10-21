import 'dart:convert';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:vop/core/vop_api.dart';

class TestUser extends Fake implements User {
  bool refreshed=false;
  @override String get uid=>'contract-user';
  @override Future<String?> getIdToken([bool forceRefresh=false])async{refreshed=forceRefresh||refreshed;return 'contract-token';}
}
class TestAuth extends Fake implements FirebaseAuth {
  TestAuth(this.user);
  final TestUser user;
  @override User? get currentUser=>user;
}
void main(){
  TestWidgetsFlutterBinding.ensureInitialized();
  test('management mutations use the existing web action names and identity fields',()async{
    final requests=<Map<String,dynamic>>[];
    final user=TestUser();
    final api=VopApi(auth:TestAuth(user),apiBaseUrl:'https://vop-test.invalid',connectivity:const Stream<List<ConnectivityResult>>.empty(),client:MockClient((request)async{
      expect(request.headers['Authorization'],'Bearer contract-token');
      requests.add(Map<String,dynamic>.from(jsonDecode(request.body) as Map));
      return http.Response(jsonEncode({'ok':true}),200);
    }));
    addTearDown(api.dispose);
    await api.adminCreatePlan({'name':'Test','priceUsd':0});expect(requests.last['action'],'upsertPlan');
    await api.adminUpdatePlan('plan',{'name':'Changed','priceUsd':0});expect(requests.last['action'],'upsertPlan');expect(requests.last['planId'],'plan');
    await api.updateUserRole(targetUid:'target',role:'conference_admin',adminNodeId:'conference');
    expect(requests.last['action'],'update');expect(requests.last['uid'],'target');expect(requests.last['adminNodeType'],'conference');expect(requests.last.containsKey('targetUid'),false);
    await api.reviewGraduation(requestId:'request',decision:'approve');expect(requests.last['action'],'decision');
    await api.joinInstitution('org');expect(requests.last['action'],'joinInstitution');expect(user.refreshed,true);
    await api.mentorAssignCandidate(studentId:'student',mentorId:'mentor');expect(requests.last['action'],'assign');
  });
  test('graduation queue reads the scoped content API and includes every pending stage',()async{
    final api=VopApi(auth:TestAuth(TestUser()),apiBaseUrl:'https://vop-test.invalid',connectivity:const Stream<List<ConnectivityResult>>.empty(),client:MockClient((request)async{
      final body=jsonDecode(request.body) as Map;expect(body['collection'],'graduationRequests');expect(body['action'],'list');expect(body['organizationId'],'org');
      return http.Response(jsonEncode({'ok':true,'items':[{'id':'a','status':'pending_church'},{'id':'b','status':'approved'}]}),200);
    }));
    addTearDown(api.dispose);
    final result=await api.adminGraduations(organizationId:'org',status:'pending');
    expect((result['items'] as List).length,1);expect((result['items'] as List).first['id'],'a');
  });
  test('institution search requests only the selected database page',()async{
    final requests=<Map<String,dynamic>>[];
    final api=VopApi(
      auth:TestAuth(TestUser()),
      apiBaseUrl:'https://vop-test.invalid',
      connectivity:const Stream<List<ConnectivityResult>>.empty(),
      client:MockClient((request)async{
        final body=Map<String,dynamic>.from(jsonDecode(request.body) as Map);
        requests.add(body);
        return http.Response(jsonEncode({
          'ok':true,'items':[],'hasMore':true,'nextCursor':'org_40',
        }),200);
      }),
    );
    addTearDown(api.dispose);
    final first=await api.publicOrganizations(search:'kitwe',cursor:'');
    expect(first['hasMore'],true);
    expect(requests.length,1);
    expect(requests.first['action'],'publicDirectory');
    expect(requests.first['search'],'kitwe');
    expect(requests.first.containsKey('cursor'),false);
    await api.publicOrganizations(search:'kitwe',cursor:'org_40');
    expect(requests.length,2);
    expect(requests.last['cursor'],'org_40');
  });

}
