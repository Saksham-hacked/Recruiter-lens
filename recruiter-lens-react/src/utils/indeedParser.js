// utils/indeedParser.js
// Parses candidate data from Indeed Smart Sourcing detail panel + Profile tab.
// Falls back to legacy regular-Indeed selectors if not on Smart Sourcing.
//
// ─────────────────────────────────────────────────────────────────────────────
// SELECTOR STABILITY POLICY
// Indeed styles this UI with Emotion (CSS-in-JS). Class names like `css-whus60`
// and `css-ctk3l3` are content hashes that ROTATE on every frontend deploy, so
// they must NEVER be used as query anchors. This parser targets only:
//   • data-testid / data-cauto-id attributes            (semantic, deploy-stable)
//   • semantic tags: h2, p, span, svg                   (structural)
//   • aria-controls linkage (section button → body)     (structural)
//   • DOM position WITHIN a data-testid-anchored container (bounded & stable)
// If Indeed ships a build and something breaks, the fix is a new data-testid or
// structural anchor — do NOT reach for a css-* class.
// ─────────────────────────────────────────────────────────────────────────────
import { PLATFORMS } from "../constants";

const TAG = "[Recruiter Lens][Indeed]";

// ── Text helpers ──────────────────────────────────────────────────────────────
// svg elements carry no text, so textContent is already icon-safe.
// oneLine: collapse all whitespace (names, titles, dates, locations).
const oneLine = (el) => {
  const t = el?.textContent?.replace(/\s+/g, " ").trim();
  return t || null;
};
// blockText: trim only, preserve internal newlines (summaries, bullet lists).
const blockText = (el) => {
  const t = el?.textContent?.trim();
  return t || null;
};

// Resolve a collapsible section's body via the button's aria-controls target.
function sectionBody(section) {
  if (!section) return null;
  const bodyId = section.querySelector("button")?.getAttribute("aria-controls");
  if (!bodyId) return section; // no collapse wrapper — treat section as its own body
  return section.querySelector(`#${CSS.escape(bodyId)}`) || section;
}

// ── Public entry point ────────────────────────────────────────────────────────
export function parseIndeed() {
  const isSmartSourcing = !!document.querySelector(
    '[data-testid="sourcing-results-layout"]'
  );

  if (isSmartSourcing) {
    console.log(`${TAG} Smart Sourcing detected — parsing detail panel`);
    return parseSmartSourcing();
  }

  console.log(`${TAG} Regular Indeed page — trying legacy selectors`);
  return parseLegacyIndeed();
}

// ── Smart Sourcing parser ─────────────────────────────────────────────────────
function parseSmartSourcing() {
  // ─ Name from detail panel header (cauto-id, always present for open candidate) ─
  const nameEl = document.querySelector('[data-cauto-id="candidate-info-name"]');
  if (!nameEl) {
    console.log(`${TAG} No candidate-info-name element — detail panel not open`);
    return null;
  }

  const rawName = oneLine(nameEl);
  if (!rawName) {
    console.log(`${TAG} candidate-info-name is empty`);
    return null;
  }

  const { firstName, lastName } = parseName(rawName);
  if (!lastName) {
    console.log(`${TAG} Could not extract lastName from "${rawName}"`);
    return null;
  }

  // ─ Profile tab (rendered even when visually hidden; holds nameplate + sections) ─
  const profileTab = document.querySelector('[data-testid="profile-tab-panel"]');

  // ─ Nameplate: headline ("Title · Company") + location, both structural ─
  // name-plate-item contains two rows, each: <div><svg/><span>…</span></div>
  //   row 0 → "Title · Company"   row 1 → "City, ST"
  let currentTitle = null;
  let currentEmployer = null;
  let location = null;

  const namePlateItem = profileTab?.querySelector(
    '[data-testid="name-plate-item"]'
  );
  if (namePlateItem) {
    const rows = Array.from(namePlateItem.children).filter(
      (c) => c.tagName === "DIV"
    );
    const headline = oneLine(rows[0]?.querySelector("span"));
    if (headline) {
      const [t, ...rest] = headline.split(" · ");
      currentTitle = t?.trim() || null;
      currentEmployer = rest.join(" · ").trim() || null;
    }
    location = oneLine(rows[1]?.querySelector("span"));
  }

  // Fallback location: the span in the sibling block after the name button.
  if (!location) location = headerLocation(nameEl);

  // ─ Indeed candidate ID ─
  const selectedCard = document.querySelector(
    '[data-cauto-id^="MATCH_CARD_BASE-"][data-selected="true"]'
  );
  const indeedCandidateId =
    selectedCard?.getAttribute("data-candidate-id") || null;

  // ─ Professional Summary / About ─
  const about = parseProfileSectionText(
    profileTab,
    "profile-section-Professional summary"
  );

  // ─ Experience ─
  const experience = parseExperience(profileTab);

  // Derive title/employer from first experience if nameplate was empty.
  if (!currentTitle && experience.length > 0) currentTitle = experience[0].title;
  if (!currentEmployer && experience.length > 0)
    currentEmployer = experience[0].company;

  // ─ Education ─
  const education = parseEducation(profileTab);

  // ─ Certifications ─
  const certifications = parseCertifications(profileTab);

  // ─ Skills ─
  const skills = parseSkills(profileTab);

  // ─ Languages ─
  const languages = parseLanguages(profileTab);

  // ─ Military Service ─
  const militaryService = parseMilitaryService(profileTab);

  // ─ Activity metadata ─
  const lastActive =
    oneLine(
      document.querySelector(
        "[data-cauto-id='candidate_row_last_active_label']"
      )
    ) || null;
  const resumeUpdated =
    oneLine(
      document.querySelector(
        "[data-cauto-id='candidate_row_recently_updated_label']"
      )
    ) || null;

  const result = {
    firstName,
    lastName,
    currentTitle,
    currentEmployer,
    location,
    email: null, // Not present in Smart Sourcing DOM (comes from GraphQL)
    phone: null,
    linkedinUrl: null,
    about,
    experience,
    education,
    certifications,
    skills,
    languages,
    militaryService,
    indeedCandidateId,
    lastActive,
    resumeUpdated,
    platform: PLATFORMS.INDEED,
  };

  console.log(`${TAG} Smart Sourcing parse complete:`, result);
  return result;
}

