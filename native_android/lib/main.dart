import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';

import 'core/config.dart';
import 'core/vop_api.dart';
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
    return MaterialApp(
      title: 'Voice of Prophecy',
      debugShowCheckedModeBanner: false,
      themeMode: ThemeMode.system,
      theme: VopTheme.build(Brightness.light),
      darkTheme: VopTheme.build(Brightness.dark),
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
    );
  }
}
