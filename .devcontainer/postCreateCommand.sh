#!/bin/bash
# Runs INSIDE the container once, at container create. cwd is the workspace
# folder (may be a git worktree).
set -e

log() { echo "[postCreateCommand] $*"; }

export PATH="$HOME/.local/bin:$PATH"

# NOTE: no .gitconfig handling here. Dev Containers copies the host's
# ~/.gitconfig into the container itself, so staging our own copy was redundant
# (and looked at $HOME/repos, which does not exist -- see the .my_bashrc note).

# Wire up <host home>/repos/.my_bashrc (bind-mounted from the host) into this
# container's ~/.bashrc so shell aliases (gcm, gpo, etc.) work here too.
#
# HOST_HOME comes from devcontainer.json's remoteEnv and is NOT interchangeable
# with $HOME: remoteUser is `node`, so $HOME is /home/node while the mount lands
# at the host user's home. The path is expanded before being written to .bashrc,
# because HOST_HOME is only set in shells VS Code spawns, not under docker exec.
host_bashrc="${HOST_HOME:-$HOME}/repos/.my_bashrc"
if [ -f "$host_bashrc" ] && ! grep -q '\.my_bashrc' "$HOME/.bashrc"; then
    log "Sourcing $host_bashrc from ~/.bashrc"
    echo "source $host_bashrc" >> "$HOME/.bashrc"
fi

log "Installing npm dependencies"
npm ci

log "Compiling once so out/ exists for F5 debugging"
npm run compile

# --- Claude Code CLI ---------------------------------------------------------
# Installed only when the host has Claude (flag written by initializeCommand.sh
# on the host side). Auth, history and config come in via the ~/.claude mount,
# so no separate login is needed. Install failure is deliberately non-fatal:
# this script runs with `set -e`, and a claude.ai outage must not break
# container creation.
if [ -f "$PWD/.devcontainer/.claude-enabled" ]; then
    if command -v claude > /dev/null 2>&1; then
        log "Claude CLI already installed at $(command -v claude), skipping install"
    else
        log "Installing Claude Code CLI (native installer)"
        if curl -fsSL https://claude.ai/install.sh | bash; then
            log "Claude CLI installed to ~/.local/bin/claude"
        else
            log "WARNING: Claude CLI install failed (network?). Rerun manually: curl -fsSL https://claude.ai/install.sh | bash"
        fi
    fi
else
    log "Claude not detected on host, skipping Claude CLI install"
fi

log "Done. node $(node --version), npm $(npm --version), gh $(gh --version | head -1 | awk '{print $3}')"
