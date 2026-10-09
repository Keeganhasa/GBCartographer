#!/bin/zsh
# Puts GB Cartographer in /Applications (Dock, Spotlight, Launchpad), the Mac twin of scripts/windows/install-shortcut.ps1:
# a copy of the repo's Electron with its own name and icon whose app folder points back at this repo, so it
# always runs the repo's current code (it rebuilds first when the sources are newer than the build). Run it
# again after the repo moves or Electron is updated:   npm run install-mac-app
set -e
ROOT="${0:A:h:h:h}"
DEST="${1:-/Applications}"
ELECTRON="$ROOT/node_modules/electron/dist/Electron.app"
[[ -d "$ELECTRON" ]] || { echo "Run npm install first (no Electron at $ELECTRON)"; exit 1; }
[[ -f "$ROOT/build/icon.png" ]] || npm --prefix "$ROOT" run build-app-icon

ICONSET="$(mktemp -d)/icon.iconset"; mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -z $size $size "$ROOT/build/icon.png" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  sips -z $((size * 2)) $((size * 2)) "$ROOT/build/icon.png" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
ICNS="${ICONSET:h}/icon.icns"; iconutil -c icns "$ICONSET" -o "$ICNS"

install_app() {  # name, bundle id, extra electron argument
  local name="$1" id="$2" arg="$3" app="$DEST/$1.app"
  rm -rf "$app"
  cp -cR "$ELECTRON" "$app"   # -c: a copy-on-write clone on APFS, so no extra disk space
  local plist="$app/Contents/Info.plist"
  /usr/libexec/PlistBuddy -c "Set :CFBundleName $name" -c "Set :CFBundleDisplayName $name" -c "Set :CFBundleIdentifier $id" \
    -c "Set :CFBundleExecutable launch" -c "Set :CFBundleIconFile icon.icns" "$plist" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string $name" -c "Set :CFBundleName $name" -c "Set :CFBundleIdentifier $id" \
         -c "Set :CFBundleExecutable launch" -c "Set :CFBundleIconFile icon.icns" "$plist"
  cp "$ICNS" "$app/Contents/Resources/icon.icns"
  rm -f "$app/Contents/Resources/electron.icns"
  ln -s "$ROOT" "$app/Contents/Resources/app"
  cat > "$app/Contents/MacOS/launch" <<LAUNCH
#!/bin/zsh
ROOT="$ROOT"
HERE="\${0:A:h}"
# Rebuild first when a source file is newer than the build (a login shell finds npm).
if [[ ! -f "\$ROOT/dist/index.html" || -n "\$(find "\$ROOT/src" "\$ROOT/electron" "\$ROOT/scripts" "\$ROOT/public" "\$ROOT/index.html" "\$ROOT/paint.html" -type f -newer "\$ROOT/dist-electron/main.cjs" 2>/dev/null | head -1)" ]]; then
  /bin/zsh -lc "cd '\$ROOT' && npm run desktop:build" >/tmp/gb-cartographer-build.log 2>&1 || true
fi
exec "\$HERE/Electron" $arg
LAUNCH
  chmod +x "$app/Contents/MacOS/launch"
  codesign --force --deep --sign - "$app" >/dev/null 2>&1 || echo "warning: could not re-sign $name"
  touch "$app"
  echo "Installed $app"
}

install_app "GB Cartographer" "io.github.keeganhasa.gbcartographer" ""
