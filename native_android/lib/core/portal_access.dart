/// Enumeration of distinct portal workspaces in VOP matching portalAccess.ts.
enum PortalDestination {
  admin,
  organization,
  mentor,
  learner,
}

/// Normalized user profile and institutional tenant metadata.
class VopUserAccount {
  final String uid;
  final String email;
  final String displayName;
  final String role;
  final String organizationId;
  final String organizationName;
  final String organizationRole;
  final String adminNodeType;
  final String adminNodeId;
  final Map<String, dynamic> privileges;
  final Map<String, dynamic> preferences;
  final Map<String, dynamic> information;

  const VopUserAccount({
    required this.uid,
    this.email = '',
    this.displayName = '',
    this.role = 'student',
    this.organizationId = '',
    this.organizationName = '',
    this.organizationRole = '',
    this.adminNodeType = '',
    this.adminNodeId = '',
    this.privileges = const {},
    this.preferences = const {},
    this.information = const {},
  });

  factory VopUserAccount.fromMap(Map<String, dynamic> map, {String fallbackUid = ''}) {
    final uid = (map['uid'] ?? fallbackUid).toString().trim();
    final email = (map['email'] ?? '').toString().trim();
    final displayName = (map['displayName'] ?? map['name'] ?? '').toString().trim();
    final role = (map['role'] ?? 'student').toString().trim().toLowerCase();
    final organizationId = (map['organizationId'] ?? '').toString().trim();
    final organizationName = (map['organizationName'] ?? '').toString().trim();
    final organizationRole = (map['organizationRole'] ?? '').toString().trim().toLowerCase();
    final adminNodeType = (map['adminNodeType'] ?? '').toString().trim().toLowerCase();
    final adminNodeId = (map['adminNodeId'] ?? '').toString().trim();
    final privileges = map['privileges'] is Map ? Map<String, dynamic>.from(map['privileges']) : const <String, dynamic>{};
    final preferences = map['preferences'] is Map ? Map<String, dynamic>.from(map['preferences']) : const <String, dynamic>{};
    final information = map['information'] is Map ? Map<String, dynamic>.from(map['information']) : const <String, dynamic>{};

    return VopUserAccount(
      uid: uid,
      email: email,
      displayName: displayName.isNotEmpty ? displayName : (email.isNotEmpty ? email.split('@').first : 'VOP User'),
      role: role.isNotEmpty ? role : 'student',
      organizationId: organizationId,
      organizationName: organizationName,
      organizationRole: organizationRole,
      adminNodeType: adminNodeType,
      adminNodeId: adminNodeId,
      privileges: privileges,
      preferences: preferences,
      information: information,
    );
  }

  static const adminRoles = {
    'super_admin',
    'union_admin',
    'conference_admin',
    'district_admin',
    'church_admin',
  };

  static const organizationAdminRoles = {
    'owner',
    'admin',
    'editor',
    'teacher',
    'staff',
  };

  static const mentorRoles = {
    'mentor',
  };

  /// True if account has global super administrator privileges.
  bool get isSuperAdmin => role == 'super_admin';

  /// True if account manages a union, conference, district or church hierarchy level.
  bool get isHierarchyAdmin =>
      ['union_admin', 'conference_admin', 'district_admin', 'church_admin'].contains(role);

  /// True if account is bound to an active organization with management or teaching credentials.
  bool get isOrganizationPortalAccount =>
      organizationId.isNotEmpty && organizationAdminRoles.contains(organizationRole);

  /// True if account has administrative portal access (Super Admin, Hierarchy Admin, or Org Admin).
  bool get hasAdminPortalAccess =>
      adminRoles.contains(role) || isOrganizationPortalAccount;

  /// True if account is a tenant mentor.
  bool get hasMentorPortalAccess =>
      organizationId.isNotEmpty && (mentorRoles.contains(role) || mentorRoles.contains(organizationRole));

  /// Server-matching default portal destination based on account role.
  PortalDestination get defaultPortalDestination {
    if (adminRoles.contains(role)) return PortalDestination.admin;
    if (isOrganizationPortalAccount) return PortalDestination.organization;
    if (hasMentorPortalAccess) return PortalDestination.mentor;
    return PortalDestination.learner;
  }

  /// Formatted role string for display in badges and headers.
  String get displayRoleName {
    if (isSuperAdmin) return 'Super Administrator';
    if (isHierarchyAdmin) {
      final formatted = role.replaceAll('_admin', ' Administrator').replaceAll('_', ' ');
      return formatted[0].toUpperCase() + formatted.substring(1);
    }
    if (isOrganizationPortalAccount) {
      final formatted = organizationRole.isNotEmpty
          ? '${organizationRole[0].toUpperCase()}${organizationRole.substring(1)}'
          : 'Staff';
      return 'Organisation $formatted';
    }
    if (hasMentorPortalAccess) return 'Mentor';
    return 'Learner';
  }

  /// Formatted title of the primary portal.
  String get portalTitle {
    if (isSuperAdmin) return 'Platform Administration';
    if (isHierarchyAdmin) {
      final formatted = role.replaceAll('_admin', ' Admin').replaceAll('_', ' ');
      return formatted[0].toUpperCase() + formatted.substring(1);
    }
    if (isOrganizationPortalAccount) {
      if (organizationName.isNotEmpty) return organizationName;
      return 'Organisation Portal';
    }
    if (hasMentorPortalAccess) return 'Mentor Workspace';
    return 'Learner Workspace';
  }
}
