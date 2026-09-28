# API recovery — 28 September 2026

Scope: reported admin/localization HTTP 500 responses, local content HTTP 403,
certificate `action=mine` HTTP 400, and Vite WebSocket back-forward-cache notice.

| Finding | Change | Verification/status |
| --- | --- | --- |
| Certificate GET dispatcher read only request body | Read GET action from query | Reproduced live 400; regression reaches authentication |
| Local Vite adapter omitted query | Preserve single and repeated query parameters | Middleware regression |
| Tenant certificate UI requested forbidden platform configuration | Only Super Admin requests platform configuration | Existing API denial retained; build passed |
| English registry uses `eng`, client requests `en` | Derive standard aliases with Intl; load registry before dictionaries | Live registry inspected; alias regression |
| Loading fallback dictionary changed active locale | Separate dictionary fetch from locale activation; bound cycles | Bemba remains selected after English fallback test |
| Firebase Admin manifest and lockfile diverged | Regenerate lockfile for declared 14.5.0 and existing overrides | Clean install and API module load tests |
| Permissions endpoint returned 400 for missing login | Return 401 for missing login | Anonymous gateway regression |

Before these changes, live probes at `vopafrica.vercel.app` showed Bemba
localization returning data, users/content returning 401 when unsigned,
permissions returning 400, and certificate mine returning the wrong 400.
The reported 500s were not reproduced on the current main deployment; earlier
runtime logs were unavailable. Successful unsigned probes do not establish
that authenticated database operations succeed.

`vopapp.org/api/localization` responded from Hostinger with a route-not-found
404. It is not listed among this Vercel project's domains. No DNS or hosting
configuration was changed.

The Vite WebSocket message explicitly reports entry into the browser's
back-forward cache. No application WebSocket workaround was added without
reproducing a failure to reconnect or restore the development page.

Validation: clean npm install, 61 tests, production build, lint (existing
warnings), architecture gate, production dependency audit (zero findings).
Tests use unsigned API requests and mocked locale responses; authenticated
Super Admin and organization sessions still need production verification.

The attached platform-wide completion mission remains open. This repair does
not certify all advertised features, tenant journeys, Firestore rules, or PWA
flows as complete.
