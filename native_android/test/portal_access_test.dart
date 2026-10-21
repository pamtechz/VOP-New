import 'package:flutter_test/flutter_test.dart';
import 'package:vop/core/portal_access.dart';

void main(){
  test('assigned staff and hierarchy roles have dedicated primary portals',(){
    for(final role in VopUserAccount.adminRoles){
      expect(VopUserAccount(uid:'test',role:role).defaultPortalDestination,PortalDestination.admin);
    }
    for(final role in VopUserAccount.organizationAdminRoles){
      expect(VopUserAccount(uid:'test',organizationId:'org',organizationRole:role).defaultPortalDestination,PortalDestination.organization);
    }
    expect(const VopUserAccount(uid:'test').defaultPortalDestination,PortalDestination.learner);
    expect(const VopUserAccount(uid:'test',role:'mentor',organizationId:'org',organizationRole:'mentor').defaultPortalDestination,PortalDestination.mentor);
  });
  test('stale organization roles without tenant membership never open a staff portal',(){
    for(final role in ['owner','admin','teacher','mentor']){
      expect(VopUserAccount(uid:'test',organizationRole:role).defaultPortalDestination,PortalDestination.learner);
    }
  });
}
