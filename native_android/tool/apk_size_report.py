"""Inspect real APK ZIP members without changing signed artifacts."""
import json
import sys
import zipfile
from pathlib import Path


def inspect_apk(path):
    with zipfile.ZipFile(path) as archive:
        entries = sorted(({
            "path": item.filename, "compressed_bytes": item.compress_size,
            "uncompressed_bytes": item.file_size,
        } for item in archive.infolist() if not item.is_dir()),
            key=lambda item: item["compressed_bytes"], reverse=True)
    return {"apk": path.name, "bytes": path.stat().st_size,
            "limit_bytes": 8_000_000, "within_budget": path.stat().st_size <= 8_000_000,
            "largest_entries": entries[:20]}


if __name__ == "__main__":
    directory = Path(sys.argv[1])
    paths = sorted(directory.glob("app-*-release.apk"))
    if not paths:
        raise SystemExit("No processor-specific release APKs found.")
    report = [inspect_apk(path) for path in paths]
    (directory / "apk-size-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    for item in report:
        print(json.dumps(item), flush=True)
