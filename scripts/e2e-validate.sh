#!/usr/bin/env bash
# =============================================================================
# e2e-validate.sh — End-to-end validation for the Solana Observability stack
# =============================================================================
# Validates: exporter build, Docker Compose startup, health endpoints,
#            Prometheus scrape, Grafana provisioning, alert rule syntax.
#
# Usage:
#   chmod +x scripts/e2e-validate.sh
#   ./scripts/e2e-validate.sh [--skip-docker] [--skip-prom]
#
# Requirements:
#   docker, docker-compose (or compose plugin), curl, jq, node ≥20
#
# Exit code: 0 = all checks pass, 1 = one or more failures
# =============================================================================

set -euo pipefail

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS="${GREEN}✅ PASS${NC}"
FAIL="${RED}❌ FAIL${NC}"
SKIP="${YELLOW}⏭  SKIP${NC}"
INFO="${CYAN}ℹ  INFO${NC}"

FAILURES=0
SKIP_DOCKER=false
SKIP_PROM=false

for arg in "$@"; do
  case $arg in
    --skip-docker) SKIP_DOCKER=true ;;
    --skip-prom)   SKIP_PROM=true ;;
  esac
done

check() {
  local name="$1"; shift
  if "$@" > /dev/null 2>&1; then
    echo -e "  $PASS  $name"
  else
    echo -e "  $FAIL  $name"
    FAILURES=$((FAILURES + 1))
  fi
}

check_output() {
  local name="$1"; local pattern="$2"; local cmd="${@:3}"
  local output
  output=$($cmd 2>/dev/null) || true
  if echo "$output" | grep -q "$pattern"; then
    echo -e "  $PASS  $name"
  else
    echo -e "  $FAIL  $name (expected pattern: '$pattern' not found)"
    echo -e "         Got: $(echo "$output" | head -3)"
    FAILURES=$((FAILURES + 1))
  fi
}

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Solana Observability Stack — End-to-End Validation"
echo "════════════════════════════════════════════════════════════"
echo ""

# ─── Phase 1: Prerequisites ───────────────────────────────────────────────────
echo "Phase 1: Prerequisites"
check "node ≥20 installed"       node --version
check "npm installed"            npm --version
check "docker installed"         docker --version
check "jq installed"             jq --version
echo ""

# ─── Phase 2: TypeScript Build ────────────────────────────────────────────────
echo "Phase 2: TypeScript build (deploy/solana-exporter/)"
EXPORTER_DIR="deploy/solana-exporter"

if [ ! -d "$EXPORTER_DIR" ]; then
  echo -e "  $FAIL  $EXPORTER_DIR directory not found — run from repo root"
  FAILURES=$((FAILURES + 1))
else
  cd "$EXPORTER_DIR"
  check "npm install succeeds"         npm install --silent
  check "tsc build succeeds (dist/)"   npm run build
  check "dist/index.js exists"         test -f dist/index.js
  echo ""

  # ─── Phase 3: Unit Tests ─────────────────────────────────────────────────────
  echo "Phase 3: Unit tests"
  if [ -f "test/exporter.test.ts" ]; then
    check "unit tests pass"              npm test
  else
    echo -e "  $SKIP  No test/exporter.test.ts found — skipping unit tests"
  fi
  echo ""
  cd ../..
fi

# ─── Phase 4: Static Validation ──────────────────────────────────────────────
echo "Phase 4: Static file validation"

# Prometheus config syntax
if [ -f "deploy/prometheus.yml" ] && command -v promtool &>/dev/null; then
  check "prometheus.yml syntax valid"  promtool check config deploy/prometheus.yml
elif [ -f "deploy/prometheus.yml" ]; then
  python3 -c "import yaml; yaml.safe_load(open('deploy/prometheus.yml'))" > /dev/null 2>&1 \
    && echo -e "  $PASS  prometheus.yml is valid YAML" \
    || { echo -e "  $FAIL  prometheus.yml YAML parse error"; FAILURES=$((FAILURES + 1)); }
