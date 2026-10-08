#!/usr/bin/env python3
from pathlib import Path
import runpy


tool = Path(__file__).resolve().parent / "tools" / "build_app.py"
runpy.run_path(str(tool), run_name="__main__")
