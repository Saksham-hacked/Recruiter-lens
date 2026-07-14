// utils/juiceboxParser.js
// Juicebox parser — rewritten against real DOM from app.juicebox.ai (June 2026).
//
// All selectors use aria-labels, inline styles, data attributes, and structural
// queries. NO Tailwind class selectors (they break in querySelector escaping).
//
import { PLATFORMS } from "../constants";

const TAG = "[Recruiter Lens][JB]";

/** Grab trimmed text or null */
function txt(el) {
  return el?.textContent?.trim() || null;
}

/** Find all spans/divs with a specific inline font-size (handles spacing variants) */
function findByFontSize(root, size) {
  const results = [];
  const els = root.querySelectorAll(
    `span[style*="font-size: ${size}"], div[style*="font-size: ${size}"], span[style*="font-size:${size}"], div[style*="font-size:${size}"]`
  );
  for (const el of els) results.push(el);
  return results;
}

/** Find an element whose aria-label starts with a prefix, return the label value */
function ariaLabelValue(root, prefix) {
  const el = root.querySelector(`[aria-label^="${prefix}"]`);
  if (!el) return null;
  return el.getAttribute("aria-label").replace(new RegExp(`^${prefix}\\s*`, "i"), "").trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIDEBAR PARSER (when a profile is expanded)
// ═══════════════════════════════════════════════════════════════════════════════

function parseSidebar(sidebar) {
  console.log(`${TAG} parseSidebar called. Sidebar aria-label:`, sidebar.getAttribute("aria-label"));
  console.log(`${TAG} Sidebar tag: <${sidebar.tagName.toLowerCase()}>, classes: ${sidebar.className?.substring?.(0, 80)}`);

  // ── DEBUG: Dump all aria-labeled sections inside sidebar ─────────────────
  const allAriaEls = sidebar.querySelectorAll("[aria-label]");
  const sectionLabels = [];
  for (const el of allAriaEls) {
    const label = el.getAttribute("aria-label");
    if (label && (
      label === "Experience" || label === "Education" || label === "Skill Map" ||
      label === "Technical Profile" || label.startsWith("Experience at") ||
      label.startsWith("Education item") || label === "Contact Profile Sidebar" ||
      label === "Profile for Contact"
    )) {
      sectionLabels.push(`${el.tagName}[aria-label="${label}"]`);
    }
  }
  console.log(`${TAG} Key aria-labels found inside sidebar:`, sectionLabels);

  // ── Name ────────────────────────────────────────────────────────────────
  let firstName = "";
  let lastName = "";

  const nameSpans = findByFontSize(sidebar, "20px");
  let nameEl = nameSpans.find(s => {
    const t = txt(s);
    return t && t.length > 1 && t.length < 80 && !t.includes("Search") && !t.includes("Experience");
  });

  if (!nameEl) {
    nameEl = sidebar.querySelector('span[class*="font-medium"][class*="truncate"]');
  }

  if (!nameEl) {
    const headerSpans = sidebar.querySelectorAll('span[style*="font-size"]');
    for (const s of headerSpans) {
      const style = s.getAttribute("style") || "";
      const sizeMatch = style.match(/font-size:\s*(\d+)px/);
      if (sizeMatch && parseInt(sizeMatch[1]) >= 18) {
        const t = txt(s);
        if (t && t.length > 1 && t.length < 80 && !t.includes("Search") && !t.includes("Result")) {
          nameEl = s;
          break;
        }
      }
    }
  }

  if (!nameEl) {
    console.log(`${TAG} Name element not found, returning null`);
    return null;
  }
  const fullName = txt(nameEl);
  if (!fullName) return null;
  const nameParts = fullName.split(/\s+/);
  firstName = nameParts[0] || "";
  lastName = nameParts.slice(1).join(" ");
  console.log(`${TAG} Name found: ${firstName} ${lastName}`);

  // ── Location ────────────────────────────────────────────────────────────
  let location = ariaLabelValue(sidebar, "Location:");
  if (!location) {
    const allLabeled = sidebar.querySelectorAll("[aria-label]");
    for (const el of allLabeled) {
      const label = el.getAttribute("aria-label");
      if (label && label.toLowerCase().startsWith("location")) {
        location = label.replace(/^location[:\s]*/i, "").trim();
        if (location) break;
      }
    }
  }

  // ── LinkedIn URL ────────────────────────────────────────────────────────
  let linkedinUrl = null;
  const linkedinLink = sidebar.querySelector('a[href*="linkedin.com/in/"]');
  if (linkedinLink) {
    linkedinUrl = linkedinLink.getAttribute("href");
    if (linkedinUrl && !linkedinUrl.startsWith("http")) {
      linkedinUrl = "https://" + linkedinUrl;
    }
  }

  // ── GitHub URL ──────────────────────────────────────────────────────────
  let githubUrl = null;
  const ghLink = sidebar.querySelector('a[href*="github.com"]');
  if (ghLink) {
    const href = ghLink.getAttribute("href");
    if (href.match(/github\.com\/[^/]+\/?$/)) {
      githubUrl = href;
    } else if (!githubUrl) {
      githubUrl = href;
    }
  }
  if (!githubUrl) {
    const ghEl = sidebar.querySelector('[aria-label="GitHub"]');
    if (ghEl) {
      const parentLink = ghEl.closest("a");
      if (parentLink) githubUrl = parentLink.getAttribute("href");
    }
  }
  if (!githubUrl) {
    const techSection = sidebar.querySelector('[aria-label="Technical Profile"]');
    if (techSection) {
      const profileLink = techSection.querySelector('a[href*="github.com"]');
      if (profileLink) githubUrl = profileLink.getAttribute("href");
    }
  }

  // ── Company ─────────────────────────────────────────────────────────────
  let currentEmployer = ariaLabelValue(sidebar, "Company:");
  let currentTitle = null;

  // ── About / Summary ─────────────────────────────────────────────────────
  let about = null;
  const aboutDiv = sidebar.querySelector("#about");
  if (aboutDiv) {
    const hiddenAbout = aboutDiv.querySelector('div[style*="visibility: hidden"]');
    if (hiddenAbout) about = txt(hiddenAbout);
    if (!about) {
      const visibleAbout = aboutDiv.querySelector('div[style*="webkit-line-clamp"]');
      if (visibleAbout) about = txt(visibleAbout);
    }
  }

  // ── Experience ──────────────────────────────────────────────────────────
  const experience = [];
  const expSection = sidebar.querySelector('[aria-label="Experience"]');
  console.log(`${TAG} Experience section found:`, !!expSection);
  if (expSection) {
    console.log(`${TAG} Experience section tag: <${expSection.tagName.toLowerCase()}>, class: ${expSection.className?.substring?.(0, 80)}`);
    const expItems = expSection.querySelectorAll('[aria-label^="Experience at"]');
    console.log(`${TAG} Experience items found:`, expItems.length);
    for (const item of expItems) {
      const entry = {};
      const itemLabel = item.getAttribute("aria-label");
      console.log(`${TAG}   Parsing: ${itemLabel}`);

      // Title
      const titleSpans = findByFontSize(item, "15px");
      const titleSpan = titleSpans.find(s => {
        const style = s.getAttribute("style") || "";
        return style.includes("font-weight: 500") || style.includes("font-weight:500");
      });
      entry.title = txt(titleSpan);

      // Company
      const companySpans = findByFontSize(item, "14px");
      const companySpan = companySpans.find(s => {
        const style = s.getAttribute("style") || "";
        return style.includes("font-weight: 400") || style.includes("font-weight:400");
      });
      entry.company = txt(companySpan);

      // Date range & duration
      const allSpans = item.querySelectorAll("span");
      for (const s of allSpans) {
        const t = txt(s);
        if (!t) continue;
        if (!entry.dateRange && /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\s*-/.test(t)) {
          entry.dateRange = t;
        }
        if (!entry.duration && /^\d+\s*(yr|mo|year|month)/.test(t) && t.length < 30) {
          entry.duration = t;
        }
      }

      // Location
      const graySpans = item.querySelectorAll('span[style*="color: rgb(107, 114, 128)"]');
      for (const gs of graySpans) {
        const t = txt(gs);
        if (t && t.includes(",") && !t.includes("yr") && !t.includes("mo") && t.length > 5) {
          entry.location = t;
          break;
        }
      }

      // Description
      const hiddenDesc = item.querySelector('div[style*="visibility: hidden"]');
      if (hiddenDesc) {
        const t = txt(hiddenDesc);
        if (t && t.length > 10) entry.description = t;
      }
      if (!entry.description) {
        const clampedDivs = item.querySelectorAll('div[style*="webkit-line-clamp"]');
        for (const d of clampedDivs) {
          const t = txt(d);
          if (t && t.length > 10) { entry.description = t; break; }
        }
      }

      // Company logo
      const logoImg = item.querySelector('img[alt*="logo"]');
      entry.companyLogoUrl = logoImg?.src ?? null;

      // Funding stage badge
      const fundingBadge = item.querySelector('button[style*="background-color: rgb(239, 245, 255)"]');
      if (fundingBadge) entry.fundingStage = txt(fundingBadge);

      console.log(`${TAG}   Result:`, entry);

      if (entry.title || entry.company) {
        if (experience.length === 0 && entry.title) currentTitle = entry.title;
        experience.push(entry);
      }
    }
  } else {
    // DEBUG: try to find experience section with broader queries
    const byClass = sidebar.querySelector('.experience');
    const byText = sidebar.querySelector('[class*="experience"]');
    console.log(`${TAG} Exp fallback - .experience:`, !!byClass, ', [class*="experience"]:', !!byText);
    // Also dump all aria-labels to see what's available
    const allLabels = [];
    sidebar.querySelectorAll("[aria-label]").forEach(el => {
      const l = el.getAttribute("aria-label");
      if (l && l.length < 60) allLabels.push(l);
    });
    console.log(`${TAG} All aria-labels in sidebar (first 30):`, allLabels.slice(0, 30));
  }

  // Title fallback
  if (!currentTitle) {
    const detailDivs = sidebar.querySelectorAll('[aria-roledescription=""]');
    for (const d of detailDivs) {
      const label = d.getAttribute("aria-label") || "";
      const match = label.match(/^(.+?)\s+at\s+/i);
      if (match) { currentTitle = match[1].trim(); break; }
    }
  }

  // ── Experience Tags ─────────────────────────────────────────────────────
  const experienceTags = [];
  if (expSection) {
    const chips = expSection.querySelectorAll('[class*="MuiChip-root"]');
    for (const chip of chips) {
      const labelSpan = chip.querySelector('[class*="MuiChip-label"]');
      const t = txt(labelSpan);
      if (t && t.length > 0 && t.length < 60) experienceTags.push(t);
    }
  }

  // ── Education ───────────────────────────────────────────────────────────
  const education = [];
  const eduSection = sidebar.querySelector('[aria-label="Education"]');
  console.log(`${TAG} Education section found:`, !!eduSection);
  if (eduSection) {
    const eduItems = eduSection.querySelectorAll('[aria-label^="Education item"]');
    console.log(`${TAG} Education items found:`, eduItems.length);
    for (const item of eduItems) {
      const entry = {};

      const schoolSpans = findByFontSize(item, "15px");
      const schoolSpan = schoolSpans.find(s => {
        const style = s.getAttribute("style") || "";
        return style.includes("font-weight: 500") || style.includes("font-weight:500");
      });
      entry.school = txt(schoolSpan);

      const degreeSpans = findByFontSize(item, "13px");
      for (const ds of degreeSpans) {
        const style = ds.getAttribute("style") || "";
        if (style.includes("color: rgb(107, 114, 128)") || style.includes("color:rgb(107, 114, 128)")) {
          const t = txt(ds);
          if (t && !t.includes("-") && !(/^\d{4}$/.test(t))) { entry.degree = t; break; }
        }
      }

      const allSpans = item.querySelectorAll("span");
      for (const s of allSpans) {
        const t = txt(s);
        if (t && /\d{4}/.test(t) && (t.includes("-") || t.includes("–"))) { entry.dateRange = t; break; }
      }

      const hiddenDesc = item.querySelector('div[style*="visibility: hidden"]');
      if (hiddenDesc) {
        const t = txt(hiddenDesc);
        if (t && t.length > 10) entry.description = t;
      }

      const logoImg = item.querySelector("img");
      entry.schoolLogoUrl = logoImg?.src ?? null;

      console.log(`${TAG}   Edu entry:`, entry);
      if (entry.school) education.push(entry);
    }

    if (education.length === 0) {
      const schoolSpans = findByFontSize(eduSection, "15px");
      for (const s of schoolSpans) {
        const style = s.getAttribute("style") || "";
        if (style.includes("font-weight: 500")) education.push({ school: txt(s) });
      }
    }
  } else {
    console.log(`${TAG} Education section NOT found`);
  }

  // ── Skills (Skill Map section) ──────────────────────────────────────────
  const skills = [];
  const skillCategories = {};
  const skillSection = sidebar.querySelector('[aria-label="Skill Map"]');
  console.log(`${TAG} Skill Map section found:`, !!skillSection);
  if (skillSection) {
    const categoryDivs = skillSection.querySelectorAll('.w-full.flex.flex-col.gap-2');
    const seen = new Set();

    for (const catDiv of categoryDivs) {
      const catNameSpan = catDiv.querySelector(':scope > span');
      const catName = txt(catNameSpan) || "Other";
      const catSkills = [];
      const buttons = catDiv.querySelectorAll("button");
      for (const btn of buttons) {
        const spans = btn.querySelectorAll("span");
        for (const span of spans) {
          const t = txt(span);
          if (t && t.length > 0 && t.length < 80 && !t.startsWith("+") && !seen.has(t)) {
            seen.add(t);
            skills.push(t);
            catSkills.push(t);
          }
        }
      }
      if (catSkills.length > 0) skillCategories[catName] = catSkills;
    }

    if (skills.length === 0) {
      const allButtons = skillSection.querySelectorAll("button");
      const seen2 = new Set();
      for (const btn of allButtons) {
        const spans = btn.querySelectorAll("span");
        for (const span of spans) {
          const t = txt(span);
          if (t && t.length > 0 && t.length < 80 && !t.startsWith("+") && !seen2.has(t)) {
            seen2.add(t);
            skills.push(t);
          }
        }
      }
    }
  }

  // ── Languages ───────────────────────────────────────────────────────────
  const languages = [];
  const allSectionHeadings = sidebar.querySelectorAll("span");
  let langSection = null;
  for (const s of allSectionHeadings) {
    const t = txt(s);
    if (t && t.startsWith("Languages")) { langSection = s.closest("div"); break; }
  }
  if (langSection) {
    const buttons = langSection.querySelectorAll("button");
    for (const btn of buttons) {
      const t = txt(btn);
      if (t && t.length > 1 && t.length < 40) languages.push(t);
    }
    if (languages.length === 0) {
      const spans = langSection.querySelectorAll("span");
      for (const s of spans) {
        const t = txt(s);
        if (t && t.length > 1 && t.length < 40 && t !== "Languages" && !t.includes("💬")) languages.push(t);
      }
    }
  }

  // ── Technical Profile / GitHub Details ───────────────────────────────────
  let githubProfile = null;
  const techSection = sidebar.querySelector('[aria-label="Technical Profile"]');
  if (techSection) {
    githubProfile = {};
    const ghProfileText = techSection.querySelector('[aria-label^="GitHub profile for"]');
    if (ghProfileText) {
      githubProfile.username = ghProfileText.getAttribute("aria-label").replace("GitHub profile for ", "").trim();
    } else {
      const ghTexts = techSection.querySelectorAll("text");
      for (const t of ghTexts) {
        const val = txt(t);
        if (val && !val.includes("followers") && !val.includes("commits") && !val.includes("·") && val.length > 1) {
          githubProfile.username = val; break;
        }
      }
    }
    const hireableBadge = techSection.querySelector('[aria-label*="open to opportunities"]');
    githubProfile.hireable = !!hireableBadge;
    const textEls = techSection.querySelectorAll("text");
    for (const el of textEls) {
      const t = txt(el);
      if (!t) continue;
      if (t.includes("followers")) { const m = t.match(/(\d+)\s*followers?/); if (m) githubProfile.followers = parseInt(m[1]); }
      if (t.includes("commits")) { const m = t.match(/(\d+)\s*total\s*commits?/); if (m) githubProfile.totalCommits = parseInt(m[1]); }
    }
    if (!githubUrl) {
      const profileLink = techSection.querySelector('a[href*="github.com"]');
      if (profileLink) githubUrl = profileLink.getAttribute("href");
    }
  }

  // ── Email / Phone ───────────────────────────────────────────────────────
  let email = null;
  let phone = null;
  const mailLinks = sidebar.querySelectorAll('a[href^="mailto:"]');
  for (const a of mailLinks) { email = a.getAttribute("href").replace("mailto:", "").trim(); if (email) break; }
  const phoneLinks = sidebar.querySelectorAll('a[href^="tel:"]');
  for (const a of phoneLinks) { phone = a.getAttribute("href").replace("tel:", "").trim(); if (phone) break; }
  if (!email || !phone) {
    const allText = sidebar.querySelectorAll("span, a, div, p, button");
    for (const el of allText) {
      const t = txt(el);
      if (!t) continue;
      if (!email && t.includes("@") && t.includes(".")) {
        // Skip container elements — their textContent concatenates children
        // and prepends nearby label text to the email (e.g. "statusContactdr.mgabriel@gmail.com")
        if (el.children.length > 0) continue;
        const m = t.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
        if (m) email = m[0];
      }
      if (!phone && /\+?\(?\d{1,4}\)?[\s\-.]?\d{2,4}[\s\-.]?\d{3,4}/.test(t)) {
        const m = t.match(/\+?[\d\s\-().]{7,20}/);
        if (m) { const c = m[0].trim(); if (c.replace(/[\s\-().+]/g, "").length >= 7) phone = c; }
      }
    }
  }

  // ── Tenure Stats ────────────────────────────────────────────────────────
  let avgTenure = null;
  let currentTenure = null;
  let totalExperience = null;
  const tenureLabels = sidebar.querySelectorAll('[aria-label="Average tenure"], [aria-label="Current tenure"], [aria-label="Total experience"]');
  for (const label of tenureLabels) {
    const ariaLabel = label.getAttribute("aria-label");
    const parent = label.closest(".flex.flex-col");
    if (parent) {
      const valueSpan = parent.querySelector('span[class*="font-medium"]');
      const val = txt(valueSpan);
      if (ariaLabel === "Average tenure") avgTenure = val;
      if (ariaLabel === "Current tenure") currentTenure = val;
      if (ariaLabel === "Total experience") totalExperience = val;
    }
  }

  // ── Build result ────────────────────────────────────────────────────────
  const result = {
    firstName, lastName, currentTitle, currentEmployer, linkedinUrl,
    email, phone, location, githubUrl, about,
    experience: experience.length > 0 ? experience : null,
    experienceTags: experienceTags.length > 0 ? experienceTags : null,
    education: education.length > 0 ? education : null,
    skills: skills.length > 0 ? skills : null,
    skillCategories: Object.keys(skillCategories).length > 0 ? skillCategories : null,
    languages: languages.length > 0 ? languages : null,
    githubProfile, avgTenure, currentTenure, totalExperience,
    platform: PLATFORMS.JUICEBOX,
  };

  console.log(`${TAG} Sidebar parser output:`, result);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROFILE CARD PARSER (fallback when no sidebar is open)
// ═══════════════════════════════════════════════════════════════════════════════

function parseProfileCard(card) {
  const ariaLabel = card.getAttribute("aria-label") || "";
  const nameMatch = ariaLabel.match(/^Profile card for (.+)$/i);
  if (!nameMatch) return null;

  const fullName = nameMatch[1].trim();
  const nameParts = fullName.split(/\s+/);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ");
  if (!lastName) return null;

  let currentTitle = null;
  let currentEmployer = null;
  let location = null;

  const detailDiv = card.querySelector('[aria-roledescription=""]');
  if (detailDiv) {
    const detailLabel = detailDiv.getAttribute("aria-label") || "";
    const titleMatch = detailLabel.match(/^(.+?)\s+at\s+(.+?)(?:,\s*(.+))?$/i);
    if (titleMatch) {
      currentTitle = titleMatch[1].trim();
      const rest = titleMatch[2];
      const locPattern = rest.match(/,\s*([\w\s]+,\s*[\w\s]+,\s*[\w\s]+)$/);
      if (locPattern) {
        currentEmployer = rest.replace(locPattern[0], "").trim();
        location = locPattern[1].trim();
      } else {
        currentEmployer = rest.trim();
      }
    }
  }

  let linkedinUrl = null;
  const linkedinLink = card.querySelector('a[href*="linkedin.com/in/"]');
  if (linkedinLink) {
    linkedinUrl = linkedinLink.getAttribute("href");
    if (linkedinUrl && !linkedinUrl.startsWith("http")) linkedinUrl = "https://" + linkedinUrl;
  }

  let educationText = null;
  const eduDiv = card.querySelector('[aria-roledescription=" "]');
  if (eduDiv) educationText = (eduDiv.getAttribute("aria-label") || "").trim();

  let githubUrl = null;
  const ghEl = card.querySelector('[aria-label="GitHub"]');
  if (ghEl) { const ghLink = ghEl.closest("a"); if (ghLink) githubUrl = ghLink.getAttribute("href"); }

  const result = {
    firstName, lastName, currentTitle, currentEmployer, linkedinUrl,
    email: null, phone: null, location, githubUrl, about: null,
    experience: null, experienceTags: null,
    education: educationText ? [{ school: educationText }] : null,
    skills: null, skillCategories: null, languages: null, githubProfile: null,
    avgTenure: null, currentTenure: null, totalExperience: null,
    platform: PLATFORMS.JUICEBOX,
  };

  console.log(`${TAG} Card parser output:`, result);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

export function parseJuicebox() {
  console.log(`${TAG} parseJuicebox() called`);

  // Strategy 1: Parse from the sidebar if a profile is expanded
  const sidebar = document.querySelector(
    '[aria-label="Profile for Contact"], [aria-label="Contact Profile Sidebar"]'
  );
  console.log(`${TAG} Sidebar element found:`, !!sidebar, sidebar?.getAttribute("aria-label"));

  if (sidebar) {
    const result = parseSidebar(sidebar);
    if (result) return result;
  }

  // Strategy 2: Parse from the focused/first profile card in search results
  const cards = document.querySelectorAll('[role="row"][aria-label^="Profile card for"]');
  console.log(`${TAG} Profile cards found:`, cards.length);
  if (cards.length > 0) {
    const result = parseProfileCard(cards[0]);
    if (result) return result;
  }

  console.log(`${TAG} No profile found`);
  return null;
}
