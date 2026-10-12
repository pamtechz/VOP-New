import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../core/config.dart';
import '../core/vop_passkeys.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});
  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _form = GlobalKey<FormState>();
  bool _busy = false;
  bool _hidePassword = true;
  String? _error;
  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }
  Future<void> _signIn() async {
    if (!_form.currentState!.validate()) return;
    setState(() { _busy = true; _error = null; });
    try {
      await FirebaseAuth.instance.signInWithEmailAndPassword(
        email: _email.text.trim(),password: _password.text,
      );
    } on FirebaseAuthException catch (error) {
      if (mounted) setState(() => _error = switch (error.code) {
        'invalid-email' => 'Enter a valid email address.',
        'invalid-credential' || 'wrong-password' || 'user-not-found' =>
          'The email or password is incorrect.',
        'too-many-requests' => 'Too many attempts. Please try again later.',
        _ => error.message ?? 'Sign-in could not be completed.',
      });
    } catch (_) {
      if (mounted) setState(() => _error = 'Could not connect to VOP.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
  Future<void> _signInWithPasskey()async{
    setState((){_busy=true;_error=null;});
    try{
      await VopPasskeys().signIn();
    }catch(e){
      if(mounted)setState(()=>_error=e.toString().replaceFirst('Bad state: ',''));
    }finally{
      if(mounted)setState(()=>_busy=false);
    }
  }

  Future<void> _googleSignIn() async {
    setState(() { _busy = true; _error = null; });
    try {
      final google = GoogleSignIn(
        scopes: ['email', 'profile'],
        serverClientId: VopConfig.googleWebClientId.isEmpty
            ? null : VopConfig.googleWebClientId,
      );
      final account = await google.signIn();
      if (account == null) return;
      final tokens = await account.authentication;
      final credential = GoogleAuthProvider.credential(
        accessToken: tokens.accessToken, idToken: tokens.idToken);
      await FirebaseAuth.instance.signInWithCredential(credential);
    } on FirebaseAuthException catch (error) {
      if (mounted) setState(() =>
        _error = error.message ?? 'Google sign-in is unavailable.');
    } catch (_) {
      if (mounted) setState(() =>
        _error = 'Google sign-in needs Android OAuth configuration.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('VOP',textAlign:TextAlign.center,
                  style:Theme.of(context).textTheme.headlineLarge?.copyWith(
                    fontWeight:FontWeight.w900,letterSpacing:1.6,
                    color:Theme.of(context).colorScheme.primary)),
                const SizedBox(height: 4),
                Text('VOICE OF PROPHECY',textAlign:TextAlign.center,
                  style:Theme.of(context).textTheme.labelMedium?.copyWith(
                    letterSpacing:1.8,fontWeight:FontWeight.w700)),
                const SizedBox(height: 20),
                Text('Sign in to continue studying',
                  textAlign:TextAlign.center,style:Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 24),
                Form(
                  key: _form,
                  child: Column(children: [
                    TextFormField(
                      controller: _email,
                      textInputAction: TextInputAction.next,
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      decoration: const InputDecoration(
                        prefixIcon: Icon(Icons.email_outlined),
                        labelText: 'Email address'),
                      validator: (text) => text == null ||
                          !text.contains('@') ? 'Enter your email.' : null,
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _password,
                      obscureText: _hidePassword,
                      decoration: InputDecoration(
                        prefixIcon: const Icon(Icons.lock_outline),
                        labelText: 'Password',
                        suffixIcon: IconButton(
                          tooltip: _hidePassword ? 'Show password' : 'Hide password',
                          icon: Icon(_hidePassword ? Icons.visibility_outlined
                                                 : Icons.visibility_off_outlined),
                          onPressed: () => setState(() => _hidePassword = !_hidePassword),
                        ),
                      ),
                      validator: (text) =>
                        text == null || text.isEmpty ? 'Enter your password.' : null,
                      onFieldSubmitted: (_) { if (!_busy) _signIn(); },
                    ),
                  ]),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!,style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ],
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: _busy ? null : _signIn,
                  child: Padding(
                    padding: const EdgeInsets.all(13),
                    child: _busy ? const SizedBox(height: 22,width: 22,
                      child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Sign in'),
                  ),
                ),
                const SizedBox(height: 14),
                OutlinedButton.icon(
                  onPressed: _busy ? null : _googleSignIn,
                  icon: const Icon(Icons.login_rounded),
                  label: const Text('Continue with Google'),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed:_busy?null:_signInWithPasskey,
                  icon:const Icon(Icons.fingerprint_outlined),
                  label:const Text('Continue with passkey'),
                ),
                const SizedBox(height: 22),
                const Text(
                  'Use your existing VOP account. New accounts and organisation '
                  'invitations continue through the approved onboarding process.',
                  textAlign: TextAlign.center,style: TextStyle(fontSize: 12),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}
