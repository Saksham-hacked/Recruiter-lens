// hooks/useLookup.js
// Manages all lookup state, platform detection, parsing, and SPA navigation.
import { useState, useEffect, useRef } from "react";
import {
  detectPlatform,
  isSmartSourcing,
  getSelectedIndeedCandidateId,
} from "../utils/platformDetector";
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

// Polls getValue() until it returns a truthy value that stays IDENTICAL
// across `stableChecks` consecutive polls, `interval`ms apart. Used instead
// of a flat sleep() for Indeed Smart Sourcing, where clicking a new
// candidate card reuses the existing header DOM node (so waitForElement
// resolves instantly) while the hidden Profile tab panel re-hydrates its
// title/employer text asynchronously and can lag behind. A flat sleep risks
// reading mid-hydration or stale-from-previous-candidate text; waiting for
// two consecutive identical reads confirms the content has actually settled.
function waitForStableContent(getValue, { timeout = 8000, stableChecks = 2, interval = 150 } = {}) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let lastValue = null;
    let stableCount = 0;

    function check() {
      const value = getValue();

      if (value) {
        if (value === lastValue) {
          stableCount++;
          if (stableCount >= stableChecks) {
            resolve(value);
            return;
          }
        } else {
          lastValue = value;
          stableCount = 1;
        }
      } else {
        lastValue = null;
        stableCount = 0;
      }

      if (Date.now() - start >= timeout) {
        reject(new Error("waitForStableContent: timed out waiting for stable content"));
        return;
      }
      setTimeout(check, interval);
    }

    check();
  });
}

