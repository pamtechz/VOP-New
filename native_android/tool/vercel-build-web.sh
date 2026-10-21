#!/usr/bin/env bash
# Build ONLY the independent Flutter web client; do not deploy the Vite site.
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Reviewed, immutable Flutter SDK tag. Do not run a floating stable branch.
readonly flutter_version="3.47.6"
readonly flutter_sha="5fc346839b5d0eef006ed8404392afb4dfae428d"
readonly sdk_dir="${TMPDIR:-/tmp}/vop-flutter-${flutter_version}"

if [[ ! -x "${sdk_dir}/bin/flutter" ]]; then
  git clone --quiet --depth 1 --branch "${flutter_version}" \
    https://github.com/flutter/flutter.git "${sdk_dir}"
fi
actual_sha="$(git -C "${sdk_dir}" rev-parse HEAD)"
if [[ "${actual_sha}" != "${flutter_sha}" ]]; then
  echo "Flutter SDK provenance mismatch; refusing to build." >&2
  exit 1
fi
export PATH="${sdk_dir}/bin:${PATH}"
export CI=true

# The web scaffold is generated at build time; checked-in web/index.html and
# the reviewed passkeys SDK must remain unchanged.
flutter --version
flutter config --enable-web
flutter create --platforms=web --org com.sda --project-name vop .
flutter pub get --enforce-lockfile
flutter build web --release --no-pub \
  --dart-define-from-file=config/web-public.json

test -s build/web/index.html
test -s build/web/main.dart.js
test -s build/web/flutter_bootstrap.js
test -s build/web/passkeys-bundle.js
if ! grep -q 'passkeys-bundle.js' build/web/index.html; then
  echo "Passkeys SDK is absent from the Flutter web entry point." >&2
  exit 1
fi
echo "VOP Flutter web build is ready in native_android/build/web"
