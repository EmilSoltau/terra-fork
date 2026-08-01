# Installation

TERRA is a desktop app (Wails + React) with a Python sidecar for inference.
Releases ship two flavors:

| Flavor | Download name | Experience |
|--------|---------------|------------|
| **FULL** | `TERRA-*-full.zip` | Unzip and run — embeds Python 3.12 + spectral RF dependencies |
| **LITE** | `TERRA-*-lite.zip` | Smaller UI + models; you provide Python 3.12 |

Both include `sidecar/`, `areas/`, and `model/` next to the app binary.

**FULL** covers spectral Random Forest, MapBiomas LULC, and phenology without a
system Python. Temporal Transformer and Prithvi still need torch — use LITE (or
FULL + override) with [`requirements-prithvi.txt`](../requirements-prithvi.txt).

## Option A — FULL (recommended for most users)

1. Download the **full** asset for your OS from
   [GitHub Releases](https://github.com/rexionmars/TERRA/releases)
   (`TERRA-macOS-arm64-full.zip`, `TERRA-Windows-amd64-full.zip`, or
   `TERRA-Linux-amd64-full.zip`).
2. Unzip and launch (`TERRA.app` / `Terra.exe` / `Terra`).
3. Classify with model **spectral**.

> macOS FULL is **Apple Silicon (arm64)**. Intel Macs should use LITE + a local
> Python, or run from source.

Optional override: set `GEOSENSE_PYTHON` to force a different interpreter even
in FULL builds.

## Option B — LITE (+ system Python)

1. Download the **lite** asset
   (`TERRA-macOS-universal-lite.zip`, `TERRA-Windows-amd64-lite.zip`, or
   `TERRA-Linux-amd64-lite.zip`).
2. Unzip and launch the app.
3. Install the Python sidecar environment (next section) and point TERRA at it
   if needed.

### Python sidecar environment (LITE)

Use Python **3.12**. From a clone of this repository (or any directory where you
keep the env):

```bash
python3.12 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -U pip
pip install -r requirements.txt
```

Optional Prithvi / Temporal Transformer path (large; first Prithvi run also
downloads backbone weights):

```bash
pip install -r requirements-prithvi.txt
```

For unit tests / CI-style checks:

```bash
pip install -r requirements-dev.txt
```

### Pointing TERRA at Python

Resolution order:

1. `GEOSENSE_PYTHON` — absolute path to the interpreter
2. Bundled `python/` inside the app (FULL builds)
3. `.venv` at the parent of the app directory (dev / monorepo layout)
4. `python3` / `python` on `PATH`

Examples:

```bash
export GEOSENSE_PYTHON="$HOME/venvs/terra/bin/python"
# then launch TERRA from the same shell, or set the variable in your desktop
# environment / launch agent
```

On Windows, set a User environment variable `GEOSENSE_PYTHON` to
`C:\path\to\.venv\Scripts\python.exe`.

## Option C — From source (development)

### Dependencies

| Tool | Version |
|------|---------|
| Go | 1.23+ |
| Node.js | 18+ (20 recommended) |
| Python | 3.12 + `requirements.txt` |
| [Wails CLI](https://wails.io) | `go install github.com/wailsapp/wails/v2/cmd/wails@latest` |

Linux builds also need WebKit/GTK development packages (see CI:
`libgtk-3-dev`, `libwebkit2gtk-4.1-dev`).

### Setup

```bash
git clone https://github.com/rexionmars/TERRA.git
cd TERRA
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd frontend && npm ci && cd ..
wails dev
```

Production-style local binary:

```bash
wails build
# then optionally:
scripts/package_release.sh --flavor lite --os darwin --artifact TERRA-local-lite.zip
# or FULL (downloads python-build-standalone):
scripts/package_release.sh --flavor full --os darwin --arch aarch64 --artifact TERRA-local-full.zip
```

### Configuration

| Variable | Purpose |
|----------|---------|
| `GEOSENSE_PYTHON` | Python interpreter for the sidecar |
| `GEOSENSE_APP_DIR` | Directory containing `sidecar/`, `areas/`, `model/` |
| `GEOSENSE_MODEL_DIR` | Override trained model directory (default `model/`) |
| `GEOSENSE_ROOT` | Parent repo root used for legacy MapBiomas paths |

## scikit-learn compatibility

Serialized Random Forest artifacts in `model/` were produced with
**scikit-learn 1.8.x**. Install a matching version (`requirements.txt` pins
`>=1.8,<1.9`) or deserialization may warn or fail. FULL builds install that pin
into the bundled interpreter.

## Next steps

- [User guide](USER_GUIDE.md) — first classification
- [Troubleshooting](TROUBLESHOOTING.md) — common errors
- [Releasing](RELEASING.md) — SemVer / when to tag
- [Contributing](../CONTRIBUTING.md) — tests and PRs
