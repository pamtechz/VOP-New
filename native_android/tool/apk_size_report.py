"""Inspect real APK ZIP members without changing signed artifacts."""
import json
import argparse
import zipfile
from pathlib import Path


def inspect_apk(path):
    with zipfile.ZipFile(path) as archive:
        native = [item for item in archive.infolist()
                  if item.filename.startswith("lib/") and item.filename.endswith(".so")]
        entries = sorted(({
            "path": item.filename, "compressed_bytes": item.compress_size,
            "uncompressed_bytes": item.file_size,
            "compression_method": item.compress_type,
        } for item in archive.infolist() if not item.is_dir()),
            key=lambda item: item["compressed_bytes"], reverse=True)
    return {"apk": path.name, "bytes": path.stat().st_size,
            "limit_bytes": 8_000_000, "within_budget": path.stat().st_size <= 8_000_000,
            "native_libraries_compressed": bool(native) and all(
                item.compress_type == zipfile.ZIP_DEFLATED for item in native),
            "largest_entries": entries[:20]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--require-compressed-native", action="store_true")
    args = parser.parse_args()
    directory = args.directory
    paths = sorted(directory.glob("app-*-release.apk"))
    if not paths:
        raise SystemExit("No processor-specific release APKs found.")
    report = [inspect_apk(path) for path in paths]
    (directory / "apk-size-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    for item in report:
        print(json.dumps(item), flush=True)
    if args.require_compressed_native and any(
            not item["native_libraries_compressed"] for item in report):
        raise SystemExit("Native .so libraries were not DEFLATE-compressed in the final APK. "
                         "Check the Gradle APK variant packaging configuration.")
