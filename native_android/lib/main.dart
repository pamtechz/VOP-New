import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';

import 'dart:ui';
import 'dart:async';

import 'core/config.dart';
import 'core/portal_access.dart';
import 'core/vop_api.dart';
import 'core/pending_invitation.dart';
import 'core/vop_i18n.dart';
import 'theme/vop_theme.dart';
import 'screens/admin_dashboard_screen.dart';
import 'screens/public_entry_screen.dart';
import 'screens/home_shell.dart';
import 'screens/mentor_workspace_screen.dart';
import 'screens/organization_dashboard_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  PlatformDispatcher.instance.onError = (error, stack) {
    if (error is VopApiException) {
      return true;
    }
    return false;
  };
  String? initError;
  if (VopConfig.error == null) {
    try {
      await Firebase.initializeApp(options: VopConfig.firebaseOptions);
    } catch (e) {
      initError = 'Firebase initialization error: $e';
    }
  }
  runApp(VopAndroidApp(initError: initError));
}

class VopAndroidApp extends StatefulWidget {
  const VopAndroidApp({this.initError, super.key});
  final String? initError;

  @override
  State<VopAndroidApp> createState() => _VopAndroidAppState();
}

class _VopAndroidAppState extends State<VopAndroidApp> {
  Stream<User?>? _authStream;

  @override
  void initState() {
    super.initState();
    final activeError = VopConfig.error ?? widget.initError;
    if (activeError == null) {
      _authStream = FirebaseAuth.instance.authStateChanges();
    }
  }

  @override
  Widget build(BuildContext context) {
    final activeError = VopConfig.error ?? widget.initError;
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: VopAppearance.mode,
      builder: (context, mode, child) => ValueListenableBuilder<bool>(
        valueListenable: VopAppearance.highContrast,
        builder: (context, contrast, _) => ValueListenableBuilder<int>(
          valueListenable: VopI18n.revision,
          builder: (context, revision, _) => MaterialApp(
            title: 'Voice of Prophecy',
            debugShowCheckedModeBanner: false,
            themeMode: mode,
            builder: (context, child) => ValueListenableBuilder<bool>(
              valueListenable: VopAppearance.largerText,
              builder: (context, large, _) => ValueListenableBuilder<bool>(
                valueListenable: VopAppearance.reducedMotion,
                builder: (context, reduce, _) => MediaQuery(
                  data: MediaQuery.of(context).copyWith(
                    textScaler: TextScaler.linear(large ? 1.16 : 1.0),
                    disableAnimations: reduce,
                  ),
                  child: Directionality(
                    textDirection: VopI18n.direction == 'rtl' ? TextDirection.rtl : TextDirection.ltr,
                    child: child ?? const SizedBox.shrink(),
                  ),
                ),
              ),
            ),
            theme: VopTheme.build(Brightness.light, highContrast: contrast),
            darkTheme: VopTheme.build(Brightness.dark, highContrast: contrast),
            home: activeError != null
                ? Scaffold(
                    appBar: AppBar(title: const Text('Configuration required')),
                    body: Center(
                      child: Padding(
                        padding: const EdgeInsets.all(28),
                        child: Text(activeError, textAlign: TextAlign.center),
                      ),
                    ),
                  )
                : StreamBuilder<User?>(
                    initialData: FirebaseAuth.instance.currentUser,
                    stream: _authStream,
                    builder: (context, snapshot) {
                      if (snapshot.connectionState == ConnectionState.waiting &&
                          !snapshot.hasData) {
                        return const Scaffold(
                          body: Center(child: CircularProgressIndicator()),
                        );
                      }
                      if (!snapshot.hasData) return const PublicEntryScreen();
                      return _AuthenticatedHome(uid: snapshot.data!.uid);
                    },
                  ),
          ),
        ),
      ),
    );
  }
}

class _AuthenticatedHome extends StatefulWidget {
  const _AuthenticatedHome({required this.uid});
  final String uid;

  @override
  State<_AuthenticatedHome> createState() => _AuthenticatedHomeState();
}

class _AuthenticatedHomeState extends State<_AuthenticatedHome> {
  late VopApi _api;
  Future<VopUserAccount>? _accountFuture;

  @override
  void initState() {
    super.initState();
    _api = VopApi();
    _resolveAccount();
    unawaited(_restoreAppearance());
  }