// ── Detailed parse logging ────────────────────────────────────────────────────
function logParsedData(parsed) {
  const tag = "[Recruiter Lens]";
  const divider = "─".repeat(60);

  console.log(`\n${tag} ${divider}`);
  console.log(`${tag} 📋 PARSED DATA BREAKDOWN  (${parsed.platform})`);
  console.log(`${tag} ${divider}`);

  // Core identity
  console.log(`${tag} 👤 Name:       ${parsed.firstName} ${parsed.lastName}`);
  console.log(`${tag} 💼 Title:      ${parsed.currentTitle ?? "—"}`);
  console.log(`${tag} 🏢 Employer:   ${parsed.currentEmployer ?? "—"}`);
  console.log(`${tag} 📍 Location:   ${parsed.location ?? "—"}`);

  // Contact
  console.log(`${tag} ✉️  Email:      ${parsed.email ?? "—"}`);
  console.log(`${tag} 📞 Phone:      ${parsed.phone ?? "—"}`);
  console.log(`${tag} 🔗 LinkedIn:   ${parsed.linkedinUrl ?? "—"}`);
  if (parsed.githubUrl !== undefined)
    console.log(`${tag} 🐙 GitHub:     ${parsed.githubUrl ?? "—"}`);
  if (parsed.websites)
    console.log(`${tag} 🌐 Websites:   ${JSON.stringify(parsed.websites)}`);

  // LinkedIn-specific extras
  if (parsed.profilePhotoUrl !== undefined)
    console.log(`${tag} 🖼️  Photo:      ${parsed.profilePhotoUrl ? "YES" : "—"}`);
  if (parsed.about !== undefined)
    console.log(`${tag} 📝 About:      ${parsed.about ? parsed.about.substring(0, 80) + "…" : "—"}`);
  if (parsed.industry !== undefined)
    console.log(`${tag} 🏭 Industry:   ${parsed.industry ?? "—"}`);
  if (parsed.openToWork !== undefined)
    console.log(`${tag} 🟢 OpenToWork: ${parsed.openToWork}`);
  if (parsed.connectionCount !== undefined)
    console.log(`${tag} 🤝 Connections:${parsed.connectionCount ?? "—"}`);
  if (parsed.followerCount !== undefined)
    console.log(`${tag} 👥 Followers:  ${parsed.followerCount ?? "—"}`);

  // Indeed-specific extras
  if (parsed.indeedCandidateId !== undefined)
    console.log(`${tag} 🆔 Indeed ID:  ${parsed.indeedCandidateId ?? "—"}`);
  if (parsed.lastActive !== undefined)
    console.log(`${tag} 🕐 Active:     ${parsed.lastActive ?? "—"}`);
  if (parsed.resumeUpdated !== undefined)
    console.log(`${tag} 📄 Resume:     ${parsed.resumeUpdated ?? "—"}`);
  if (parsed.militaryService)
    console.log(`${tag} 🎖️  Military:   ${parsed.militaryService.branch ?? "—"} (${parsed.militaryService.rank ?? "—"})`);

  // Experience
  if (parsed.experience && parsed.experience.length > 0) {
    console.log(`${tag}`);
    console.log(`${tag} 💼 EXPERIENCE (${parsed.experience.length} entries):`);
    parsed.experience.forEach((exp, i) => {
      console.log(`${tag}   ${i + 1}. ${exp.title ?? "?"} @ ${exp.company ?? "?"}`);
      if (exp.dateRange) console.log(`${tag}      📅 ${exp.dateRange}`);
      if (exp.duration)  console.log(`${tag}      ⏱️  ${exp.duration}`);
      if (exp.location)  console.log(`${tag}      📍 ${exp.location}`);
      if (exp.description) console.log(`${tag}      📝 ${exp.description.substring(0, 60)}…`);
      if (exp.fundingStage) console.log(`${tag}      💰 ${exp.fundingStage}`);
    });
  } else {
    console.log(`${tag} 💼 Experience: —`);
  }

  // Education
  if (parsed.education && parsed.education.length > 0) {
    console.log(`${tag}`);
    console.log(`${tag} 🎓 EDUCATION (${parsed.education.length} entries):`);
    parsed.education.forEach((edu, i) => {
      console.log(`${tag}   ${i + 1}. ${edu.school ?? edu.degree ?? "?"}`);
      if (edu.degree) console.log(`${tag}      📜 ${edu.degree}`);
      if (edu.fieldOfStudy) console.log(`${tag}      📚 ${edu.fieldOfStudy}`);
      if (edu.dateRange) console.log(`${tag}      📅 ${edu.dateRange}`);
    });
  } else {
    console.log(`${tag} 🎓 Education: —`);
  }

  // Skills
  if (parsed.skills && parsed.skills.length > 0) {
    console.log(`${tag}`);
    console.log(`${tag} 🛠️  SKILLS (${parsed.skills.length}): ${parsed.skills.slice(0, 10).join(", ")}${parsed.skills.length > 10 ? ` … +${parsed.skills.length - 10} more` : ""}`);
  } else {
    console.log(`${tag} 🛠️  Skills: —`);
  }

  // Certifications
  if (parsed.certifications && parsed.certifications.length > 0) {
    console.log(`${tag} 📜 CERTS (${parsed.certifications.length}): ${parsed.certifications.map(c => c.name || c).join(", ")}`);
  }

  // Languages
  if (parsed.languages && parsed.languages.length > 0) {
    console.log(`${tag} 🗣️  LANGUAGES: ${Array.isArray(parsed.languages) ? (typeof parsed.languages[0] === "string" ? parsed.languages.join(", ") : parsed.languages.map(l => l.language || l).join(", ")) : "—"}`);
  }

  // LinkedIn extras
  if (parsed.volunteer && parsed.volunteer.length > 0) {
    console.log(`${tag} 🤲 VOLUNTEER (${parsed.volunteer.length}): ${parsed.volunteer.map(v => v.role).join(", ")}`);
  }
  if (parsed.awards && parsed.awards.length > 0) {
    console.log(`${tag} 🏆 AWARDS (${parsed.awards.length}): ${parsed.awards.join(", ")}`);
  }
  if (parsed.publications && parsed.publications.length > 0) {
    console.log(`${tag} 📚 PUBS (${parsed.publications.length}): ${parsed.publications.join(", ")}`);
  }
  if (parsed.projects && parsed.projects.length > 0) {
    console.log(`${tag} 🔨 PROJECTS (${parsed.projects.length}): ${parsed.projects.map(p => p.name).join(", ")}`);
  }

  // Summary counts
  console.log(`${tag}`);
  console.log(`${tag} 📊 FIELD SUMMARY:`);
  const fields = Object.entries(parsed);
  let filled = 0;
  let empty = 0;
  const emptyFields = [];
  for (const [key, val] of fields) {
    if (key === "platform") continue;
    const hasValue = val !== null && val !== undefined && val !== "" &&
      !(Array.isArray(val) && val.length === 0);
    if (hasValue) {
      filled++;
    } else {
      empty++;
      emptyFields.push(key);
    }
  }
  console.log(`${tag}   ✅ Filled: ${filled}  |  ❌ Empty: ${empty}`);
  if (emptyFields.length > 0) {
    console.log(`${tag}   Empty fields: ${emptyFields.join(", ")}`);
  }
  console.log(`${tag} ${divider}\n`);
}

