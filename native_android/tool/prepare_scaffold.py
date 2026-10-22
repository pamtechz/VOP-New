"""Generate Flutter platforms without replacing the reviewed dependency files."""

import argparse
from pathlib import Path
import shutil
import subprocess


def prepare_scaffold(project: Path, platform: str) -> None:
    # Flutter 3.47.6's create command unconditionally writes an SDK-only
    # pubspec.lock, even with --no-pub. Restore the application's full lockfile
    # before the caller performs pub get --enforce-lockfile.
    project = project.resolve()
    dependency_files = {
        name: (project / name).read_bytes()
        for name in ("pubspec.yaml", "pubspec.lock")
    }
    flutter = shutil.which("flutter")
    if flutter is None:
        raise FileNotFoundError("Flutter SDK is not on PATH.")
    try:
        subprocess.run(
            [
                flutter,
                "create",
                "--no-pub",
                f"--platforms={platform}",
                "--org",
                "com.sda",
                "--project-name",
                "vop",
                ".",
            ],
            cwd=project,
            check=True,
        )
        if (project / "pubspec.yaml").read_bytes() != dependency_files["pubspec.yaml"]:
            raise RuntimeError("Flutter scaffold changed pubspec.yaml; refusing dependency changes.")
    finally:
        for name, contents in dependency_files.items():
            (project / name).write_bytes(contents)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--platform", choices=("android", "web"), required=True)
    args = parser.parse_args()
    prepare_scaffold(Path(__file__).resolve().parent.parent, args.platform)
