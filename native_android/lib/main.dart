import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';

import 'core/config.dart';
import 'core/vop_api.dart';
import 'core/vop_i18n.dart';
import 'theme/vop_theme.dart';
import 'screens/auth_screen.dart';
import 'screens/home_shell.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (VopConfig.error == null) {
    await Firebase.initializeApp(options: VopConfig.firebaseOptions);
  }
  runApp(const VopAndroidApp());
}

class VopAndroidApp extends StatelessWidget {
  const VopAndroidApp({super.key});

  @override
  Widget build(BuildContext context) {
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
              textDirection:VopI18n.direction=='rtl'
                ?TextDirection.rtl:TextDirection.ltr,
              child:child??const SizedBox.shrink()),
          ),
        ),
      ),
      theme: VopTheme.build(Brightness.light,highContrast:contrast),
      darkTheme: VopTheme.build(Brightness.dark,highContrast:contrast),
      home: VopConfig.error != null
          ? Scaffold(
              appBar: AppBar(title: const Text('Configuration required')),
              body: Center(
                child: Padding(
                  padding: const EdgeInsets.all(28),
                  child: Text(VopConfig.error!, textAlign: TextAlign.center),
                ),
              ),
            )
          : StreamBuilder<User?>(
              stream: FirebaseAuth.instance.authStateChanges(),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Scaffold(
                    body: Center(child: CircularProgressIndicator()),
                  );
                }
                if (!snapshot.hasData) return const AuthScreen();
                return HomeShell(key: ValueKey(snapshot.data!.uid), api: VopApi());
              },
            ),
    ))));
  }
}