export function useLookup() {
  const [status, setStatus] = useState("idle");
  const [candidate, setCandidate] = useState(null);
  const [candidateData, setCandidateData] = useState(null);
  const [possibleMatches, setPossibleMatches] = useState(null);
  const [error, setError] = useState(null);

  const lastProcessedUrl = useRef("");
  const lastProcessedCandidateId = useRef(""); // Smart Sourcing: track selected candidate
  const mutationObserverRef = useRef(null);

  async function runLookup() {
    const currentUrl = window.location.href;
    const currentCandidateId = getSelectedIndeedCandidateId();

    // Prevent duplicate runs on the same URL + candidate combo
    if (
      lastProcessedUrl.current === currentUrl &&
      lastProcessedCandidateId.current === (currentCandidateId || "")
    ) {
      return;
    }

    lastProcessedUrl.current = currentUrl;
    lastProcessedCandidateId.current = currentCandidateId || "";

    // ── 1. Detect platform ────────────────────────────────────────────────────
    const platform = detectPlatform();
    if (!platform) return;

    // ── 2. Wait for platform-specific content to render ───────────────────────
    if (platform === PLATFORMS.LINKEDIN) {
      try {
        await waitForElement(
          'main.scaffold-layout__main, section[componentkey*="Topcard"]',
          8000
        );
        await sleep(1000);
      } catch (e) {
        console.log("[Recruiter Lens] LinkedIn wait timed out, attempting parse anyway");
      }
    }

    if (platform === PLATFORMS.JUICEBOX) {
      try {
        // Wait for either the sidebar or profile cards to appear
        await waitForElement(
          '[aria-label="Profile for Contact"], [aria-label="Contact Profile Sidebar"], [role="row"][aria-label^="Profile card for"]',
          8000
        );
        // Extra settle time — sidebar animates in and React hydrates the content
        await sleep(1500);
      } catch (e) {
        console.log("[Recruiter Lens] Juicebox wait timed out, attempting parse anyway");
      }
    }

    if (platform === PLATFORMS.INDEED && isSmartSourcing()) {
      try {
        // Wait for the detail panel header to render (may resolve instantly
        // on candidate switch, since Indeed reuses the same header node).
        await waitForElement('[data-cauto-id="candidate-info-name"]', 8000);

        // The header name node above is reused across candidate switches,
        // so its presence doesn't guarantee the hidden Profile tab (source
        // of currentTitle/currentEmployer via name-plate-item) has finished
        // re-hydrating for the newly selected candidate. Poll until the
        // name-plate-item title text is present AND stable across two
        // consecutive reads before parsing, instead of a flat sleep.
        await waitForStableContent(() => {
          const nameEl = document.querySelector('[data-cauto-id="candidate-info-name"]');
          const profileTab = document.querySelector('[data-testid="profile-tab-panel"]');
          const namePlateItem = profileTab?.querySelector('[data-testid="name-plate-item"]');
          const titleSpan = namePlateItem?.querySelector("span.css-whus60");

          const name = nameEl?.textContent.trim() || "";
          const title = titleSpan?.textContent.trim() || "";

          if (!name || !title) return null;
          return `${name}|||${title}`;
        });
      } catch (e) {
        console.log("[Recruiter Lens] Indeed Smart Sourcing wait timed out, attempting parse anyway");
      }
    }

    // ── 3. Parse page ─────────────────────────────────────────────────────────
    let parsed = null;
    if (platform === PLATFORMS.LINKEDIN) parsed = parseLinkedIn();
    else if (platform === PLATFORMS.INDEED) parsed = parseIndeed();
    else if (platform === PLATFORMS.JUICEBOX) parsed = parseJuicebox();

    if (!parsed) {
      console.log("[Recruiter Lens] Parser returned null — not a real profile, resetting for retry");
      lastProcessedUrl.current = "";
      lastProcessedCandidateId.current = "";
      return;
    }

    // ── 3b. Detailed parse log ────────────────────────────────────────────────
    logParsedData(parsed);

    setCandidateData(parsed);

    // ── 4. Set loading state + icon ───────────────────────────────────────────
    setStatus("loading");
    setCandidate(null);
    setPossibleMatches(null);
    setError(null);
    iconAPI.updateIcon("loading").catch(() => {});

    // ── 5. Lookup ─────────────────────────────────────────────────────────────
    try {
      console.log("[Recruiter Lens] Lookup request sent:", {
        email: parsed.email,
        phone: parsed.phone,
        linkedinUrl: parsed.linkedinUrl,
        platform: parsed.platform,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        currentEmployer: parsed.currentEmployer,
      });

      const response = await lookupAPI.searchCandidate({
        email: parsed.email,
        phone: parsed.phone,
        linkedinUrl: parsed.linkedinUrl,
        platform: parsed.platform,
        // Fallback identifiers: only used by the backend when email/phone/
        // linkedinUrl are all absent (e.g. Indeed Smart Sourcing). Harmless
        // to include for LinkedIn/Juicebox — backend ignores them whenever
        // a primary identifier is present, so existing behavior is unchanged.
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        currentEmployer: parsed.currentEmployer,
      });

      console.log("[Recruiter Lens] Lookup response received:", response);

      if (response.found) {
        setStatus("found");
        setCandidate(response.candidate);
        iconAPI.updateIcon("found").catch(() => {});
      } else if (response.possibleMatches && response.possibleMatches.length > 0) {
        // Name-only match(es) at medium confidence — not auto-accepted. The
        // panel asks the recruiter to confirm before enriching.
        setStatus("possibleMatch");
        setPossibleMatches(response.possibleMatches);
        iconAPI.updateIcon("notfound").catch(() => {});
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
    lastProcessedCandidateId.current = "";
    runLookup();
  }

  useEffect(() => {
    // Initial run
    runLookup();

    // ── SPA navigation observer ───────────────────────────────────────────────
    // Catches:
    //   - LinkedIn SPA navigations (URL changes)
    //   - Juicebox sidebar open/close (query param changes)
    //   - Indeed Smart Sourcing candidate selection changes (same URL, different card)
    const observer = new MutationObserver(() => {
      // Check URL change (covers LinkedIn, Juicebox, regular Indeed)
      if (window.location.href !== lastProcessedUrl.current) {
        runLookup();
        return;
      }

      // Smart Sourcing: check if selected candidate changed (URL stays same)
      if (isSmartSourcing()) {
        const currentId = getSelectedIndeedCandidateId();
        if (currentId && currentId !== lastProcessedCandidateId.current) {
          console.log(
            `[Recruiter Lens] Smart Sourcing: candidate changed → ${currentId}`
          );
          runLookup();
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    mutationObserverRef.current = observer;

    return () => {
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, candidate, candidateData, possibleMatches, error, retry };
}
