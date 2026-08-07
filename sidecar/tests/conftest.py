"""Make sidecar modules importable as top-level packages (infer, phenology, lulc)."""

from __future__ import annotations

import sys
from pathlib import Path

SIDECAR_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = SIDECAR_DIR.parent

if str(SIDECAR_DIR) not in sys.path:
    sys.path.insert(0, str(SIDECAR_DIR))
