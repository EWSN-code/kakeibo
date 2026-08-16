#!/usr/bin/env python3
from pathlib import Path
import json, hashlib
ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / "src/app/manifest.json").read_text())
content = "".join((ROOT / "src/app" / p["file"]).read_text() for p in manifest["parts"])
(ROOT / manifest["bundle"]).write_text(content)
print("[OK] rebuilt", manifest["bundle"], "sha256", hashlib.sha256(content.encode()).hexdigest())
