import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';

import 'dart:ui';

import 'core/config.dart';
import 'core/vop_api.dart';
import 'core/vop_i18n.dart';
import 'theme/vop_theme.dart';
import 'screens/auth_screen.dart';
import 'screens/home_shell.dart';

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
      valueListenable:VopAppearance.mode,
      builder:(context,mode,child)=>ValueListenableBuilder<bool>(
        valueListenable:VopAppearance.highContrast,
        builder:(context,contrast,_)=>ValueListenableBuilder<int>(
          valueListenable:VopI18n.revision,
          builder:(context,revision,_)=>MaterialApp(
      title: 'Voice of Prophecy',
      debugShowCheckedModeBanner: false,
      themeMode: mode,
      builder:(context,child)=>ValueListenableBuilder<bool>(
        valueListenable:VopAppearance.largerText,
        builder:(context,large,_)=>ValueListenableBuilder<bool>(
          valueListenable:VopAppearance.reducedMotion,
          builder:(context,reduce,_)=>MediaQuery(
            data:MediaQuery.of(context).copyWith(
              textScaler:TextScaler.linear(large?1.16:1.0),
              disableAnimations:reduce),
            child:Directionality(
              textDirection:VopI18n.direction=='rtl' ?TextDirection.rtl:TextDirection.ltr,
              child:child??const SizedBox.shrink()),
          ),
        ),
      ),
      theme: VopTheme.build(Brightness.light,highContrast:contrast),
      darkTheme: VopTheme.build(Brightness.dark,highContrast:contrast),
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
                if (!snapshot.hasData) return const AuthScreen();
                return _AuthenticatedHome(uid: snapshot.data!.uid);
              },
            ),
    ))));
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

  @override
  void initState() {
    super.initState();
    _api = VopApi();
  }

  @override
  void didUpdateWidget(_AuthenticatedHome oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.uid != widget.uid) {
      _api = VopApi();
    }
  }

  @override
  Widget build(BuildContext context) {
    return HomeShell(key: ValueKey(widget.uid), api: _api);
  }
}
