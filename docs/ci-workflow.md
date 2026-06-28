# CI Workflow — Hardened Version

> Replace `.github/workflows/ci.yml` with the content below.
> The current CI only validates markdown, YAML, JSON, and Prometheus rules.
> This version adds TypeScript build, unit tests, structure check, and Docker smoke test.

```yaml
name: CI — Lint, Validate & Test

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  markdown-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm install -g markdownlint-cli@0.33.0
      - run: markdownlint-cli "**/*.md" --ignore node_modules

  yaml-validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: python -m pip install pyyaml
      - name: Validate YAML
        run: |
          python - <<'PY'
          import pathlib, yaml, sys
          failures = []
          for path in sorted(pathlib.Path('.').rglob('*.yml')) + sorted(pathlib.Path('.').rglob('*.yaml')):
              try: yaml.safe_load(path.read_text())
              except Exception as e: print(f'FAIL: {path}: {e}'); failures.append(path)
          sys.exit(1) if failures else print('YAML OK')
          PY

  json-validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          python3 - <<'PY'
          import json, pathlib, sys
          failures = []
          for path in sorted(pathlib.Path('.').rglob('*.json')):
              try: json.loads(path.read_text())
              except Exception as e: print(f'FAIL: {path}: {e}'); failures.append(path)
          sys.exit(1) if failures else print('JSON OK')
          PY

  promtool-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install promtool
        run: |
          TAG=$(curl -s https://api.github.com/repos/prometheus/prometheus/releases/latest | python3 -c "import json,sys; print(json.load(sys.stdin)['tag_name'])")
          curl -sL "https://github.com/prometheus/prometheus/releases/download/${TAG}/prometheus-${TAG#v}.linux-amd64.tar.gz" | tar xz
          mv prometheus-*/promtool /usr/local/bin/promtool
      - run: promtool check config deploy/prometheus.yml
      - run: promtool check rules deploy/alerts.yml

  exporter-build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: deploy/solana-exporter
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: deploy/solana-exporter/package-lock.json
      - run: npm ci
      - run: npm run build
      - run: test -f dist/index.js && echo "Build OK"

  exporter-test:
    runs-on: ubuntu-latest
    needs: exporter-build
    defaults:
      run:
        working-directory: deploy/solana-exporter
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: deploy/solana-exporter/package-lock.json
      - run: npm ci
      - run: npm test

  structure-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          REQUIRED=(
            "AGENTS.md" "CLAUDE.md" "CONTRIBUTING.md" "SECURITY.md"
            "ecosystem-signals.md" "install.sh"
            "deploy/docker-compose.yml" "deploy/prometheus.yml" "deploy/alerts.yml"
            "deploy/solana-exporter/index.ts" "deploy/solana-exporter/package.json"
            "deploy/solana-exporter/Dockerfile"
            "deploy/.env.example"
            "deploy/grafana/provisioning/dashboards/dashboards.yml"
            "deploy/grafana/provisioning/datasources/prometheus.yml"
            "docs/production-readiness-checklist.md"
            "scripts/e2e-validate.sh"
          )
          MISSING=0
          for f in "${REQUIRED[@]}"; do
            [ -f "$f" ] && echo "OK: $f" || { echo "MISSING: $f"; MISSING=$((MISSING+1)); }
          done
          [ $MISSING -eq 0 ] || exit 1

  docker-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build and smoke-test exporter image
        run: |
          docker build -t solana-exporter:ci deploy/solana-exporter
          docker run -d --name test-exporter -p 3001:3001 \
            -e HELIUS_RPC_URL=https://api.mainnet-beta.solana.com \
            solana-exporter:ci
          sleep 15
          curl -sf http://localhost:3001/live | grep -q "ok"         && echo "✅ /live"
          curl -sf http://localhost:3001/health | grep -q "status"   && echo "✅ /health"
          curl -sf http://localhost:3001/metrics | grep -q "solana_" && echo "✅ /metrics"
          docker stop test-exporter
```