// ── Header location fallback ──────────────────────────────────────────────────
// Header layout: <div><button><span cauto-id=candidate-info-name/></button></div>
//                <div/> <div><span>City, ST</span></div>
// Grab the last sibling div's span text, with a light sanity filter so we don't
// pick up an action-button label.
function headerLocation(nameEl) {
  const wrap = nameEl.closest("button")?.parentElement?.parentElement;
  if (!wrap) return null;
  const divs = Array.from(wrap.children).filter((c) => c.tagName === "DIV");
  const candidate = oneLine(divs[divs.length - 1]?.querySelector("span"));
  if (!candidate) return null;
  if (/^(message|not a match|save|message candidate)$/i.test(candidate))
    return null;
  return candidate;
}

// ── Name parsing ──────────────────────────────────────────────────────────────
function parseName(raw) {
  // Handle: "Douglas Morgan", "Dr. CHARLES GREENE",
  //         "Hannah Williams (formerly Michalak)", "christal Smiley"
  let cleaned = raw.replace(/\s*\(.*?\)\s*/g, " ").trim();
  cleaned = cleaned.replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.|Prof\.)\s+/i, "").trim();

  // ALL CAPS → Title Case
  if (cleaned === cleaned.toUpperCase() && cleaned.length > 2) {
    cleaned = cleaned.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
  // lowercase-first → Capitalized
  cleaned = cleaned.replace(/\b[a-z]/, (c) => c.toUpperCase());

  const parts = cleaned.split(/\s+/);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ") || "",
  };
}

// ── Profile section text (e.g. Professional Summary) ──────────────────────────
// The section header <h2> lives in the button, OUTSIDE the collapsible body,
// so body.textContent is the summary text alone. Preserve newlines (bullets).
function parseProfileSectionText(profileTab, testId) {
  if (!profileTab) return null;
  const section = profileTab.querySelector(`[data-testid="${testId}"]`);
  if (!section) return null;
  return blockText(sectionBody(section));
}

