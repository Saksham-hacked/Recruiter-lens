// utils/platformDetector.js
import { PLATFORMS } from "../constants";

export function detectPlatform() {
  const hostname = window.location.hostname;
  const pathname = window.location.pathname;

  if (hostname.includes("linkedin.com") && pathname.startsWith("/in/")) {
    console.log("[Recruiter Lens] Platform detection result: LinkedIn");
    return PLATFORMS.LINKEDIN;
  }

  if (hostname.includes("indeed.com") && pathname.includes("/resume/")) {
    console.log("[Recruiter Lens] Platform detection result: Indeed");
    return PLATFORMS.INDEED;
  }

  if (hostname.includes("juicebox.ai")) {
    console.log("[Recruiter Lens] Platform detection result: Juicebox");
    return PLATFORMS.JUICEBOX;
  }

  console.log("[Recruiter Lens] Platform detection result: null (not a candidate profile page)");
  return null;
}
