#!/usr/bin/env bash
# Package two VOP interfaces for one Vercel project, API and browser origin.
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
test -s dist/index.html || { echo "Legacy Vite build is missing." >&2; exit 1; }
VOP_FLUTTER_WEB_BASE_HREF=/classic/ bash native_android/tool/vercel-build-web.sh
mkdir -p dist/classic
cp -R native_android/build/web/. dist/classic/
for asset in index.html flutter_bootstrap.js main.dart.js passkeys-bundle.js manifest.json; do
  test -s "dist/classic/${asset}" || { echo "Missing Classic asset: ${asset}" >&2; exit 1; }
done
grep -q '<base href="/classic/">' dist/classic/index.html || {
  echo "Incorrect Flutter base href. Classic resources would fail to load." >&2; exit 1;
}
test -s dist/index.html
echo "VOP one-project build: Legacy / ; Classic /classic/ ; same-origin /api/"
