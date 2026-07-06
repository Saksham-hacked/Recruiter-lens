// utils/platformDetector.js
import { PLATFORMS } from "../constants";

export function detectPlatform() {
  const hostname = window.location.hostname;
  const pathname = window.location.pathname;

  if (hostname.includes("linkedin.com") && pathname.startsWith("/in/")) {
    console.log("[Recruiter Lens] Platform detection result: LinkedIn");
    return PLATFORMS.LINKEDIN;
  }

  // Indeed: regular resume page OR Smart Sourcing (resumes.indeed.com)
  if (hostname.includes("indeed.com")) {
    if (pathname.includes("/resume/")) {
      console.log("[Recruiter Lens] Platform detection result: Indeed (resume page)");
      return PLATFORMS.INDEED;
    }
    if (hostname === "resumes.indeed.com") {
      console.log("[Recruiter Lens] Platform detection result: Indeed (Smart Sourcing)");
      return PLATFORMS.INDEED;
    }
  }

  if (hostname.includes("juicebox.ai")) {
    console.log("[Recruiter Lens] Platform detection result: Juicebox");
    return PLATFORMS.JUICEBOX;
  }

  console.log("[Recruiter Lens] Platform detection result: null (not a candidate profile page)");
  return null;
}

/**
 * Returns true when we're on Indeed Smart Sourcing (search results with detail panel).
 * Used by useLookup to know we need candidate-change detection, not URL-change detection.
 */
export function isSmartSourcing() {
  return (
    window.location.hostname === "resumes.indeed.com" &&
    !!document.querySelector('[data-testid="sourcing-results-layout"]')
  );
}

/**
 * Returns the Indeed candidate ID of the currently selected card, or null.
 */
export function getSelectedIndeedCandidateId() {
  const selected = document.querySelector(
    '[data-cauto-id^="MATCH_CARD_BASE-"][data-selected="true"]'
  );
  return selected?.getAttribute("data-candidate-id") || null;
}
