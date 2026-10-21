/// Carries user-entered invitation intent across the Firebase sign-in transition.
/// Membership and roles are applied only by the existing authenticated API.
class PendingInvitation {
  static String token='';
  static String email='';
  static void clear(){token='';email='';}
}
