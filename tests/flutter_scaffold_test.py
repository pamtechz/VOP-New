"""Regression checks for Flutter create's destructive lockfile generation."""

import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    "prepare_scaffold",
    Path(__file__).resolve().parent.parent / "native_android/tool/prepare_scaffold.py",
)
scaffold = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scaffold)


class FlutterScaffoldTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.project = Path(self.temp.name)
        self.reviewed = {
            "pubspec.yaml": b"name: vop\r\ndependencies:\r\n  firebase_auth: ^5.6.2\r\n",
            "pubspec.lock": b"# Reviewed application dependencies\r\npackages: {firebase_auth: {version: '5.7.0'}}\r\n",
        }
        for name, content in self.reviewed.items():
            (self.project / name).write_bytes(content)

    def assert_reviewed_files(self):
        for name, content in self.reviewed.items():
            self.assertEqual((self.project / name).read_bytes(), content, name)

    def simulate_flutter_create(self, command, *, cwd, check):
        self.assertEqual(cwd, self.project)
        self.assertTrue(check)
        self.assertIn("--no-pub", command)
        (cwd / "pubspec.lock").write_text('{"packages":{"collection":{}}}')
        (cwd / "web").mkdir(exist_ok=True)
        (cwd / "web/index.html").write_text("generated platform")

    @patch.object(scaffold.shutil, "which", return_value="flutter")
    def test_sdk_only_lockfile_is_restored_for_both_platforms(self, _which):
        for platform in ("web", "android"):
            with self.subTest(platform=platform):
                with patch.object(scaffold.subprocess, "run", side_effect=self.simulate_flutter_create) as run:
                    scaffold.prepare_scaffold(self.project, platform)
                self.assertIn(f"--platforms={platform}", run.call_args.args[0])
                self.assert_reviewed_files()
                self.assertTrue((self.project / "web/index.html").is_file())

    @patch.object(scaffold.shutil, "which", return_value="flutter")
    def test_failed_generation_restores_files_and_propagates_failure(self, _which):
        def fail(*args, **kwargs):
            self.simulate_flutter_create(*args, **kwargs)
            raise subprocess.CalledProcessError(42, args[0])

        with patch.object(scaffold.subprocess, "run", side_effect=fail):
            with self.assertRaises(subprocess.CalledProcessError) as error:
                scaffold.prepare_scaffold(self.project, "web")
        self.assertEqual(error.exception.returncode, 42)
        self.assert_reviewed_files()

    @patch.object(scaffold.shutil, "which", return_value="flutter")
    def test_pubspec_mutation_is_rejected_and_reverted(self, _which):
        def mutate(*args, **kwargs):
            self.simulate_flutter_create(*args, **kwargs)
            (self.project / "pubspec.yaml").write_text("name: unrelated")

        with patch.object(scaffold.subprocess, "run", side_effect=mutate):
            with self.assertRaisesRegex(RuntimeError, "changed pubspec.yaml"):
                scaffold.prepare_scaffold(self.project, "android")
        self.assert_reviewed_files()

    def test_missing_reviewed_lockfile_fails_before_executing_flutter(self):
        (self.project / "pubspec.lock").unlink()
        with patch.object(scaffold.subprocess, "run") as run:
            with self.assertRaises(FileNotFoundError):
                scaffold.prepare_scaffold(self.project, "web")
            run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
