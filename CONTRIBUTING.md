# Contributing to TERRA

Thanks for your interest in improving TERRA. This document covers how to report
issues, request features, and submit code.

## Reporting bugs and asking for support

Use [GitHub Issues](https://github.com/rexionmars/TERRA/issues) for:

- Bugs (include OS, TERRA version or commit, Python version, and the exact error)
- Feature requests
- Questions about installation or usage that are not answered in the docs

Before opening a new issue, search existing issues and check
[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## Development setup

See [docs/INSTALL.md](docs/INSTALL.md) for Go, Node, Wails, and the Python
sidecar environment. In short:

```bash
python3.12 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cd frontend && npm ci && cd ..
wails dev
```

## Pull requests

1. Branch from an up-to-date `main` with a focused name (`feat/…`, `fix/…`, `docs/…`).
2. Keep the PR to one theme; avoid mixing unrelated UI and pipeline changes.
3. Run the automated tests before opening the PR:

```bash
go test ./backend/...
pytest sidecar/tests -q
```

4. Describe the motivation and how you verified the change.
5. Prefer small, reviewable commits with imperative messages
   (e.g. `fix: handle empty STAC results`).

## Code layout

| Path | Role |
|------|------|
| `frontend/` | React UI |
| `app.go`, `backend/` | Wails bindings and Go services |
| `sidecar/` | Python inference pipeline |
| `model/` | Trained classifier artifacts |
| `docs/` | User and developer documentation |

## License

By contributing, you agree that your contributions are licensed under the MIT
License (see [LICENSE](LICENSE)).
