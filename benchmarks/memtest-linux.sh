#!/bin/bash
# Expects Xvfb on :99, xdotool, and a throwaway HOME at /tmp/qa/home with a Desktop folder of test items.
# profile-linux.sh DELETES the iconmorph data folder under that throwaway HOME before every run.
# usage: memtest.sh "<extra env>"  -> RSS after Home, after Themes(all folders + cover renders), after Peach preset
export DISPLAY=:99
python3 "$(dirname "$0")/close-window.py" >/dev/null 2>&1; sleep 2; pkill -x iconmorph; sleep 1
env $1 HOME=/tmp/qa/home XDG_CURRENT_DESKTOP=KDE XDG_DATA_HOME=/tmp/qa/home/.local/share WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1 dbus-run-session -- "$(dirname "$0")/../target/release/iconmorph" >/dev/null 2>&1 &
sleep 8; W=$(xdotool search --onlyvisible --class iconmorph | head -1); xdotool windowmove $W 60 20; sleep 1
a=$(ps -o rss= -C iconmorph)
xdotool mousemove 451 43 click 1; sleep 3; xdotool mousemove 1079 116 click 1; sleep 15
b=$(ps -o rss= -C iconmorph)
xdotool mousemove 234 560 click 1; sleep 12; xdotool mousemove 234 730 click 1; sleep 12
c=$(ps -o rss= -C iconmorph)
echo "$1 home=$((a/1024))MB themes=$((b/1024))MB presets=$((c/1024))MB"
python3 "$(dirname "$0")/close-window.py" >/dev/null 2>&1; sleep 2
