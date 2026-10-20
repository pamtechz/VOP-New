import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
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
  final _name = TextEditingController();
  final _confirmPassword = TextEditingController();
  final _phone = TextEditingController();
  final _form = GlobalKey<FormState>();
  bool _isSignUp = false;
  bool _busy = false;
  bool _hidePassword = true;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _name.dispose();
    _confirmPassword.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _signIn() async {
    if (!_form.currentState!.validate()) return;
    setState(() { _busy = true; _error = null; });
    try {
      await FirebaseAuth.instance.signInWithEmailAndPassword(
        email: _email.text.trim(),
        password: _password.text,
      );
    } on FirebaseAuthException catch (error) {
      if (mounted) {
        setState(() => _error = switch (error.code) {
          'invalid-email' => 'Enter a valid email address.',
          'invalid-credential' || 'wrong-password' || 'user-not-found' =>
            'The email or password is incorrect.',
          'too-many-requests' => 'Too many attempts. Please try again later.',
          _ => error.message ?? 'Sign-in could not be completed.',
        });
      }
    } catch (_) {
      if (mounted) setState(() => _error = 'Could not connect to VOP.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _signUp() async {
    if (!_form.currentState!.validate()) return;
    final pwd = _password.text;
    final confirm = _confirmPassword.text;
    if (pwd != confirm) {
      setState(() => _error = 'Passwords do not match.');
      return;
    }
    setState(() { _busy = true; _error = null; });
    try {
      final cred = await FirebaseAuth.instance.createUserWithEmailAndPassword(
        email: _email.text.trim(),
        password: pwd,
      );
      final fullName = _name.text.trim();
      if (fullName.isNotEmpty && cred.user != null) {
        await cred.user!.updateDisplayName(fullName).catchError((_) {});
      }
    } on FirebaseAuthException catch (error) {
      if (mounted) {
        setState(() => _error = switch (error.code) {
          'email-already-in-use' => 'An account already exists with this email. Please sign in.',
          'invalid-email' => 'Enter a valid email address.',
          'weak-password' => 'Password should be at least 6 characters long.',
          _ => error.message ?? 'Account creation could not be completed.',
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = 'Could not create account: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _signInWithPasskey()async{
    setState((){_busy=true;_error=null;});
    try{
      await VopPasskeys().signIn();
    }catch(e){
      if (mounted) {
        setState(()=>_error=e.toString().replaceFirst('Bad state: ',''));
      }
    }finally{
      if (mounted) {
        setState(()=>_busy=false);
      }
    }
  }

  Future<void> _forgotPassword() async {
    final emailCtrl = TextEditingController(text: _email.text.trim());
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Reset password'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Enter your registered email address to receive a secure password-reset link.',
            ),
            const SizedBox(height: 12),
            TextField(
              controller: emailCtrl,
              keyboardType: TextInputType.emailAddress,
              autofocus: true,
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.email_outlined),
                labelText: 'Email address',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Send Reset Link'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    final address = emailCtrl.text.trim();
    if (address.isEmpty || !address.contains('@')) {
      if (mounted) {
        setState(() => _error = 'Enter a valid email address for password reset.');
      }
      return;
    }
    setState(() { _busy = true; _error = null; });
    try {
      await FirebaseAuth.instance.sendPasswordResetEmail(email: address);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Password reset email sent to $address. Check your inbox.'),
            backgroundColor: Colors.green.shade800,
          ),
        );
      }
    } on FirebaseAuthException catch (e) {
      if (mounted) {
        setState(() => _error = e.message ?? 'Password reset could not be completed.');
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Could not request password reset.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _googleSignIn() async {
    setState(() { _busy = true; _error = null; });
    try {
      if (kIsWeb) {
        final provider = GoogleAuthProvider()..addScope('email')..addScope('profile');
        await FirebaseAuth.instance.signInWithPopup(provider);
        return;
      }
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
      if (mounted) {
        setState(() =>
          _error = error.message ?? 'Google sign-in is unavailable.');
      }
    } catch (_) {
      if (mounted) {
        setState(() =>
          _error = kIsWeb ? 'Google sign-in requires a Firebase-authorized browser origin.' :
              'Google sign-in needs Android OAuth configuration.');
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('VOP', textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                    fontWeight: FontWeight.w900, letterSpacing: 1.6,
                    color: Theme.of(context).colorScheme.primary)),
                const SizedBox(height: 4),
                Text('VOICE OF PROPHECY', textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    letterSpacing: 1.8, fontWeight: FontWeight.w700)),
                const SizedBox(height: 20),
                SegmentedButton<bool>(
                  segments: const [
                    ButtonSegment<bool>(
                      value: false,
                      label: Text('Sign In'),
                      icon: Icon(Icons.login),
                    ),
                    ButtonSegment<bool>(
                      value: true,
                      label: Text('Create Account'),
                      icon: Icon(Icons.person_add_alt),
                    ),
                  ],
                  selected: {_isSignUp},
                  onSelectionChanged: (selection) {
                    setState(() {
                      _isSignUp = selection.first;
                      _error = null;
                    });
                  },
                ),
                const SizedBox(height: 18),
                Text(
                  _isSignUp
                      ? 'Create your free learner account'
                      : 'Sign in to continue studying',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                ),
                Text(
                  _isSignUp
                      ? 'Discover biblical truth and study at your own pace.'
                      : 'Welcome back to your Bible study home.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12.5, color: Theme.of(context).colorScheme.onSurface.withAlpha(160)),
                ),
                const SizedBox(height: 20),
                Form(
                  key: _form,
                  child: Column(children: [
                    if (_isSignUp) ...[
                      TextFormField(
                        controller: _name,
                        textInputAction: TextInputAction.next,
                        keyboardType: TextInputType.name,
                        decoration: const InputDecoration(
                          prefixIcon: Icon(Icons.person_outline),
                          labelText: 'Full Name *',
                        ),
                        validator: (text) => text == null || text.trim().length < 2
                            ? 'Enter your name (at least 2 letters).'
                            : null,
                      ),
                      const SizedBox(height: 14),
                    ],
                    TextFormField(
                      controller: _email,
                      textInputAction: TextInputAction.next,
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      decoration: const InputDecoration(
                        prefixIcon: Icon(Icons.email_outlined),
                        labelText: 'Email address *',
                      ),
                      validator: (text) => text == null || !text.contains('@')
                          ? 'Enter a valid email address.'
                          : null,
                    ),
                    if (_isSignUp) ...[
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _phone,
                        textInputAction: TextInputAction.next,
                        keyboardType: TextInputType.phone,
                        decoration: const InputDecoration(
                          prefixIcon: Icon(Icons.phone_outlined),
                          labelText: 'Phone number (optional)',
                        ),
                      ),
                    ],
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _password,
                      obscureText: _hidePassword,
                      textInputAction: _isSignUp ? TextInputAction.next : TextInputAction.done,
                      decoration: InputDecoration(
                        prefixIcon: const Icon(Icons.lock_outline),
                        labelText: 'Password *',
                        suffixIcon: IconButton(
                          tooltip: _hidePassword ? 'Show password' : 'Hide password',
                          icon: Icon(_hidePassword ? Icons.visibility_outlined
                                                 : Icons.visibility_off_outlined),
                          onPressed: () => setState(() => _hidePassword = !_hidePassword),
                        ),
                      ),
                      validator: (text) => text == null || text.length < 6
                          ? 'Password must contain at least 6 characters.'
                          : null,
                      onFieldSubmitted: (_) {
                        if (!_busy && !_isSignUp) _signIn();
                      },
                    ),
                    if (_isSignUp) ...[
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _confirmPassword,
                        obscureText: _hidePassword,
                        textInputAction: TextInputAction.done,
                        decoration: const InputDecoration(
                          prefixIcon: Icon(Icons.lock_reset_outlined),
                          labelText: 'Confirm Password *',
                        ),
                        validator: (text) {
                          if (text == null || text.isEmpty) return 'Confirm your password.';
                          if (text != _password.text) return 'Passwords do not match.';
                          return null;
                        },
                        onFieldSubmitted: (_) {
                          if (!_busy) _signUp();
                        },
                      ),
                    ],
                    if (!_isSignUp)
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton(
                          onPressed: _busy ? null : _forgotPassword,
                          style: TextButton.styleFrom(
                            visualDensity: VisualDensity.compact,
                            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                          ),
                          child: const Text('Forgot password?', style: TextStyle(fontSize: 12.5)),
                        ),
                      ),
                  ]),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.errorContainer.withAlpha(120),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      _error!,
                      style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 13),
                    ),
                  ),
                ],
                const SizedBox(height: 18),
                FilledButton(
                  onPressed: _busy ? null : (_isSignUp ? _signUp : _signIn),
                  child: Padding(
                    padding: const EdgeInsets.all(13),
                    child: _busy
                        ? const SizedBox(height: 22, width: 22,
                            child: CircularProgressIndicator(strokeWidth: 2))
                        : Text(_isSignUp ? 'Create Account & Begin Studying' : 'Sign in'),
                  ),
                ),
                const SizedBox(height: 14),
                OutlinedButton.icon(
                  onPressed: _busy ? null : _googleSignIn,
                  icon: const Icon(Icons.login_rounded),
                  label: Text(_isSignUp ? 'Sign up with Google' : 'Continue with Google'),
                ),
                if (!kIsWeb) const SizedBox(height: 12),
                if (!kIsWeb) OutlinedButton.icon(
                  onPressed: _busy ? null : _signInWithPasskey,
                  icon: const Icon(Icons.fingerprint_outlined),
                  label: const Text('Continue with passkey'),
                ),
                const SizedBox(height: 16),
                Center(
                  child: TextButton(
                    onPressed: _busy ? null : () => setState(() {
                      _isSignUp = !_isSignUp;
                      _error = null;
                    }),
                    child: Text(
                      _isSignUp
                          ? 'Already have an account? Sign In'
                          : 'Looking to study the Word of God? Create Account',
                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Voice of Prophecy is open to all seekers of truth. You can join your '
                  'local church congregation or study freely via our public access ministry.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 11.5, color: Colors.grey),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}