// ── Experience parsing ────────────────────────────────────────────────────────
// Each block: [data-testid^="experienceSection-"]  (company also in the suffix)
//   > div > [companyLogoTag] + <info div>
//       info: <span>Title</span> <span>·</span> <span>Company</span>
//             <div><div><span>dates</span><span>·</span><span>duration</span></div></div>
//   > … <p> description </p>
function parseExperience(profileTab) {
  if (!profileTab) return [];

  const sections = profileTab.querySelectorAll(
    '[data-testid^="experienceSection-"]'
  );
  if (sections.length === 0) return [];

  console.log(`${TAG} Found ${sections.length} experience sections`);

  return Array.from(sections)
    .map((section) => {
      try {
        // Company from the data-testid suffix — the single most stable anchor.
        const testId = section.getAttribute("data-testid") || "";
        const companyFromAttr = testId.replace("experienceSection-", "");

        const logoTag = section.querySelector('[data-testid="companyLogoTag"]');
        const infoContainer = logoTag?.nextElementSibling;

        let title = null;
        let company = companyFromAttr || null;
        let dateRange = null;
        let duration = null;
        let location = null;

        if (infoContainer) {
          const directChildren = Array.from(infoContainer.children);

          // Title: first SPAN that isn't the "·" separator.
          const titleSpan = directChildren.find(
            (el) => el.tagName === "SPAN" && oneLine(el) !== "·"
          );
          title = oneLine(titleSpan);

          // Company: first SPAN after the "·" separator (overrides attr if found).
          const sepIdx = directChildren.findIndex(
            (el) => el.tagName === "SPAN" && oneLine(el) === "·"
          );
          if (sepIdx > -1) {
            const companySpan = directChildren
              .slice(sepIdx + 1)
              .find((el) => el.tagName === "SPAN");
            if (companySpan) company = oneLine(companySpan) || company;
          }

          // Dates: nested DIV within the info container.
          const datesWrapper = directChildren.find((el) => el.tagName === "DIV");
          if (datesWrapper) {
            const innerDiv = datesWrapper.querySelector(":scope > div");
            if (innerDiv) {
              const dateSpans = Array.from(
                innerDiv.querySelectorAll(":scope > span")
              ).filter((s) => oneLine(s) !== "·");
              dateRange = oneLine(dateSpans[0]);
              duration = oneLine(dateSpans[1]);
            }
            const locSpan = Array.from(
              datesWrapper.querySelectorAll(":scope > span")
            ).find((s) => oneLine(s));
            if (locSpan) location = oneLine(locSpan);
          }
        }

        // Description: the <p> holding the resume bullets.
        const description = blockText(section.querySelector("p"));

        return { title, company, dateRange, duration, location, description };
      } catch (err) {
        console.warn(`${TAG} Error parsing experience section:`, err);
        return null;
      }
    })
    .filter(Boolean);
}

// ── Education parsing ─────────────────────────────────────────────────────────
// Each entry: [educationLogoTag] + <info div>
//   info: <span>Degree</span> <span>School · Country</span> <span>dates</span>
function parseEducation(profileTab) {
  if (!profileTab) return [];

  const eduSection = profileTab.querySelector(
    '[data-testid="profile-section-Education"]'
  );
  if (!eduSection) return [];

  const logoTags = eduSection.querySelectorAll(
    '[data-testid="educationLogoTag"]'
  );
  if (logoTags.length === 0) return [];

  console.log(`${TAG} Found ${logoTags.length} education entries`);

  return Array.from(logoTags)
    .map((logo) => {
      try {
        const infoContainer = logo.nextElementSibling;
        if (!infoContainer) return null;

        const spans = infoContainer.querySelectorAll(":scope > span");
        const degree = oneLine(spans[0]);
        const schoolRaw = oneLine(spans[1]);
        const dateRange = oneLine(spans[2]);

        let school = schoolRaw;
        let schoolLocation = null;
        if (schoolRaw && schoolRaw.includes(" · ")) {
          const parts = schoolRaw.split(" · ");
          school = parts[0].trim();
          schoolLocation = parts[1]?.trim() || null;
        }

        return { degree, school, schoolLocation, dateRange };
      } catch (err) {
        console.warn(`${TAG} Error parsing education entry:`, err);
        return null;
      }
    })
    .filter(Boolean);
}

// ── Certifications parsing ────────────────────────────────────────────────────
// Body contains a sub-header <h2>Certifications</h2> (plain text) plus one
// <h2><span>Name</span></h2> per cert, each optionally followed by a sibling
// <span>Issued: …, Expires: …</span>. Cert h2s are the ones with a <span> child;
// header h2s are plain text — that distinction replaces the old hashed classes.
function parseCertifications(profileTab) {
  if (!profileTab) return [];

  const certSection = profileTab.querySelector(
    '[data-testid="profile-section-Certifications & licenses"]'
  );
  if (!certSection) return [];

  const body = sectionBody(certSection);
  const certs = [];

  body.querySelectorAll("h2").forEach((h2) => {
    const nameSpan = h2.querySelector(":scope > span");
    if (!nameSpan) return; // plain-text h2 → section/sub-section header, skip
    const name = oneLine(h2);
    if (!name) return;

    // Date span is the h2's next sibling when present.
    const sib = h2.nextElementSibling;
    const dateText =
      sib && sib.tagName === "SPAN" ? oneLine(sib) : null;

    certs.push({ name, dateText });
  });

  console.log(`${TAG} Found ${certs.length} certifications`);
  return certs;
}

