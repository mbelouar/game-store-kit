#!/usr/bin/env bash
# Play an Android build on an emulator/device and capture screenshots while playing.
# Usage: capture-android.sh --package com.x.game [--apk app.apk] [--out store-assets/work/raw]
#        [--plan plan.txt] [--duration 90] [--interval 1.5] [--avd <AVD name>]
# plan.txt lines (looped until duration ends; coordinates in device pixels):
#   tap X Y | swipe X1 Y1 X2 Y2 MS | hold X Y MS | key KEYCODE | text abc | wait MS | shot TAG
set -euo pipefail
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
ADB="$(command -v adb || echo "$SDK/platform-tools/adb")"
EMU="$(command -v emulator || echo "$SDK/emulator/emulator")"
PKG=""; APK=""; OUT="${GSK_PROJECT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}/store-assets/work/raw"; PLAN=""; DUR=90; INT=1.5; AVD=""
while [[ $# -gt 0 ]]; do case "$1" in
  --package) PKG="$2"; shift 2;; --apk) APK="$2"; shift 2;; --out) OUT="$2"; shift 2;;
  --plan) PLAN="$2"; shift 2;; --duration) DUR="$2"; shift 2;; --interval) INT="$2"; shift 2;;
  --avd) AVD="$2"; shift 2;; *) echo "unknown arg $1"; exit 1;; esac; done
[[ -z "$PKG" ]] && { echo "--package required"; exit 1; }
mkdir -p "$OUT"

if ! "$ADB" get-state >/dev/null 2>&1; then
  AVD="${AVD:-$("$EMU" -list-avds | head -1)}"
  [[ -z "$AVD" ]] && { echo "No device and no AVD. Create one in Android Studio > Device Manager."; exit 1; }
  echo "Booting emulator $AVD ..."
  nohup "$EMU" -avd "$AVD" -no-snapshot-save -no-boot-anim -no-audio >"$OUT/../emulator.log" 2>&1 &
  "$ADB" wait-for-device
  until [[ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]]; do sleep 2; done
fi
[[ -n "$APK" ]] && "$ADB" install -r -g "$APK"

# Clean status bar (demo mode): full battery, 9:41, full signal, no notifications
"$ADB" shell settings put global sysui_demo_allowed 1 || true
demo() { "$ADB" shell am broadcast -a com.android.systemui.demo -e command "$@" >/dev/null 2>&1 || true; }
demo enter; demo clock -e hhmm 0941; demo battery -e level 100 -e plugged false
demo network -e wifi show -e level 4; demo network -e mobile show -e level 4 -e datatype none; demo notifications -e visible false

"$ADB" shell am force-stop "$PKG" || true
"$ADB" shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null
sleep 6
SIZE=$("$ADB" shell wm size | tail -1 | awk '{print $NF}' | tr -d '\r'); W=${SIZE%x*}; H=${SIZE#*x}
echo "Screen ${W}x${H}"

N=0
shot() { N=$((N+1)); f="$OUT/frame-$(printf %04d $N)${1:+-$1}.png"; "$ADB" exec-out screencap -p > "$f"; }
( while true; do sleep "$INT"; shot; done ) & CAP=$!
trap 'kill $CAP 2>/dev/null || true; demo exit' EXIT

END=$(( $(date +%s) + DUR ))
run_line() { set -- $1; case "${1:-}" in
  tap) "$ADB" shell input tap "$2" "$3";;
  swipe) "$ADB" shell input swipe "$2" "$3" "$4" "$5" "${6:-250}";;
  hold) "$ADB" shell input swipe "$2" "$3" "$2" "$3" "${4:-800}";;
  key) "$ADB" shell input keyevent "$2";;
  text) "$ADB" shell input text "$2";;
  wait) sleep "$(echo "$2/1000" | bc -l)";;
  shot) shot "${2:-}";; esac; }
while [[ $(date +%s) -lt $END ]]; do
  if [[ -n "$PLAN" ]]; then
    while IFS= read -r line; do [[ -z "$line" || "$line" == \#* ]] && continue; run_line "$line"; [[ $(date +%s) -ge $END ]] && break; done < "$PLAN"
  else
    r=$((RANDOM % 10))
    if (( r < 6 )); then "$ADB" shell input tap $((W/5 + RANDOM % (W*3/5))) $((H/4 + RANDOM % (H/2)))
    else "$ADB" shell input swipe $((W/2)) $((H*3/5)) $((W/5 + RANDOM % (W*3/5))) $((H/4 + RANDOM % (H/2))) 200; fi
    sleep 0.3
  fi
done
echo "Captured $N frames to $OUT"
