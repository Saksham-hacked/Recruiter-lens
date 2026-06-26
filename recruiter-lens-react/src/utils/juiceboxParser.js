// utils/juiceboxParser.js
// Juicebox is a React SPA — class names use partial matches.
import { PLATFORMS } from "../constants";

export function parseJuicebox() {
  const nameEl = document.querySelector(
    '[class*="candidate-name"], [class*="person-name"], [class*="profile-name"]'
  );

  if (!nameEl) {
    console.log("[Recruiter Lens] Juicebox parser: nameEl not found, returning null");
    return null;
  }

  const nameParts = nameEl.textContent.trim().split(/\s+/);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ");

  if (!lastName) {
    console.log("[Recruiter Lens] Juicebox parser: lastName empty, returning null");
    return null;
  }

  const titleEl = document.querySelector(
    '[class*="candidate-title"], [class*="person-title"]'
  );

  const employerEl = document.querySelector(
    '[class*="company-name"], [class*="employer"]'
  );

  const emailEl = document.querySelector(
    '[class*="email"], a[href^="mailto:"]'
  );

  const linkedinEl = document.querySelector('a[href*="linkedin.com/in/"]');

  const result = {
    firstName,
    lastName,
    currentTitle: titleEl?.textContent.trim() ?? null,
    currentEmployer: employerEl?.textContent.trim() ?? null,
    email:
      emailEl?.textContent.trim() ||
      emailEl?.href?.replace("mailto:", "") ||
      null,
    phone: null,
    linkedinUrl: linkedinEl?.href ?? null,
    platform: PLATFORMS.JUICEBOX,
  };

  console.log("[Recruiter Lens] Juicebox parser output:", result);
  return result;
}