// ── Skills parsing ────────────────────────────────────────────────────────────
// Scoped to the Skills section so we don't pick up Language items, which share
// the "-group-list-item" testid suffix.
function parseSkills(profileTab) {
  if (!profileTab) return [];

  const skillsSection = profileTab.querySelector(
    '[data-testid="profile-section-Skills"]'
  );
  if (!skillsSection) return [];

  const skillItems = skillsSection.querySelectorAll(
    '[data-testid$="-group-list-item"]'
  );

  const skills = Array.from(skillItems)
    .map((item) => {
      const testId = item.getAttribute("data-testid") || "";
      // Prefer the visible text; fall back to the testid suffix.
      return oneLine(item) || testId.replace(/-group-list-item$/, "").trim();
    })
    .filter(Boolean);

  console.log(`${TAG} Found ${skills.length} skills`);
  return skills;
}

// ── Languages parsing ─────────────────────────────────────────────────────────
// Item text: "English – Expert"
function parseLanguages(profileTab) {
  if (!profileTab) return [];

  const langSection = profileTab.querySelector(
    '[data-testid="profile-section-Languages"]'
  );
  if (!langSection) return [];

  const langItems = langSection.querySelectorAll(
    '[data-testid$="-group-list-item"]'
  );

  return Array.from(langItems)
    .map((item) => {
      const text = oneLine(item) || "";
      const parts = text.split(" – ");
      return {
        language: parts[0]?.trim() || text,
        proficiency: parts[1]?.trim() || null,
      };
    })
    .filter((l) => l.language);
}

// ── Military Service parsing ──────────────────────────────────────────────────
// Body: <h2>Branch: <span>US Navy</span></h2>
//       <span>Service Country: <span>US</span></span>
//       <span>Rank: <span>E5</span></span>
//       <span>January 1991 – May 2001</span>
//       <span><span>…description…</span></span>
// Parse by label prefix + a date-range pattern — no hashed classes.
function parseMilitaryService(profileTab) {
  if (!profileTab) return null;

  const milSection = profileTab.querySelector(
    '[data-testid="profile-section-Military Service"]'
  );
  if (!milSection) return null;

  const body = sectionBody(milSection);

  let branch = null;
  let serviceCountry = null;
  let rank = null;
  let dates = null;
  let description = null;

  // Branch lives in the body's own <h2> (not the section-header h2 in the button).
  const branchH2 = body.querySelector("h2");
  if (branchH2) branch = oneLine(branchH2).replace(/^Branch:\s*/i, "") || null;

  const DATE_RE = /\b(?:19|20)\d{2}\b.*(?:–|-|to|present)/i;

  body.querySelectorAll("span").forEach((span) => {
    // Only inspect "leaf-ish" spans to avoid double-counting wrappers.
    const text = oneLine(span);
    if (!text) return;
    if (/^Service Country:/i.test(text) && !serviceCountry) {
      serviceCountry = text.replace(/^Service Country:\s*/i, "").trim();
    } else if (/^Rank:/i.test(text) && !rank) {
      rank = text.replace(/^Rank:\s*/i, "").trim();
    } else if (!dates && DATE_RE.test(text) && text.length < 40) {
      dates = text;
    }
  });

  // Description: longest span block that isn't one of the labelled fields.
  let best = "";
  body.querySelectorAll("span").forEach((span) => {
    const text = blockText(span) || "";
    if (
      /^(Branch:|Service Country:|Rank:)/i.test(text) ||
      DATE_RE.test(text)
    )
      return;
    if (text.length > best.length) best = text;
  });
  description = best || null;

  console.log(`${TAG} Military service: ${branch || "none"}`);
  return { branch, serviceCountry, rank, dates, description };
}

// ── Legacy Indeed parser (regular resume pages) ───────────────────────────────
function parseLegacyIndeed() {
  const nameEl =
    document.querySelector('[data-testid="CandidateName"]') ||
    document.querySelector("h1");

  if (!nameEl) {
    console.log(`${TAG} Legacy parser: nameEl not found, returning null`);
    return null;
  }

  const nameParts = oneLine(nameEl).split(/\s+/);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ");

  if (!lastName) {
    console.log(`${TAG} Legacy parser: lastName empty, returning null`);
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
    currentTitle: oneLine(titleEl),
    currentEmployer: oneLine(employerEl),
    email:
      oneLine(emailEl) || emailEl?.href?.replace("mailto:", "") || null,
    phone: oneLine(phoneEl),
    linkedinUrl: null,
    platform: PLATFORMS.INDEED,
  };

  console.log(`${TAG} Legacy parser output:`, result);
  return result;
}
