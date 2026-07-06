// hooks/useIndeedResumeCapture.js
//
// Bridges the MAIN-world indeedResumeInterceptor.js capture into React state.
// The interceptor runs in a different JS world (MAIN) than this hook
// (isolated content-script world) — the only channel shared between the two
// is the DOM, via a CustomEvent (live updates) and a DOM attribute snapshot
// (covers captures that happened before this hook's listener attached).
import { useState, useEffect, useCallback } from "react";

const EVENT_NAME = "recruiter-lens:resume-captured";
const DOM_ATTR = "data-recruiter-lens-resume";

// Indeed's presigned S3 URLs expire after 5 minutes (X-Amz-Expires=300,
// confirmed via HAR capture). We cut off at 4 minutes so there's always a
// safety margin for the backend's own fetch + Zoho upload round trip.
const STALE_AFTER_MS = 4 * 60 * 1000;

function readFromDom() {
  const raw = document.documentElement.getAttribute(DOM_ATTR);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function useIndeedResumeCapture() {
  const [capture, setCapture] = useState(() => readFromDom());

  useEffect(() => {
    function handleCapture(e) {
      setCapture(e.detail);
    }

    document.addEventListener(EVENT_NAME, handleCapture);

    // Cover the race where a capture already fired before this hook mounted.
    const existing = readFromDom();
    if (existing) setCapture(existing);

    return () => document.removeEventListener(EVENT_NAME, handleCapture);
  }, []);

  /**
   * Returns the capture status for a specific Indeed Smart Sourcing
   * candidate ID:
   *   { state: "none" }                       — never captured (or captured for a different candidate)
   *   { state: "ready", pdfResumeUrl }         — captured recently, safe to send to backend
   *   { state: "stale" }                       — captured too long ago, S3 link is expiring/expired
   */
  const getStatusForCandidate = useCallback(
    (candidateId) => {
      if (!capture || !capture.pdfResumeUrl) return { state: "none" };

      // Require a POSITIVE candidateId match. Previously this only rejected
      // when BOTH ids were present and different, which meant a capture
      // with a null candidateId (interceptor's DOM selector missed the
      // selected card at click time) matched ANY candidate — showing
      // "ready" for a profile the recruiter never downloaded a resume for,
      // and risking the wrong file getting attached in the backend. If the
      // caller supplies a candidateId, the capture must be explicitly tied
      // to that same id (never null) to count as ready.
      if (candidateId && capture.candidateId !== candidateId) {
        return { state: "none" };
      }

      const age = Date.now() - (capture.capturedAt || 0);
      if (age > STALE_AFTER_MS) {
        return { state: "stale" };
      }

      return { state: "ready", pdfResumeUrl: capture.pdfResumeUrl };
    },
    [capture]
  );

  return { getStatusForCandidate };
}
