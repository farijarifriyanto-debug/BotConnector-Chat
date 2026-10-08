#!/usr/bin/env bash
# Runs inside the Android emulator job: installs the screenshot build and photographs real screens that need no account.
set -uo pipefail
APK=android/app/build/outputs/apk/release/app-release.apk
PKG=id.botconnector.app
OUT=shots; mkdir -p "$OUT"
adb install -r "$APK" || { echo "install failed"; exit 1; }
adb shell settings put global sysui_demo_allowed 1 || true
demo() { adb shell am broadcast -a com.android.systemui.demo "$@" >/dev/null 2>&1 || true; }
demo -e command enter; demo -e command clock -e hhmm 0941; demo -e command battery -e level 100 -e plugged false
demo -e command network -e wifi show -e level 4; demo -e command network -e mobile show -e level 4 -e datatype none; demo -e command notifications -e visible false
adb shell cmd uimode night yes || true
SEQ=0
scene() { SEQ=$((SEQ+1)); adb shell "run-as $PKG sh -c 'mkdir -p files && echo $SEQ:$1 > files/shot.txt'"; sleep 4; }
snap() { adb exec-out screencap -p > "$OUT/$1.png"; ls -la "$OUT/$1.png" | awk '{print "  saved", $9, $5}'; }
for L in id en; do
  adb shell pm clear $PKG >/dev/null
  adb shell monkey -p $PKG -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
  sleep 25
  scene dark; scene lang-$L; scene guest
  n=1
  for s in home local settings language search; do scene $s; snap "$L-0$n-$s"; n=$((n+1)); done
done
adb shell wm size; adb shell getprop ro.product.model
