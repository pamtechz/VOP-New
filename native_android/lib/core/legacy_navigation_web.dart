import 'dart:js_interop';

@JS('window.location.assign')
external void _assign(JSString destination);

void openLegacy() => _assign('/'.toJS);
