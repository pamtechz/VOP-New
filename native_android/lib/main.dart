import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';

import 'core/config.dart';
import 'core/vop_api.dart';
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
    const navy = Color(0xFF102F71);
    const gold = Color(0xFFE8B536);
    return MaterialApp(
      title: 'Voice of Prophecy',
      debugShowCheckedModeBanner: false,
      themeMode: ThemeMode.system,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: navy,
          primary: navy,
          secondary: gold,
          surface: const Color(0xFFF9FBFE),
        ),
        useMaterial3: true,
        appBarTheme: const AppBarTheme(
          centerTitle: false,
          scrolledUnderElevation: 1,
          backgroundColor: Color(0xFFF9FBFE),
          foregroundColor: navy,
        ),
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(),
          contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        ),
      ),
      darkTheme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: navy,brightness: Brightness.dark),
        useMaterial3: true,
      ),
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
