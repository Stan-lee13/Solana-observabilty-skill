#!/bin/bash

# Solana Observability Skill — Standard Installer
# Installs with recommended defaults. Sets up monitoring skills for Claude Code.

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$SCRIPT_DIR/skill"

# Standard defaults
SKILLS_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
OBS_SKILL_PATH="$SKILLS_DIR/solana-observability"
CORE_SKILL_PATH="$SKILLS_DIR/solana-dev"
CLAUDE_MD_PATH="$HOME/.claude/CLAUDE.md"

print_banner() {
    echo ""
    echo -e "${MAGENTA}╔═══════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${MAGENTA}║${NC}                                                                       ${MAGENTA}║${NC}"
    echo -e "${MAGENTA}║${NC}   ${CYAN} ██████╗ ${GREEN}███████╗${YELLOW}██╗      ${RED}      ${BLUE} ██████╗ ${MAGENTA} ██████╗ ${WHITE}██╗   ██╗${NC}        ${MAGENTA}║${NC}"
    echo -e "${MAGENTA}║${NC}   ${CYAN}██╔═══██╗${GREEN}██╔════╝${YELLOW}██║      ${RED}      ${BLUE}██╔═══██╗${MAGENTA}██╔═══██╗${WHITE}╚██╗ ██╔╝${NC}        ${MAGENTA}║${NC}"
    echo -e "${MAGENTA}║${NC}   ${CYAN}██║   ██║${GREEN}███████╗${YELLOW}██║      ${RED}█████╗${BLUE}██║   ██║${MAGENTA}██║   ██║${WHITE} ╚████╔╝ ${NC}        ${MAGENTA}║${NC}"
    echo -e "${MAGENTA}║${NC}   ${CYAN}██║   ██║${GREEN}╚════██║${YELLOW}██║      ${RED}╚════╝${BLUE}██║   ██║${MAGENTA}██║   ██║${WHITE}  ╚██╔╝  ${NC}        ${MAGENTA}║${NC}"
    echo -e "${MAGENTA}║${NC}   ${CYAN}╚██████╔╝${GREEN}███████║${YELLOW}███████╗${RED}      ${BLUE}╚██████╔╝${MAGENTA}╚██████╔╝${WHITE}   ██║   ${NC}        ${MAGENTA}║${NC}"
    echo -e "${MAGENTA}║${NC}   ${CYAN} ╚═════╝ ${GREEN}╚══════╝${YELLOW}╚══════╝${RED}      ${BLUE} ╚═════╝ ${MAGENTA} ╚═════╝ ${WHITE}   ╚═╝   ${NC}        ${MAGENTA}║${NC}"
    echo -e "${MAGENTA}║${NC}                                                                       ${MAGENTA}║${NC}"
    echo -e "${MAGENTA}║${NC}   ${WHITE}Solana Observability Skill for Claude Code${NC}                        ${MAGENTA}║${NC}"
    echo -e "${MAGENTA}║${NC}   ${CYAN}Production monitoring, alerting & operational intelligence${NC}        ${MAGENTA}║${NC}"
    echo -e "${MAGENTA}║${NC}                                                                       ${MAGENTA}║${NC}"
    echo -e "${MAGENTA}╚═══════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_help() {
    echo "Solana Observability Skill — Installer"
    echo ""
    echo "Usage: ./install.sh [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -y, --yes          Skip confirmation prompt"
    echo "  -d, --dir <path>   Custom skills directory (default: ~/.claude/skills)"
    echo "  -h, --help         Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  CLAUDE_SKILLS_DIR  Override default skills directory"
    echo ""
}

# Parse arguments
SKIP_CONFIRM=false
while [[ $# -gt 0 ]]; do
    case $1 in
        -y|--yes)
            SKIP_CONFIRM=true
            shift
            ;;
        -d|--dir)
            SKILLS_DIR="$2"
            OBS_SKILL_PATH="$SKILLS_DIR/solana-observability"
            shift 2
            ;;
        -h|--help)
            print_help
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Main
print_banner

echo -e "${WHITE}Installation Summary${NC}"
echo ""
echo -e "  ${BLUE}Target:${NC} ${CYAN}$OBS_SKILL_PATH${NC}"
echo ""
echo -e "  ${BLUE}Components:${NC}"
echo -e "    ${GREEN}•${NC} skill/          — Main observability skill files"
echo -e "    ${GREEN}•${NC} agents/         — Specialized agent definitions"
echo -e "    ${GREEN}•${NC} commands/       — Workflow commands"
echo -e "    ${GREEN}•${NC} rules/          — Auto-loading monitoring rules"
echo -e "    ${GREEN}•${NC} CLAUDE.md       — Claude configuration"
echo -e "    ${GREEN}•${NC} deploy/         — Local Prometheus/Grafana/exporter stack"
echo -e "    ${GREEN}•${NC} runbooks/       — Production incident runbooks"
echo -e "    ${GREEN}•${NC} docs/           — Governance and release checklists"
echo ""