  @override
  void didUpdateWidget(_AuthenticatedHome oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.uid != widget.uid) {
      _api.dispose();
      _api = VopApi();
      _resolveAccount();
      unawaited(_restoreAppearance());
    }
  }

  void _resolveAccount() {
    _accountFuture = _fetchAuthoritativeAccount();
  }

  Future<void> _restoreAppearance() async {
    final uid=widget.uid;
    final api=_api;
    try{
      await VopAppearance.restoreTheme(uid);
      if(!mounted||widget.uid!=uid)return;
      final revision=VopAppearance.revision;
      final result=await api.personalSettings();
      final settings=result['settings'] is Map?Map<String,dynamic>.from(result['settings'] as Map):<String,dynamic>{};
      if(!mounted||widget.uid!=uid)return;
      if(revision==VopAppearance.revision)VopAppearance.apply(settings);
      final locale=(settings['uiLocale']??'').toString();
      if(locale.isNotEmpty){final pack=await api.languagePack(locale);if(mounted&&widget.uid==uid)VopI18n.apply(locale,pack);}
    }catch(_){/* Preserve the saved appearance when remote preferences are unavailable. */}
  }

  Future<VopUserAccount> _fetchAuthoritativeAccount() async {
      if(PendingInvitation.token.isNotEmpty){
        final user=FirebaseAuth.instance.currentUser;
        if(user?.uid==widget.uid&&user?.email?.toLowerCase()==PendingInvitation.email){
          await _api.action('/api/admin/organizations',{'action':'acceptInvite','token':PendingInvitation.token});
          await user?.getIdToken(true);
        }
        PendingInvitation.clear();
      }
      final res = await _api.accountProfile();
      final profile = res['profile'] is Map
          ? Map<String, dynamic>.from(res['profile'] as Map)
          : <String, dynamic>{};
      if (profile.isNotEmpty) {
        return VopUserAccount.fromMap(profile, fallbackUid: widget.uid);
      }
    throw const VopApiException('Your account could not be loaded. Please retry.');
  }

  @override
  void dispose() {
    _api.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<VopUserAccount>(
      future: _accountFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            body: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircularProgressIndicator(
                    strokeWidth: 2.5,
                    color: VopColors.gold,
                  ),
                  SizedBox(height: 16),
                  Text(
                    'Loading portal workspace...',
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            ),
          );
        }

        if (snapshot.hasError || !snapshot.hasData) {
          return Scaffold(
            appBar: AppBar(title: const Text('Account unavailable')),
            body: Center(child: Padding(padding: const EdgeInsets.all(24),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text('${snapshot.error ?? "Your account could not be loaded."}', textAlign: TextAlign.center),
                const SizedBox(height: 16),
                FilledButton(onPressed: () => setState(_resolveAccount), child: const Text('Retry')),
                TextButton(onPressed: () => FirebaseAuth.instance.signOut(), child: const Text('Sign out')),
              ]))),
          );
        }
        final account = snapshot.data!;

        // Strict authoritative portal routing matching portalAccess.ts:
        // Admin accounts must only load the admin portal;
        // Organizations accounts must only load the organization portal;
        // Mentors load the mentor portal;
        // Learners load the learner portal.
        switch (account.defaultPortalDestination) {
          case PortalDestination.admin:
            return AdminDashboardScreen(
              key: ValueKey('admin_${widget.uid}'),
              api: _api,
              account: account,
            );
          case PortalDestination.organization:
            return OrganizationDashboardScreen(
              key: ValueKey('org_${widget.uid}'),
              api: _api,
              account: account,
            );
          case PortalDestination.mentor:
            return Scaffold(
              appBar: AppBar(
                title: const Text('Mentor Portal', style: TextStyle(fontWeight: FontWeight.w800)),
                actions: [
                  IconButton(
                    tooltip: 'Sign Out',
                    icon: const Icon(Icons.logout),
                    onPressed: () => FirebaseAuth.instance.signOut(),
                  ),
                ],
              ),
              body: MentorWorkspaceScreen(api: _api),
            );
          case PortalDestination.learner:
            return HomeShell(key: ValueKey('learner_${widget.uid}'), api: _api);
        }
      },
    );
  }
}
