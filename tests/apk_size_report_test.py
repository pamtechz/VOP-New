"""Exercise the packaging gate against real APK ZIP members."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile


SCRIPT = Path(__file__).resolve().parents[1] / "native_android/tool/apk_size_report.py"


class ApkSizeReportTest(unittest.TestCase):
    def inspect_fixture(self, method):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            apk = directory / "app-arm64-v8a-release.apk"
            with zipfile.ZipFile(apk, "w", compression=method) as archive:
                archive.writestr("lib/arm64-v8a/libflutter.so", b"native-code" * 2000)
                archive.writestr("assets/content.txt", b"lesson")
            before = hashlib.sha256(apk.read_bytes()).hexdigest()
            result = subprocess.run(
                [sys.executable, str(SCRIPT), str(directory), "--require-compressed-native"],
                capture_output=True, text=True, check=False)
            report = json.loads((directory / "apk-size-report.json").read_text())[0]
            self.assertEqual(before, hashlib.sha256(apk.read_bytes()).hexdigest())
            return result, report

    def test_stored_native_library_fails_but_keeps_measured_report(self):
        result, report = self.inspect_fixture(zipfile.ZIP_STORED)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("not DEFLATE-compressed", result.stderr)
        self.assertFalse(report["native_libraries_compressed"])
        self.assertTrue(report["within_budget"])

    def test_deflated_native_library_passes_without_changing_apk(self):
        result, report = self.inspect_fixture(zipfile.ZIP_DEFLATED)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(report["native_libraries_compressed"])
        entry = next(item for item in report["largest_entries"] if item["path"].endswith(".so"))
        self.assertLess(entry["compressed_bytes"], entry["uncompressed_bytes"])


if __name__ == "__main__":
    unittest.main()