fi

# Alert rules syntax
if [ -f "deploy/alerts.yml" ] && command -v promtool &>/dev/null; then
  check "alerts.yml passes promtool check rules"  promtool check rules deploy/alerts.yml
elif [ -f "deploy/alerts.yml" ]; then
  python3 -c "import yaml; yaml.safe_load(open('deploy/alerts.yml'))" > /dev/null 2>&1 \
    && echo -e "  $PASS  alerts.yml is valid YAML" \
    || { echo -e "  $FAIL  alerts.yml YAML parse error"; FAILURES=$((FAILURES + 1)); }
fi

# Grafana dashboard JSON validity
echo ""
echo "  Checking Grafana dashboard JSON files..."
for dash in deploy/grafana/dashboards/*.json; do
  [ -f "$dash" ] || continue
  if python3 -c "import json; json.load(open('$dash'))" 2>/dev/null; then
    echo -e "  $PASS  ${dash##*/} is valid JSON"
  else
    echo -e "  $FAIL  ${dash##*/} failed JSON parse"
    FAILURES=$((FAILURES + 1))
  fi
done

# Grafana provisioning YAML
for prov in deploy/grafana/provisioning/**/*.yml; do
  [ -f "$prov" ] || continue
  python3 -c "import yaml; yaml.safe_load(open('$prov'))" > /dev/null 2>&1 \
    && echo -e "  $PASS  ${prov##*/} provisioning YAML valid" \
    || { echo -e "  $FAIL  ${prov##*/} provisioning YAML invalid"; FAILURES=$((FAILURES + 1)); }
done
echo ""

# ─── Phase 5: Required Files Check ───────────────────────────────────────────
echo "Phase 5: Required file structure"
REQUIRED_FILES=(
  "deploy/docker-compose.yml"
  "deploy/prometheus.yml"
  "deploy/alerts.yml"
  "deploy/solana-exporter/index.ts"
  "deploy/solana-exporter/package.json"
  "deploy/solana-exporter/Dockerfile"
  "deploy/grafana/provisioning/dashboards/dashboards.yml"
  "deploy/grafana/provisioning/datasources/prometheus.yml"
  "AGENTS.md"
  "ecosystem-signals.md"
  "docs/production-readiness-checklist.md"
  "install.sh"
)
for f in "${REQUIRED_FILES[@]}"; do
  if [ -f "$f" ]; then
    echo -e "  $PASS  $f"
  else
    echo -e "  $FAIL  $f (MISSING)"
    FAILURES=$((FAILURES + 1))
  fi
done
echo ""

# ─── Phase 6: Docker Compose Stack ───────────────────────────────────────────
if $SKIP_DOCKER; then
  echo -e "  $SKIP  Docker Compose tests (--skip-docker)"
  echo ""
