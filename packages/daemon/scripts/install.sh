#!/bin/bash

set -e

TARGET="${1:-}" # Optional target parameter (latest|stable|VERSION)

if [[ -n "$TARGET" ]] && [[ ! "$TARGET" =~ ^(stable|latest|v?[0-9]+\.[0-9]+\.[0-9]+(-[^[:space:]]+)?)$ ]]; then
  echo "Usage: $0 [stable|latest|VERSION]" >&2
  echo "Examples:" >&2
  echo "  $0                # latest release" >&2
  echo "  $0 latest         # latest release" >&2
  echo "  $0 stable         # latest release" >&2
  echo "  $0 0.1.0          # tag v0.1.0" >&2
  echo "  $0 v0.1.0         # tag v0.1.0" >&2
  exit 1
fi

# Repo can be overridden for forks.
NIGHTSHIFT_REPO="${NIGHTSHIFT_REPO:-sipherxyz/nightshift}"
GITHUB_API="${GITHUB_API:-https://api.github.com}"

# Install location (no sudo by default)
INSTALL_DIR="${NIGHTSHIFT_INSTALL_DIR:-$HOME/.nightshift/bin}"
DOWNLOAD_DIR="$(mktemp -d)"
cleanup() { rm -rf "$DOWNLOAD_DIR"; }
trap cleanup EXIT

# Check for required dependencies
DOWNLOADER=""
if command -v curl >/dev/null 2>&1; then
    DOWNLOADER="curl"
elif command -v wget >/dev/null 2>&1; then
    DOWNLOADER="wget"
else
    echo "Either curl or wget is required but neither is installed" >&2
    exit 1
fi

# Check if jq is available (optional)
HAS_JQ=false
if command -v jq >/dev/null 2>&1; then
    HAS_JQ=true
fi

# GitHub API request helper (supports optional GITHUB_TOKEN to avoid rate limits)
github_api_get() {
  local url="$1"
  if [ "$DOWNLOADER" = "curl" ]; then
    if [ -n "${GITHUB_TOKEN:-}" ]; then
      curl -fsSL -H "Accept: application/vnd.github+json" -H "Authorization: Bearer $GITHUB_TOKEN" "$url"
    else
      curl -fsSL -H "Accept: application/vnd.github+json" "$url"
    fi
  elif [ "$DOWNLOADER" = "wget" ]; then
    if [ -n "${GITHUB_TOKEN:-}" ]; then
      wget -q -O - --header="Accept: application/vnd.github+json" --header="Authorization: Bearer $GITHUB_TOKEN" "$url"
    else
      wget -q -O - --header="Accept: application/vnd.github+json" "$url"
    fi
  else
    return 1
  fi
}

download_file() {
  local url="$1"
  local output="$2"
  if [ "$DOWNLOADER" = "curl" ]; then
    curl -fsSL -o "$output" "$url"
  elif [ "$DOWNLOADER" = "wget" ]; then
    wget -q -O "$output" "$url"
  else
    return 1
  fi
}

get_asset_url_from_release() {
  local json="$1"
  local asset_name="$2"

  if [ "$HAS_JQ" = true ]; then
    jq -r --arg name "$asset_name" '.assets[] | select(.name == $name) | .browser_download_url' <<<"$json"
    return 0
  fi

  # Fallback parsing without jq: normalize to one line and extract matching asset block.
  local one
  one=$(echo "$json" | tr -d '\n\r\t')
  # Extract browser_download_url for the object with "name":"asset_name"
  echo "$one" | sed -n "s/.*\"name\":\"${asset_name//\//\\/}\"[^}]*\"browser_download_url\":\"\\([^\"]*\\)\".*/\\1/p"
}

# Detect platform
case "$(uname -s)" in
    Darwin) os="darwin" ;;
    Linux) os="linux" ;;
    *) echo "Windows is not supported" >&2; exit 1 ;;
esac

case "$(uname -m)" in
    x86_64|amd64) arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

