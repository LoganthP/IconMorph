#!/bin/bash
# Expects Xvfb on :99, xdotool, and a throwaway HOME at /tmp/qa/home with a Desktop folder of test items.
# profile-linux.sh DELETES the iconmorph data folder under that throwaway HOME before every run.
# usage: profile.sh <binary> <label>   — 3 runs: window-map time, idle RSS (core/web/net), idle CPU over 10s, exit check
BIN=$1; LABEL=$2
for run in 1 2 3; do
  rm -rf /tmp/qa/home/.local/share/iconmorph
  start=$(date +%s.%N)
  (DISPLAY=:99 HOME=/tmp/qa/home XDG_CURRENT_DESKTOP=KDE XDG_DATA_HOME=/tmp/qa/home/.local/share WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1 dbus-run-session -- $BIN > /tmp/qa/prof.log 2>&1 &)
  until DISPLAY=:99 xdotool search --name 'IconMorph' >/dev/null 2>&1; do sleep 0.02; done
  win=$(date +%s.%N)
  sleep 8
  pid=$(pgrep -x iconmorph)
  c0=$(ps -o cputimes= -p $pid 2>/dev/null || ps -o times= -p $pid); w0=$(ps -C WebKitWebProcess -o times= | awk '{s+=$1} END{print s+0}')
  sleep 10
  c1=$(ps -o times= -p $pid); w1=$(ps -C WebKitWebProcess -o times= | awk '{s+=$1} END{print s+0}')
  core=$(ps -o rss= -p $pid); web=$(ps -C WebKitWebProcess -o rss= | awk '{s+=$1} END{print s+0}'); net=$(ps -C WebKitNetworkProcess -o rss= | awk '{s+=$1} END{print s+0}')
  python3 "$(dirname "$0")/close-window.py" >/dev/null 2>&1; sleep 2
  left=$(pgrep -xc iconmorph); lw=$(ps -C WebKitWebProcess,WebKitNetworkProcess -o stat= | grep -vc Z)
  printf "%s run%d: window %.3fs | RSS core %dMB web %dMB net %dMB | idle CPU 10s: core %ss web %ss | after close: %s app, %s webkit\n" "$LABEL" $run $(echo "$win - $start" | bc) $((core/1024)) $((web/1024)) $((net/1024)) $((c1-c0)) $((w1-w0)) $left $lw
  pkill -x iconmorph 2>/dev/null; sleep 1
done