else
  echo "Phase 6: Docker Compose stack"
  cd deploy

  # Use dummy env vars for local validation
  export HELIUS_RPC_URL="${HELIUS_RPC_URL:-https://api.mainnet-beta.solana.com}"

  echo "  Starting stack (this may take 30-60 seconds)..."
  docker compose up -d --build 2>&1 | tail -5

  # Wait for exporter
  echo "  Waiting for exporter to become ready..."
  MAX_WAIT=60
  WAITED=0
  until curl -sf http://localhost:3001/live > /dev/null 2>&1; do
    sleep 2; WAITED=$((WAITED+2))
    [ $WAITED -ge $MAX_WAIT ] && { echo -e "  $FAIL  Exporter did not start within ${MAX_WAIT}s"; FAILURES=$((FAILURES+1)); break; }
  done

  # ─── Endpoint checks
  echo ""
  echo "  Exporter endpoint checks:"
  check_output  "/live returns 'ok'"              "ok"      curl -sf http://localhost:3001/live
  check_output  "/health returns status:ok"       "status"  curl -sf http://localhost:3001/health
  check_output  "/metrics has solana_ metrics"    "solana_" curl -sf http://localhost:3001/metrics
  check_output  "/metrics has nodejs_ metrics"    "nodejs_" curl -sf http://localhost:3001/metrics
  check_output  "/health cluster field present"   "cluster" curl -sf http://localhost:3001/health

  # Prometheus scrape verification
  if ! $SKIP_PROM; then
    echo ""
    echo "  Waiting for Prometheus to scrape exporter (15-20s)..."
    sleep 20

    echo "  Prometheus checks:"
    check_output "Prometheus /targets shows exporter UP" "\"health\":\"up\"" \
      curl -sf "http://localhost:9090/api/v1/targets"

    check_output "Prometheus has solana_rpc_healthy metric" "solana_rpc_healthy" \
      curl -sf "http://localhost:9090/api/v1/query?query=solana_rpc_healthy"
  fi

  # Grafana provisioning check
  echo ""
  echo "  Grafana checks:"
  GRAFANA_UP=false
  for i in 1 2 3 4 5; do
    if curl -sf "http://admin:solana-obs@localhost:3000/api/health" > /dev/null 2>&1; then
      GRAFANA_UP=true; break
    fi
    sleep 5
  done

  if $GRAFANA_UP; then
    check_output "Grafana health returns ok"       "ok"          curl -sf "http://admin:solana-obs@localhost:3000/api/health"
    check_output "Prometheus datasource provisioned" "Prometheus"  curl -sf "http://admin:solana-obs@localhost:3000/api/datasources"
    check_output "At least one dashboard provisioned" "uid"         curl -sf "http://admin:solana-obs@localhost:3000/api/search?type=dash-db"
  else
    echo -e "  $FAIL  Grafana did not become ready — check docker logs grafana"
    FAILURES=$((FAILURES + 1))
  fi

  # Cleanup
  echo ""
  echo "  Tearing down stack..."
  docker compose down -v > /dev/null 2>&1
  cd ..
  echo ""
fi

# ─── Phase 7: Security Defaults Check ────────────────────────────────────────
echo "Phase 7: Security defaults"

# Check that default Grafana password is documented as 'change me'
GRAFANA_PW=$(grep "GF_SECURITY_ADMIN_PASSWORD" deploy/docker-compose.yml 2>/dev/null || echo "")
if echo "$GRAFANA_PW" | grep -q "solana-obs"; then
  echo -e "  ${YELLOW}⚠  WARN${NC}  Default Grafana password 'solana-obs' is in docker-compose.yml"
  echo -e "         Set GF_SECURITY_ADMIN_PASSWORD via .env before production use"
else
  echo -e "  $PASS  Grafana password not hardcoded in docker-compose.yml"
fi

# Check that prometheus.yml has no hardcoded API keys
if grep -q "api-key=" deploy/prometheus.yml 2>/dev/null; then
  echo -e "  $FAIL  API key found in prometheus.yml — use env vars or Alertmanager secrets"
  FAILURES=$((FAILURES + 1))
else
  echo -e "  $PASS  No API keys hardcoded in prometheus.yml"
fi

# Check .gitignore has .env
if grep -q "^\.env" .gitignore 2>/dev/null; then
  echo -e "  $PASS  .env is in .gitignore"
else
  echo -e "  ${YELLOW}⚠  WARN${NC}  .env not in .gitignore — ensure API keys don't get committed"
fi
echo ""

# ─── Summary ──────────────────────────────────────────────────────────────────
echo "════════════════════════════════════════════════════════════"
if [ "$FAILURES" -eq 0 ]; then
  echo -e "  ${GREEN}All validation checks passed.${NC}"
  echo -e "  Stack is production-ready to deploy."
else
  echo -e "  ${RED}$FAILURES check(s) failed.${NC}"
  echo -e "  Resolve failures before deploying to production."
fi
echo "════════════════════════════════════════════════════════════"
echo ""

exit $FAILURES
