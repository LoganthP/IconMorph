# Sends WM_DELETE_WINDOW (what a window manager's close button sends) to the IconMorph window.
import sys
from Xlib import display, X, protocol
d = display.Display(":99")
root = d.screen().root
WM_PROTOCOLS = d.intern_atom("WM_PROTOCOLS"); WM_DELETE = d.intern_atom("WM_DELETE_WINDOW")
def walk(w):
    try:
        if (w.get_wm_name() or "") == "IconMorph" and WM_DELETE in (w.get_wm_protocols() or []):
            return w
    except Exception: pass
    for c in w.query_tree().children:
        r = walk(c)
        if r: return r
w = walk(root)
if not w: sys.exit("window not found")
ev = protocol.event.ClientMessage(window=w, client_type=WM_PROTOCOLS, data=(32, [WM_DELETE, X.CurrentTime, 0, 0, 0]))
w.send_event(ev); d.flush(); print("close sent to", hex(w.id))
