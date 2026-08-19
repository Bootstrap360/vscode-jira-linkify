#!/bin/bash
# Host-side prep that has to happen BEFORE the container is created.
#
# cwd is the workspace root (devcontainer.json invokes
# `bash .devcontainer/initializeCommand.sh`), which may be a git worktree.
set -e

log() { echo "[initializeCommand] $*"; }

# Stage the host user's .gitconfig (if present) inside ~/repos so it's visible
# in the container via the ~/repos bind mount. postCreateCommand then copies it
# into the container's $HOME so git honours it.
if [ -f ~/.gitconfig ]; then
    cp ~/.gitconfig ~/repos
fi

# --- Claude Code -------------------------------------------------------------
# Pre-create the ~/.claude bind-mount source. This runs as the host user BEFORE
# container create, so the dir ends up user-owned; left to Docker, a missing
# source either fails container create or is auto-created root-owned. Empty and
# harmless for users without Claude.
mkdir -p "$HOME/.claude"

# Record whether this host actually has Claude, so postCreateCommand installs
# the CLI only for Claude users. The signal must be FILE-based: ~/.claude exists
# for everyone because of the mkdir above, so a directory test would
# false-positive on every rebuild.
claude_flag="$PWD/.devcontainer/.claude-enabled"
if [ -f "$HOME/.claude/.credentials.json" ] || [ -f "$HOME/.claude.json" ]; then
    log "Claude found on host, enabling in-container Claude CLI install"
    touch "$claude_flag"
else
    log "No Claude on host, in-container Claude CLI install disabled"
    rm -f "$claude_flag"
fi