# NightShift releases currently provide glibc Linux builds (not musl).
if [ "$os" = "linux" ]; then
  if ldd /bin/ls 2>&1 | grep -q musl; then
    echo "Detected musl-based Linux (e.g., Alpine)." >&2
    echo "NightShift currently ships a glibc Linux binary only (linux-x64)." >&2
    exit 1
  fi
fi

platform="${os}-${arch}"
if [ "$platform" != "darwin-arm64" ] && [ "$platform" != "linux-x64" ]; then
  echo "No NightShift release binary for platform: $platform" >&2
  echo "Supported: darwin-arm64, linux-x64" >&2
  exit 1
fi

# Resolve which release to install
release_url=""
if [ -z "$TARGET" ] || [ "$TARGET" = "latest" ] || [ "$TARGET" = "stable" ]; then
  release_url="$GITHUB_API/repos/$NIGHTSHIFT_REPO/releases/latest"
else
  tag="$TARGET"
  if [[ ! "$tag" =~ ^v ]]; then tag="v$tag"; fi
  release_url="$GITHUB_API/repos/$NIGHTSHIFT_REPO/releases/tags/$tag"
fi

release_json="$(github_api_get "$release_url")"

tag_name=""
if [ "$HAS_JQ" = true ]; then
  tag_name="$(jq -r '.tag_name // empty' <<<"$release_json")"
else
  tag_name="$(echo "$release_json" | tr -d '\n\r\t' | sed -n 's/.*"tag_name":"\([^"]*\)".*/\1/p')"
fi

if [ -z "$tag_name" ]; then
  echo "Could not resolve NightShift release (repo=$NIGHTSHIFT_REPO, target=${TARGET:-latest})." >&2
  exit 1
fi

asset_name="nightshift-$platform"
if [ "$platform" = "windows-x64" ]; then
  asset_name="nightshift-$platform.exe"
fi

checksum_asset="SHA256SUMS"

binary_url="$(get_asset_url_from_release "$release_json" "$asset_name")"
checksums_url="$(get_asset_url_from_release "$release_json" "$checksum_asset")"

if [ -z "$binary_url" ] || [ "$binary_url" = "null" ]; then
  echo "Release $tag_name does not contain asset: $asset_name" >&2
  exit 1
fi
if [ -z "$checksums_url" ] || [ "$checksums_url" = "null" ]; then
  echo "Release $tag_name does not contain asset: $checksum_asset" >&2
  exit 1
fi

echo "Downloading NightShift $tag_name ($asset_name)..."
binary_path="$DOWNLOAD_DIR/$asset_name"
checksums_path="$DOWNLOAD_DIR/$checksum_asset"

download_file "$binary_url" "$binary_path"
download_file "$checksums_url" "$checksums_path"

expected="$(grep "  $asset_name\$" "$checksums_path" | awk '{print $1}')"
if [ -z "$expected" ] || [[ ! "$expected" =~ ^[a-f0-9]{64}$ ]]; then
  echo "Could not find SHA256 for $asset_name in $checksum_asset" >&2
  exit 1
fi

if command -v shasum >/dev/null 2>&1; then
  actual="$(shasum -a 256 "$binary_path" | awk '{print $1}')"
elif command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "$binary_path" | awk '{print $1}')"
else
  echo "Missing checksum tool: install shasum or sha256sum" >&2
  exit 1
fi

if [ "$actual" != "$expected" ]; then
  echo "Checksum verification failed" >&2
  echo "Expected: $expected" >&2
  echo "Actual:   $actual" >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR"
install_path="$INSTALL_DIR/nightshift"

mv "$binary_path" "$install_path"
chmod +x "$install_path"

echo ""
echo "✅ Installed: $install_path"
echo ""

if [ -d "$HOME/.local/bin" ]; then
  ln -sf "$install_path" "$HOME/.local/bin/nightshift"
  echo "Symlinked: $HOME/.local/bin/nightshift"
fi

if command -v nightshift >/dev/null 2>&1; then
  echo ""
  echo "Version:"
  nightshift version || true
else
  echo "Add to PATH (choose one):"
  echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
  echo "  export PATH=\"$HOME/.local/bin:\$PATH\""
fi

echo ""
echo "Next:"
echo "  nightshift start"
