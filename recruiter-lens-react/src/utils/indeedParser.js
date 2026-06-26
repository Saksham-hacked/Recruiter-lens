// utils/indeedParser.js
import { PLATFORMS } from "../constants";

export function parseIndeed() {
  const nameEl =
    document.querySelector('[data-testid="CandidateName"]') ||
    document.querySelector("h1");

  if (!nameEl) {
    console.log("[Recruiter Lens] Indeed parser: nameEl not found, returning null");
    return null;
  }

  const nameParts = nameEl.textContent.trim().split(/\s+/);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ");

  if (!lastName) {
    console.log("[Recruiter Lens] Indeed parser: lastName empty, returning null");
    return null;
  }

  const titleEl = document.querySelector('[data-testid="CandidateTitle"]');

  const emailEl =
    document.querySelector('[data-testid="CandidateEmail"]') ||
    document.querySelector('a[href^="mailto:"]');

  const phoneEl = document.querySelector('[data-testid="CandidatePhone"]');

  const employerEl = document.querySelector(
    '[data-testid="WorkExperienceCompany"], .work-experience-company'
  );

  const result = {
    firstName,
    lastName,
    currentTitle: titleEl?.textContent.trim() ?? null,
    currentEmployer: employerEl?.textContent.trim() ?? null,
    email:
      emailEl?.textContent.trim() ||
      emailEl?.href?.replace("mailto:", "") ||
      null,
    phone: phoneEl?.textContent.trim() ?? null,
    linkedinUrl: null,
    platform: PLATFORMS.INDEED,
  };

  console.log("[Recruiter Lens] Indeed parser output:", result);
  return result;
}
