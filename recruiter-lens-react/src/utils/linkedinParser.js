// utils/linkedinParser.js
// Enriched LinkedIn profile parser.
// Handles both classic LinkedIn UI and new SDUI (obfuscated utility classes).
// Extracts maximum available data from the profile page DOM.
import { PLATFORMS } from "../constants";

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Grab trimmed text or null */
function txt(el) {
  return el?.textContent?.trim() || null;
}

/** Find the closest <section> that contains a heading matching a keyword */
function findSection(keyword) {
  // Classic: sections identified by id like #experience, #education, #skills
  const byId = document.getElementById(keyword.toLowerCase());
  if (byId) {
    const sec = byId.closest("section");
    if (sec) return sec;
  }

  // SDUI: componentkey attributes on h2 headings
  const compKey = document.querySelector(
    `h2[componentkey*="${keyword}"], [componentkey*="${keyword}"]`
  );
  if (compKey) {
    const sec = compKey.closest("section");
    if (sec) return sec;
  }

  // Fallback: scan all section headings for text match
  const allSections = document.querySelectorAll("main section, section.artdeco-card");
  for (const sec of allSections) {
    const heading = sec.querySelector("h2, [class*='pvs-header__title']");
    if (heading && heading.textContent.toLowerCase().includes(keyword.toLowerCase())) {
      return sec;
    }
  }
  return null;
}

