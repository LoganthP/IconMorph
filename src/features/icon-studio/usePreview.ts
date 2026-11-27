import { useEffect, useRef, useState } from "react";
import { errorText, ipc } from "../../lib/ipc";
import type { IconSpec, PreviewSet } from "../../lib/types";
import { toSourceInput, type StudioSource } from "../../stores/studio";

/** Live preview rendered by the same Rust engine that writes the real icon.
 *
 *  At most one render is in flight; when it finishes, the latest edit (if any) is rendered
 *  next. Continuous drags therefore update at the engine's speed without queueing stale work.
 *  `renderedSpec` is the spec the current image belongs to, so the canvas can show instant
 *  feedback for edits that are still rendering. */
export function usePreview(spec: IconSpec, source: StudioSource) {
  const [preview, setPreview] = useState<PreviewSet | null>(null);
  const [renderedSpec, setRenderedSpec] = useState<IconSpec | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const latest = useRef({ spec, source });
  const inFlight = useRef(false);
  const alive = useRef(true);

  // Re-arm on mount: React StrictMode mounts, unmounts and mounts again in development.
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    latest.current = { spec, source };
    const pump = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      let job = latest.current;
      for (;;) {
        try {
          const res = await ipc.previewIcon(job.spec, toSourceInput(job.source));
          if (alive.current) {
            setPreview(res);
            setRenderedSpec(job.spec);
            setError(null);
          }
        } catch (e) {
          if (alive.current) setError(errorText(e));
        }
        if (latest.current === job) break;
        job = latest.current;
      }
      inFlight.current = false;
      setBusy(false);
    };
    void pump();
  }, [spec, source]);

  return { preview, renderedSpec, error, busy };
}
