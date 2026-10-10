"""Generate PUBLIC Firebase Android client --dart-define values.
Reads the already committed, package-matched Android google-services.json.
Never reads Firebase service-account credentials, signing keys or tokens.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
source = ROOT / "android/app/google-services.json"
target = ROOT / "native_android/android-public-config.json"
if not source.is_file():
    raise SystemExit("Existing VOP Android Firebase registration was not found.")
raw = json.loads(source.read_text(encoding="utf-8"))
matching = [
    item for item in raw.get("client", [])
    if item.get("client_info", {}).get("android_client_info", {}).get("package_name") == "com.sda.vop"
]
if len(matching) != 1:
    raise SystemExit("Expected exactly one registered Firebase client for com.sda.vop.")
client = matching[0]
oauth = next(
    (item.get("client_id", "") for item in client.get("oauth_client", [])
     if item.get("client_type") == 3),
    "",
)
values = {
    "VOP_API_BASE_URL": os.environ.get("VOP_API_BASE_URL", "https://vopafrica.vercel.app"),
    "VOP_FIREBASE_API_KEY": client["api_key"][0]["current_key"],
    "VOP_FIREBASE_ANDROID_APP_ID": client["client_info"]["mobilesdk_app_id"],
    "VOP_FIREBASE_SENDER_ID": raw["project_info"]["project_number"],
    "VOP_FIREBASE_PROJECT_ID": raw["project_info"]["project_id"],
    "VOP_GOOGLE_WEB_CLIENT_ID": oauth,
}
if not all(values[key] for key in (
    "VOP_API_BASE_URL", "VOP_FIREBASE_API_KEY", "VOP_FIREBASE_ANDROID_APP_ID",
    "VOP_FIREBASE_SENDER_ID", "VOP_FIREBASE_PROJECT_ID",
)):
    raise SystemExit("The existing public Android Firebase configuration is incomplete.")
if not values["VOP_API_BASE_URL"].startswith("https://"):
    raise SystemExit("The mobile API must use an HTTPS origin.")
target.write_text(json.dumps(values, indent=2) + "\n", encoding="utf-8")
try:
    target.chmod(0o600)
except OSError:
    pass