/** Parse a list section (Experience, Education, etc.) into structured items */
function parseListItems(section) {
  if (!section) return [];
  const items = [];

  // Classic & SDUI both use <li> inside the section's list
  const listItems = section.querySelectorAll(
    ":scope > div > div > ul > li, " +
    ":scope > div > ul > li, " +
    "ul.pvs-list > li"
  );

  for (const li of listItems) {
    // Each list item typically has visually-hidden <span> tags with sr-only text,
    // and visible <span> tags with actual content.
    // We grab all visible text spans inside the item.
    const spans = li.querySelectorAll(
      ".visually-hidden, .pvs-entity__caption-wrapper, " +
      '[class*="t-bold"] span[aria-hidden="true"], ' +
      '[class*="t-normal"] span[aria-hidden="true"], ' +
      'span[aria-hidden="true"]'
    );

    const texts = [];
    for (const s of spans) {
      const t = s.textContent.trim();
      if (t && t.length > 0 && !texts.includes(t)) {
        texts.push(t);
      }
    }

    // Also try a simpler grab: direct div children text
    if (texts.length === 0) {
      const divs = li.querySelectorAll(":scope > div > div > div");
      for (const d of divs) {
        const t = d.textContent.trim();
        if (t && t.length > 1) texts.push(t);
      }
    }

    if (texts.length > 0) {
      items.push(texts);
    }
  }
  return items;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PARSER
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// SDUI SECTION PARSERS  (new LinkedIn desktop — obfuscated utility classes)
// Anchored on stable componentkey suffixes; fields classified by text pattern.
// Verified against real profile DOM (no speculative selectors).
// ═══════════════════════════════════════════════════════════════════════════════

const SDUI_DATE = /([A-Za-z]{3,9}\s+\d{4}|\d{4})\s*[-–]\s*(Present|[A-Za-z]{3,9}\s+\d{4}|\d{4})/;
const SDUI_TENURE = /^\d+\s*yrs?(\s+\d+\s*mos?)?$|^\d+\s*mos?$/i;
const SDUI_TYPES = new Set([
  "Full-time", "Part-time", "Self-employed", "Freelance",
  "Contract", "Internship", "Apprenticeship", "Seasonal",
]);

/** Get an SDUI profile section <section> by its stable componentkey suffix */
function sduiSection(suffix) {
  return document.querySelector(`section[componentkey$="${suffix}"]`);
}

/** Ordered, de-duped visible text lines within a node (skips UI chrome) */
function sduiLines(root) {
  if (!root) return [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const out = [];
  let node;
  while ((node = walker.nextNode())) {
    const t = node.textContent.replace(/\s+/g, " ").trim();
    if (!t || t === "·") continue;
    if (/^(more|…|see more|show all.*|endorsed by.*|show credential.*)$/i.test(t)) continue;
    if (out.length && out[out.length - 1] === t) continue;
    out.push(t);
  }
  return out;
}

function sduiIsLocation(t) {
  return t.includes(",") && t.length < 60 && !SDUI_DATE.test(t) && !SDUI_TENURE.test(t);
}

/** EXPERIENCE — segment the section's line-stream by date lines, carrying company
 *  context so grouped (multi-role) companies and single entries both parse. */
function parseSduiExperience() {
  const section = sduiSection("ExperienceTopLevelSection");
  if (!section) return [];
  let lines = sduiLines(section);
  if (lines[0] === "Experience") lines = lines.slice(1);

  const roles = [];
  let pending = [], curCo = null, curLoc = null, pType = null;

  const close = (dateLine) => {
    let title = null, company = curCo, location = curLoc, selfContained = false;
    if (pending.length >= 2) {
      title = pending[pending.length - 2];
      company = pending[pending.length - 1];
      location = null; selfContained = true;
    } else if (pending.length === 1) {
      title = pending[0];
    }
    const dm = dateLine.split("·");
    roles.push({
      title,
      company,
      dateRange: dm[0].trim(),
      duration: dm[1] ? dm[1].trim() : null,
      employmentType: pType,
      location,
      description: [],
      companyLogoUrl: null,
    });
    pending = []; pType = null;
    if (selfContained) { curCo = null; curLoc = null; }
  };

  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (L.startsWith("•")) {                       // bullets FIRST (may contain year ranges)
      if (roles.length) roles[roles.length - 1].description.push(L);
      continue;
    }
    if (SDUI_TENURE.test(L)) {                     // grouped-company tenure → company header above it
      if (pending.length) curCo = pending[pending.length - 1];
      curLoc = null; pending = [];
      if (lines[i + 1] && sduiIsLocation(lines[i + 1])) { curLoc = lines[i + 1]; i++; }
      continue;
    }
    if (SDUI_TYPES.has(L)) { pType = L; continue; }
    if (SDUI_DATE.test(L)) {
      close(L);
      const nx = lines[i + 1];
      if (nx && sduiIsLocation(nx) && !SDUI_TYPES.has(nx) && !nx.startsWith("•")) {
        roles[roles.length - 1].location = nx; i++;
      }
      continue;
    }
    pending.push(L);
  }

  for (const r of roles) {
    r.description = r.description.length ? r.description.join("\n") : null;
  }
  return roles.filter((r) => r.title || r.company);
}

/** EDUCATION — triples of [school, degree, years] segmented by year lines */
function parseSduiEducation() {
  const section = sduiSection("EducationTopLevelSection");
  if (!section) return [];
  let lines = sduiLines(section);
  if (lines[0] === "Education") lines = lines.slice(1);

  const YEAR = /\b(19|20)\d{2}\b/;
  const items = [];
  let buf = [];
  for (const L of lines) {
    if (YEAR.test(L)) {
      const school = buf[0] || null;
      const degree = buf.slice(1).join(", ") || null;
      if (school) items.push({ school, degree, fieldOfStudy: null, dateRange: L, schoolLogoUrl: null });
      buf = [];
    } else {
      buf.push(L);
    }
  }
  return items;
}

/** SKILLS — collect skill-name lines (LinkedIn truncates the inline list) */
function parseSduiSkills() {
  const section = sduiSection("Skills");
  if (!section) return [];
  const out = [];
  const seen = new Set();
  for (const L of sduiLines(section)) {
    if (/^skills(\s*\(\d+\))?$/i.test(L)) continue;          // header "Skills (31)"
    if (/passed|assessment|endorsement/i.test(L)) continue;
    if (L.length < 2 || L.length > 60) continue;
    if (seen.has(L)) continue;
    seen.add(L); out.push(L);
  }
  return out;
}

/** ABOUT — full summary text from the SDUI expandable box */
function sduiAbout() {
  const section = sduiSection("About");
  if (!section) return null;
  const box = section.querySelector('[data-testid="expandable-text-box"]');
  const t = (box || section).textContent.replace(/\s+/g, " ").trim();
  if (!t || /^about$/i.test(t)) return null;
  return t.replace(/^About\s*/i, "").trim();
}

export function parseLinkedIn() {
  let nameEl = null;
  let titleEl = null;
  let employerEl = null;

  // ── TOP CARD: Name, Headline, Current Company ──────────────────────────────

  // Classic selectors
  nameEl = document.querySelector(".text-heading-xlarge, .pv-top-card--list section h1");
  titleEl = document.querySelector(".text-body-medium.break-words");
  employerEl = document.querySelector(".inline-show-more-text--is-collapsed");

  // SDUI fallback
  const topCard = document.querySelector('section[componentkey*="Topcard"]');
  if (!nameEl && topCard) {
    nameEl = topCard.querySelector("h2");
    const pTags = [...topCard.querySelectorAll("p")];
    const filtered = pTags.filter((p) => {
      const text = p.textContent.trim();
      return (
        text.length > 5 &&
        !text.includes("connections") &&
        !/^·\s*\d(?:st|nd|rd)$/.test(text)
      );
    });
    if (!titleEl) titleEl = filtered[0] || null;
    if (!employerEl) employerEl = filtered[1] || null;
  }

  // Employer fallback via experience section logo
  if (!employerEl || !txt(employerEl)) {
    const expAnchor = document.querySelector(
      'h2[componentkey="ProfileNullStateCardAnchor_Experience"]'
    );
    if (expAnchor) {
      const section = expAnchor.closest("section");
      if (section) {
        const logo = section.querySelector('img[alt*="logo"]');
        if (logo) {
          employerEl = { textContent: logo.alt.replace(/ logo$/i, "").trim() };
        }
      }
    }
  }

  // ── NAME ──────────────────────────────────────────────────────────────────
  if (!nameEl) {
    console.log("[Recruiter Lens] LinkedIn parser: nameEl not found, returning null");
    return null;
  }

  const nameParts = nameEl.textContent.trim().split(/\s+/);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ");

  if (!lastName) {
    console.log("[Recruiter Lens] LinkedIn parser: lastName empty, returning null");
    return null;
  }

  // ── LINKEDIN URL (strip tracking params) ──────────────────────────────────
  const cleanUrl = new URL(window.location.href);
  const linkedinUrl = cleanUrl.origin + cleanUrl.pathname.replace(/\/+$/, "");

  // ── PROFILE PHOTO ─────────────────────────────────────────────────────────
  let profilePhotoUrl = null;
  const photoEl =
    document.querySelector(".pv-top-card-profile-picture__image--show, img.profile-photo-edit__preview") ||
    document.querySelector('img[class*="pv-top-card-profile-picture"]') ||
    document.querySelector('img[alt*="' + firstName + '"][width="200"]') ||
    document.querySelector('button[class*="profile-photo"] img') ||
    (topCard ? topCard.querySelector("img[src*='profile-displayphoto']") : null);
  if (photoEl?.src && !photoEl.src.includes("ghost-person")) {
    profilePhotoUrl = photoEl.src;
  }

  // ── LOCATION ──────────────────────────────────────────────────────────────
  let location = null;
  const locationEl =
    document.querySelector(".text-body-small[class*='top-card'] .text-body-small.inline") ||
    document.querySelector(".pv-top-card--list-bullet li.text-body-small") ||
    document.querySelector('span[class*="text-body-small"][class*="inline"]');
  if (locationEl) {
    location = txt(locationEl);
  }
  // SDUI fallback: location is often in a <span> near connections text
  if (!location && topCard) {
    const spans = [...topCard.querySelectorAll("p, span")]; // SDUI puts location in <p>
    for (const s of spans) {
      const t = s.textContent.trim();
      // Location patterns: "City, State", "City, Country", "Greater X Area"
      if (
        t.length > 3 &&
        t.length < 80 &&
        !t.includes("connections") &&
        !t.includes("follower") &&
        !t.includes("Contact info") &&
        (t.includes(",") || t.toLowerCase().includes("area") || t.toLowerCase().includes("region"))
      ) {
        location = t;
        break;
      }
    }
  }

  // ── CONNECTION / FOLLOWER COUNT ───────────────────────────────────────────
  let connectionCount = null;
  let followerCount = null;
  const connTexts = document.querySelectorAll(
    '.text-body-small span, [class*="pv-top-card--list"] span, p'
  );
  for (const el of connTexts) {
    const t = el.textContent.trim().toLowerCase();
    if (t.includes("connections") && !connectionCount) {
      const match = t.match(/([\d,+]+)\s*connections/);
      if (match) connectionCount = match[1].replace(/,/g, "");
    }
    if (t.includes("follower") && !followerCount) {
      const match = t.match(/([\d,+]+)\s*follower/);
      if (match) followerCount = match[1].replace(/,/g, "");
    }
  }

  // ── OPEN TO WORK ─────────────────────────────────────────────────────────
  let openToWork = false;
  const otwEl =
    document.querySelector('[class*="open-to-work"]') ||
    document.querySelector('[class*="openToWork"]') ||
    document.querySelector(".pv-open-to-carousel");
  if (otwEl) {
    openToWork = true;
  }
  // Text fallback
  if (!openToWork) {
    const body = document.body.textContent;
    if (body.includes("#OpenToWork") || body.includes("Open to work")) {
      openToWork = true;
    }
  }

  // ── ABOUT / SUMMARY ──────────────────────────────────────────────────────
  let about = null;
  const aboutSection = findSection("About");
  if (aboutSection) {
    const aboutContent =
      aboutSection.querySelector(
        ".inline-show-more-text, [class*='inline-show-more-text'], div[class*='full-width'] span[aria-hidden='true']"
      ) || aboutSection.querySelector("span[aria-hidden='true']");
    about = txt(aboutContent);
  }
  if (!about) about = sduiAbout();                 // SDUI fallback

  // ── EXPERIENCE ────────────────────────────────────────────────────────────
  const experience = [];
  const expSection = findSection("Experience");
  if (expSection) {
    const expItems = expSection.querySelectorAll(
      "ul.pvs-list > li.artdeco-list__item, ul.pvs-list > li[class*='pvs-list__']"
    );

    for (const li of expItems) {
      const entry = {};

      // Title — usually the first bold span
      const titleSpan = li.querySelector(
        'div[class*="t-bold"] span[aria-hidden="true"], span[class*="t-bold"] span[aria-hidden="true"]'
      );
      entry.title = txt(titleSpan);

      // Company — second line, often has company name or "Company · Full-time"
      const normalSpans = li.querySelectorAll(
        'span[class*="t-normal"]:not([class*="t-black--light"]) span[aria-hidden="true"]'
      );
      if (normalSpans.length > 0) entry.company = txt(normalSpans[0]);

      // Duration — lighter text with date range
      const lightSpans = li.querySelectorAll(
        'span[class*="t-black--light"] span[aria-hidden="true"], span[class*="pvs-entity__caption-wrapper"]'
      );
      for (const ls of lightSpans) {
        const t = txt(ls);
        if (t && (t.includes("–") || t.includes("-") || t.includes("Present") || /\d{4}/.test(t))) {
          entry.dateRange = t;
        }
        if (t && (t.includes("yr") || t.includes("mo") || t.includes("year") || t.includes("month"))) {
          entry.duration = t;
        }
      }

      // Location
      const locSpan = li.querySelector(
        'span[class*="t-black--light"] span[aria-hidden="true"]'
      );
      if (locSpan) {
        const t = txt(locSpan);
        if (t && !t.includes("–") && !t.includes("yr") && !t.includes("mo") && t.includes(",")) {
          entry.location = t;
        }
      }

      // Description — if expanded or available
      const descEl = li.querySelector(
        '.pvs-list__outer-container .inline-show-more-text span[aria-hidden="true"], ' +
        'div[class*="inline-show-more-text"] span[aria-hidden="true"]'
      );
      entry.description = txt(descEl);

      // Company logo URL
      const logoImg = li.querySelector('img[alt*="logo"]');
      entry.companyLogoUrl = logoImg?.src ?? null;

      if (entry.title || entry.company) {
        experience.push(entry);
      }
    }
  }

  if (experience.length === 0) {                   // SDUI fallback
    experience.push(...parseSduiExperience());
  }

  // ── EDUCATION ─────────────────────────────────────────────────────────────
  const education = [];
  const eduSection = findSection("Education");
  if (eduSection) {
    const eduItems = eduSection.querySelectorAll(
      "ul.pvs-list > li.artdeco-list__item, ul.pvs-list > li[class*='pvs-list__']"
    );

    for (const li of eduItems) {
      const entry = {};

      const boldSpan = li.querySelector(
        'div[class*="t-bold"] span[aria-hidden="true"], span[class*="t-bold"] span[aria-hidden="true"]'
      );
      entry.school = txt(boldSpan);

      const normalSpans = li.querySelectorAll(
        'span[class*="t-normal"]:not([class*="t-black--light"]) span[aria-hidden="true"]'
      );
      if (normalSpans.length > 0) entry.degree = txt(normalSpans[0]);
      if (normalSpans.length > 1) entry.fieldOfStudy = txt(normalSpans[1]);

      const lightSpans = li.querySelectorAll(
        'span[class*="t-black--light"] span[aria-hidden="true"]'
      );
      for (const ls of lightSpans) {
        const t = txt(ls);
        if (t && /\d{4}/.test(t)) {
          entry.dateRange = t;
          break;
        }
      }

      const logoImg = li.querySelector("img");
      entry.schoolLogoUrl = logoImg?.src ?? null;

      if (entry.school) {
        education.push(entry);
      }
    }
  }

  if (education.length === 0) {                     // SDUI fallback
    education.push(...parseSduiEducation());
  }

  // ── SKILLS ────────────────────────────────────────────────────────────────
  const skills = [];
  const skillsSection = findSection("Skills");
  if (skillsSection) {
    const skillItems = skillsSection.querySelectorAll(
      "ul.pvs-list > li span[aria-hidden='true'], " +
      "ul.pvs-list > li div[class*='t-bold'] span[aria-hidden='true']"
    );
    const seen = new Set();
    for (const s of skillItems) {
      const t = txt(s);
      if (
        t &&
        t.length > 1 &&
        t.length < 60 &&
        !seen.has(t) &&
        !t.includes("endorsement") &&
        !/^\d+$/.test(t)
      ) {
        seen.add(t);
        skills.push(t);
      }
    }
  }

  if (skills.length === 0) {                        // SDUI fallback
    skills.push(...parseSduiSkills());
  }

  // ── CERTIFICATIONS / LICENSES ─────────────────────────────────────────────
  const certifications = [];
  const certSection = findSection("Licenses") || findSection("Certification");
  if (certSection) {
    const certItems = certSection.querySelectorAll(
      "ul.pvs-list > li"
    );
    for (const li of certItems) {
      const entry = {};
      const boldSpan = li.querySelector(
        'div[class*="t-bold"] span[aria-hidden="true"]'
      );
      entry.name = txt(boldSpan);

      const normalSpan = li.querySelector(
        'span[class*="t-normal"]:not([class*="t-black--light"]) span[aria-hidden="true"]'
      );
      entry.issuer = txt(normalSpan);

      const lightSpan = li.querySelector(
        'span[class*="t-black--light"] span[aria-hidden="true"]'
      );
      entry.date = txt(lightSpan);

      if (entry.name) certifications.push(entry);
    }
  }

  // ── LANGUAGES ─────────────────────────────────────────────────────────────
  const languages = [];
  const langSection = findSection("Language");
  if (langSection) {
    const langItems = langSection.querySelectorAll("ul.pvs-list > li");
    for (const li of langItems) {
      const entry = {};
      const boldSpan = li.querySelector(
        'div[class*="t-bold"] span[aria-hidden="true"]'
      );
      entry.language = txt(boldSpan);
      const normalSpan = li.querySelector(
        'span[class*="t-normal"] span[aria-hidden="true"]'
      );
      entry.proficiency = txt(normalSpan);
      if (entry.language) languages.push(entry);
    }
  }

  // ── VOLUNTEER EXPERIENCE ──────────────────────────────────────────────────
  const volunteer = [];
  const volSection = findSection("Volunteer");
  if (volSection) {
    const volItems = volSection.querySelectorAll("ul.pvs-list > li");
    for (const li of volItems) {
      const entry = {};
      const boldSpan = li.querySelector(
        'div[class*="t-bold"] span[aria-hidden="true"]'
      );
      entry.role = txt(boldSpan);
      const normalSpan = li.querySelector(
        'span[class*="t-normal"]:not([class*="t-black--light"]) span[aria-hidden="true"]'
      );
      entry.organization = txt(normalSpan);
      if (entry.role) volunteer.push(entry);
    }
  }

  // ── HONORS & AWARDS ───────────────────────────────────────────────────────
  const awards = [];
  const awardSection = findSection("Honor") || findSection("Award");
  if (awardSection) {
    const awardItems = awardSection.querySelectorAll("ul.pvs-list > li");
    for (const li of awardItems) {
      const boldSpan = li.querySelector(
        'div[class*="t-bold"] span[aria-hidden="true"]'
      );
      const name = txt(boldSpan);
      if (name) awards.push(name);
    }
  }

  // ── PUBLICATIONS ──────────────────────────────────────────────────────────
  const publications = [];
  const pubSection = findSection("Publication");
  if (pubSection) {
    const pubItems = pubSection.querySelectorAll("ul.pvs-list > li");
    for (const li of pubItems) {
      const boldSpan = li.querySelector(
        'div[class*="t-bold"] span[aria-hidden="true"]'
      );
      const name = txt(boldSpan);
      if (name) publications.push(name);
    }
  }

  // ── PROJECTS ──────────────────────────────────────────────────────────────
  const projects = [];
  const projSection = findSection("Project");
  if (projSection) {
    const projItems = projSection.querySelectorAll("ul.pvs-list > li");
    for (const li of projItems) {
      const entry = {};
      const boldSpan = li.querySelector(
        'div[class*="t-bold"] span[aria-hidden="true"]'
      );
      entry.name = txt(boldSpan);
      const normalSpan = li.querySelector(
        'span[class*="t-normal"]:not([class*="t-black--light"]) span[aria-hidden="true"]'
      );
      entry.description = txt(normalSpan);
      if (entry.name) projects.push(entry);
    }
  }

  // ── RECOMMENDATIONS COUNT ─────────────────────────────────────────────────
  let recommendationCount = null;
  const recSection = findSection("Recommendation");
  if (recSection) {
    const countEl = recSection.querySelector(
      'h2 span[class*="pvs-header__subtitle"], span[class*="t-black--light"]'
    );
    const t = txt(countEl);
    if (t) {
      const match = t.match(/(\d+)/);
      if (match) recommendationCount = parseInt(match[1], 10);
    }
  }

  // ── CONTACT INFO (Email, Phone, Websites, Birthday, Address) ─────────────
  let email = null;
  let phone = null;
  const websites = [];
  let birthday = null;
  let address = null;

  // Contact info overlay (opened via "Contact info" link)
  const contactSections = document.querySelectorAll(
    ".pv-contact-info__contact-type, .ci-email, .ci-phone, .ci-vanity-url, .ci-websites, .ci-birthday, .ci-address"
  );

  for (const section of contactSections) {
    const sectionText = section.textContent.trim().toLowerCase();
    const links = section.querySelectorAll("a");
    const spans = section.querySelectorAll("span");

    // Email
    if (!email) {
      for (const a of links) {
        const href = a.getAttribute("href") || "";
        if (href.startsWith("mailto:")) {
          email = href.replace("mailto:", "").trim();
          break;
        }
      }
      if (!email) {
        for (const s of spans) {
          const t = s.textContent.trim();
          if (t.includes("@") && t.includes(".")) {
            email = t.match(/[\w.+-]+@[\w-]+\.\w+/)?.[0] || null;
            if (email) break;
          }
        }
      }
    }

    // Phone
    if (!phone && /\+?\d[\d\s\-().]{6,}/.test(sectionText)) {
      phone = sectionText.match(/\+?[\d\s\-().]{7,}/)?.[0]?.trim() || null;
    }

    // Websites
    for (const a of links) {
      const href = a.getAttribute("href") || "";
      if (
        href.startsWith("http") &&
        !href.includes("linkedin.com") &&
        !href.includes("mailto:")
      ) {
        const label = txt(a) || href;
        websites.push({ url: href, label });
      }
    }

    // Birthday
    if (sectionText.includes("birthday") || sectionText.includes("born")) {
      for (const s of spans) {
        const t = s.textContent.trim();
        if (/\w+\s+\d{1,2}/.test(t) && !t.toLowerCase().includes("birthday")) {
          birthday = t;
          break;
        }
      }
    }

    // Address
    if (sectionText.includes("address") && !address) {
      for (const s of spans) {
        const t = s.textContent.trim();
        if (t.length > 5 && !t.toLowerCase().includes("address")) {
          address = t;
          break;
        }
      }
    }
  }

  // Broader email fallback
  if (!email) {
    const mailLinks = document.querySelectorAll('a[href^="mailto:"]');
    for (const a of mailLinks) {
      email = a.getAttribute("href").replace("mailto:", "").trim();
      if (email) break;
    }
  }

  // Broader phone fallback
  if (!phone) {
    const phoneLinks = document.querySelectorAll('a[href^="tel:"]');
    for (const a of phoneLinks) {
      phone = a.getAttribute("href").replace("tel:", "").trim();
      if (phone) break;
    }
  }

  // ── INDUSTRY ──────────────────────────────────────────────────────────────
  let industry = null;
  const industryEl = document.querySelector(
    '.pv-top-card--experience-list-item, [class*="top-card-layout__headline-industry"]'
  );
  if (industryEl) {
    const t = txt(industryEl);
    if (t && !t.includes("connections") && !t.includes("follower")) {
      industry = t;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESULT
  // ═══════════════════════════════════════════════════════════════════════════

  const result = {
    // ── Core identity ──
    firstName,
    lastName,
    currentTitle: txt(titleEl),
    currentEmployer: txt(employerEl),
    linkedinUrl,
    platform: PLATFORMS.LINKEDIN,

    // ── Contact ──
    email,
    phone,
    websites: websites.length > 0 ? websites : null,
    address,
    birthday,

    // ── Profile meta ──
    profilePhotoUrl,
    location,
    industry,
    connectionCount,
    followerCount,
    openToWork,
    about,
    recommendationCount,

    // ── Sections (arrays) ──
    experience: experience.length > 0 ? experience : null,
    education:  education.length  > 0 ? education  : null,
    skills:     skills.length     > 0 ? skills     : null,
    certifications: certifications.length > 0 ? certifications : null,
    languages:  languages.length  > 0 ? languages  : null,
    volunteer:  volunteer.length  > 0 ? volunteer  : null,
    awards:     awards.length     > 0 ? awards     : null,
    publications: publications.length > 0 ? publications : null,
    projects:   projects.length   > 0 ? projects   : null,
  };

  console.log("[Recruiter Lens] LinkedIn parser output:", result);
  return result;
}
