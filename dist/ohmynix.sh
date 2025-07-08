#!/bin/bash
set -eux

# Argument check
if [ $# -lt 1 ]; then
    echo "Usage: $0 <profile-name> [<stage>]"
    echo "Available profiles: desktop."
    exit 1
fi

PROFILE="$1"
STAGE="${2:-minimal}"
REPO_URL="https://github.com/anasouardini/oh-my-nix"
DEST_DIR="/mnt/oh-my-nix"

# Clone the repo if it doesn't exist
if [ ! -d "$DEST_DIR" ]; then
    git clone "$REPO_URL" "$DEST_DIR"
fi

cd "$DEST_DIR"

# Ensure the profile exists
if [ ! -d "$PROFILE" ]; then
    echo "Profile '$PROFILE' not found in $DEST_DIR"
    exit 1
fi

# Run disko and nixos-install directly, skipping the flake wrapper
nix run github:nix-community/disko -- --mode disko "./$PROFILE/modules/disko.nix"

# Install NixOS with the specified profile (flake)
nixos-install --flake "./$PROFILE#$STAGE" --no-root-password --impure
