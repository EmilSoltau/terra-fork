# Installation

TERRA is a desktop app (Wails + React) with a Python sidecar for inference.
Prebuilt bundles ship the UI and trained models; **Python 3.12 with the sidecar
dependencies must be available on the machine**.

## Option A — Prebuilt binary (recommended)

1. Download the asset for your OS from
   [GitHub Releases](https://github.com/rexionmars/TERRA/releases)
   (`TERRA-macOS-universal.zip`, `TERRA-Windows-amd64.zip`, or
   `TERRA-Linux-amd64.zip`).
2. Unzip and launch the app (`TERRA.app` / `Terra.exe` / `Terra`).
3. Install the Python sidecar environment (next section) and point TERRA at it
   if needed.

## Python sidecar environment

Use Python **3.12**. From a clone of this repository (or any directory where you
keep the env):

```bash
python3.12 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -U pip
pip install -r requirements.txt
```

Optional Prithvi path (large; first run also downloads backbone weights):

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
2. `.venv/bin/python` at the parent of the app directory (monorepo layout)
3. `python3` on `PATH`

Examples:

```bash
export GEOSENSE_PYTHON="$HOME/venvs/terra/bin/python"
# then launch TERRA from the same shell, or set the variable in your desktop
# environment / launch agent
```

On Windows, set a User environment variable `GEOSENSE_PYTHON` to
`C:\path\to\.venv\Scripts\python.exe`.

## Option B — From source (development)

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
# output under build/bin/
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
`>=1.8,<1.9`) or deserialization may warn or fail.

## Next steps

- [User guide](USER_GUIDE.md) — first classification
- [Troubleshooting](TROUBLESHOOTING.md) — common errors
- [Contributing](../CONTRIBUTING.md) — tests and PRs
