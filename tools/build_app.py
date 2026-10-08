#!/usr/bin/env python3
from pathlib import Path
import argparse
import hashlib
import json


ROOT = Path(__file__).resolve().parents[1]


def load_bundle():
    manifest_path = ROOT / "src/app/manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    parts = [ROOT / "src/app" / item["file"] for item in manifest["parts"]]
    content = b"".join(part.read_bytes() for part in parts)
    return manifest, ROOT / manifest["bundle"], content


def main(argv=None):
    parser = argparse.ArgumentParser(description="Build app.js from ordered source parts.")
    parser.add_argument(
        "--check",
        action="store_true",
        help="check app.js against the parts and manifest without writing files",
    )
    args = parser.parse_args(argv)

    manifest, output, content = load_bundle()
    digest = hashlib.sha256(content).hexdigest()
    if manifest.get("bundle_sha256") != digest:
        print(
            "[ERROR] manifest bundle_sha256 does not match source parts:",
            digest,
        )
        return 1

    if args.check:
        try:
            current = output.read_bytes()
        except FileNotFoundError:
            current = None
        if current != content:
            print("[ERROR] app.js does not match the ordered source parts")
            return 1
        print("[OK] app.js matches ordered parts; sha256", digest)
        return 0

    output.write_bytes(content)
    print("[OK] rebuilt", manifest["bundle"], "sha256", digest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