if [ "$SKIP_CONFIRM" = false ]; then
    read -p "Proceed with installation? [Y/n] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        echo -e "${YELLOW}Installation cancelled${NC}"
        exit 0
    fi
fi

echo ""

# Create directories
mkdir -p "$SKILLS_DIR"
mkdir -p "$HOME/.claude"

# Install skill
echo -e "${CYAN}[1/2]${NC} Installing solana-observability-skill..."

if [ -d "$OBS_SKILL_PATH" ]; then
    echo -e "  ${YELLOW}→${NC} Removing existing installation"
    rm -rf "$OBS_SKILL_PATH"
fi

mkdir -p "$OBS_SKILL_PATH"
for item in "$SOURCE_DIR"/*; do
    basename=$(basename "$item")
    cp -r "$item" "$OBS_SKILL_PATH/"
done
echo -e "  ${GREEN}✓${NC} Skill files installed to $OBS_SKILL_PATH"

# Install agents
echo -e "${CYAN}[2/2]${NC} Installing agents, commands, and rules..."

if [ -d "$SCRIPT_DIR/agents" ]; then
    mkdir -p "$OBS_SKILL_PATH/agents"
    cp -r "$SCRIPT_DIR/agents/"* "$OBS_SKILL_PATH/agents/" 2>/dev/null || true
    echo -e "  ${GREEN}✓${NC} Agents installed"
fi

if [ -d "$SCRIPT_DIR/commands" ]; then
    mkdir -p "$OBS_SKILL_PATH/commands"
    cp -r "$SCRIPT_DIR/commands/"* "$OBS_SKILL_PATH/commands/" 2>/dev/null || true
    echo -e "  ${GREEN}✓${NC} Commands installed"
fi

if [ -d "$SCRIPT_DIR/rules" ]; then
    mkdir -p "$OBS_SKILL_PATH/rules"
    cp -r "$SCRIPT_DIR/rules/"* "$OBS_SKILL_PATH/rules/" 2>/dev/null || true
    echo -e "  ${GREEN}✓${NC} Rules installed"
fi

if [ -d "$SCRIPT_DIR/deploy" ]; then
    mkdir -p "$OBS_SKILL_PATH/deploy"
    cp -r "$SCRIPT_DIR/deploy/"* "$OBS_SKILL_PATH/deploy/" 2>/dev/null || true
    echo -e "  ${GREEN}✓${NC} Deploy stack installed"
fi

if [ -d "$SCRIPT_DIR/runbooks" ]; then
    mkdir -p "$OBS_SKILL_PATH/runbooks"
    cp -r "$SCRIPT_DIR/runbooks/"* "$OBS_SKILL_PATH/runbooks/" 2>/dev/null || true
    echo -e "  ${GREEN}✓${NC} Runbooks installed"
fi

if [ -d "$SCRIPT_DIR/docs" ]; then
    mkdir -p "$OBS_SKILL_PATH/docs"
    cp -r "$SCRIPT_DIR/docs/"* "$OBS_SKILL_PATH/docs/" 2>/dev/null || true
    echo -e "  ${GREEN}✓${NC} Docs installed"
fi

cp "$SCRIPT_DIR/README.md" "$OBS_SKILL_PATH/README.md" 2>/dev/null || true
cp "$SCRIPT_DIR/CLAUDE.md" "$OBS_SKILL_PATH/CLAUDE.md" 2>/dev/null || true
cp "$SCRIPT_DIR/ecosystem-signals.md" "$OBS_SKILL_PATH/ecosystem-signals.md" 2>/dev/null || true

# Done
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}  ${WHITE}Installation Complete!${NC}                                             ${GREEN}║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${WHITE}Installed to:${NC} ${CYAN}$OBS_SKILL_PATH${NC}"
echo ""
echo -e "${CYAN}Try asking Claude:${NC}"
echo -e "  ${BLUE}•${NC} \"Set up health checks for my Solana dApp's RPC endpoints\""
echo -e "  ${BLUE}•${NC} \"Create a Grafana dashboard for my program's CU usage\""
echo -e "  ${BLUE}•${NC} \"Build an alerting system for transaction failures\""
echo -e "  ${BLUE}•${NC} \"Add structured logging with transaction correlation\""
echo -e "  ${BLUE}•${NC} \"Monitor my program for unauthorized upgrades\""
echo ""
echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}            Solana Observability Skill${NC}"
echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
