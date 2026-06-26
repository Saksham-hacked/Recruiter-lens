// hooks/useLookup.js
// Manages all lookup state, platform detection, parsing, and SPA navigation.
import { useState, useEffect, useRef } from "react";
import { detectPlatform } from "../utils/platformDetector";
import { parseLinkedIn } from "../utils/linkedinParser";
import { parseIndeed } from "../utils/indeedParser";
import { parseJuicebox } from "../utils/juiceboxParser";
import { lookupAPI, iconAPI } from "../api";
import { PLATFORMS } from "../constants";

// Resolves when selector appears in DOM, or rejects after timeout ms
function waitForElement(selector, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`waitForElement: "${selector}" not found within ${timeout}ms`));
    }, timeout);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function useLookup() {
  const [status, setStatus] = useState("idle");
  const [candidate, setCandidate] = useState(null);
  const [candidateData, setCandidateData] = useState(null);
  const [error, setError] = useState(null);

  const lastProcessedUrl = useRef("");
  const mutationObserverRef = useRef(null);

  async function runLookup() {
    const currentUrl = window.location.href;

    // Prevent duplicate runs on the same URL
    if (lastProcessedUrl.current === currentUrl) return;
    lastProcessedUrl.current = currentUrl;

    // ── 1. Detect platform ────────────────────────────────────────────────────
    const platform = detectPlatform();
    if (!platform) return;

    // ── 2. For LinkedIn: wait for the main content area to render ─────────────
    if (platform === PLATFORMS.LINKEDIN) {
      try {
        await waitForElement(
          'main.scaffold-layout__main, section[componentkey*="Topcard"]',
          8000
        );
        await sleep(1000); // Extra settle time for DOM hydration
      } catch (e) {
        console.log("[Recruiter Lens] LinkedIn wait timed out, attempting parse anyway");
      }
    }

    // ── 3. Parse page ─────────────────────────────────────────────────────────
    let parsed = null;
    if (platform === PLATFORMS.LINKEDIN) parsed = parseLinkedIn();
    else if (platform === PLATFORMS.INDEED) parsed = parseIndeed();
    else if (platform === PLATFORMS.JUICEBOX) parsed = parseJuicebox();

    if (!parsed) {
      console.log("[Recruiter Lens] Parser returned null — not a real profile, resetting URL for retry");
      lastProcessedUrl.current = ""; // Allow retry
      return;
    }

    setCandidateData(parsed);

    // ── 4. Set loading state + icon ───────────────────────────────────────────
    setStatus("loading");
    setCandidate(null);
    setError(null);
    iconAPI.updateIcon("loading").catch(() => {});

    // ── 5. Lookup ─────────────────────────────────────────────────────────────
    try {
      console.log("[Recruiter Lens] Lookup request sent:", {
        email: parsed.email,
        phone: parsed.phone,
        linkedinUrl: parsed.linkedinUrl,
        platform: parsed.platform,
      });

      const response = await lookupAPI.searchCandidate({
        email: parsed.email,
        phone: parsed.phone,
        linkedinUrl: parsed.linkedinUrl,
        platform: parsed.platform,
      });

      console.log("[Recruiter Lens] Lookup response received:", response);

      if (response.found) {
        setStatus("found");
        setCandidate(response.candidate);
        iconAPI.updateIcon("found").catch(() => {});
      } else {
        setStatus("notFound");
        iconAPI.updateIcon("notfound").catch(() => {});
      }
    } catch (err) {
      console.log("[Recruiter Lens] Lookup error:", err.message);
      setStatus("error");
      setError(err.message);
      iconAPI.updateIcon("error").catch(() => {});
    }
  }

  function retry() {
    lastProcessedUrl.current = "";
    runLookup();
  }

  useEffect(() => {
    // Initial run
    runLookup();

    // ── SPA navigation observer (LinkedIn navigates without page reload) ───────
    const observer = new MutationObserver(() => {
      if (window.location.href !== lastProcessedUrl.current) {
        runLookup();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    mutationObserverRef.current = observer;

    return () => {
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, candidate, candidateData, error, retry };
}
