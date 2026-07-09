const axios = require('axios');
const FormData = require('form-data');
const { getAccessToken } = require('./tokenManager');

const BASE_URL = process.env.ZOHO_BASE_URL;

// ── Org ID cache ──────────────────────────────────────────────────────────────
let cachedOrgId = null;

/**
 * Fetches and caches the Zoho Recruit org ID (needed for building record URLs).
 */
async function getOrgId() {
  if (cachedOrgId) return cachedOrgId;

  const token = await getAccessToken();
  const headers = { Authorization: `Zoho-oauthtoken ${token}` };

  try {
    const response = await axios.get(`${BASE_URL}/org`, { headers });
    const orgs = response.data?.org;

    if (!Array.isArray(orgs) || orgs.length === 0) {
      throw new Error('Zoho /org returned no organizations.');
    }

    cachedOrgId = String(orgs[0].id);
    console.log(`[${new Date().toISOString()}] Cached Zoho org ID: ${cachedOrgId}`);
    return cachedOrgId;
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    console.error(`[${new Date().toISOString()}] getOrgId error:`, msg);
    return null;
  }
}

/**
 * Builds the Zoho Recruit record URL from a candidate id.
 */
async function buildRecordUrl(id) {
  const orgId = await getOrgId();

  if (orgId) {
    return `https://recruit.zoho.in/recruit/org${orgId}/tab/Candidates/${id}`;
  }

  return `https://recruit.zoho.in/recruit/EntityInfo.do?module=Candidates&id=${id}`;
}

/**
 * Maps a raw Zoho candidate record to the shape the extension expects.
 */
async function mapCandidate(record) {
  return {
    id: String(record.id),
    firstName: record.First_Name || '',
    lastName: record.Last_Name || '',
    email: record.Email || '',
    phone: record.Phone || '',
    currentEmployer: record.Current_Employer || '',
    currentTitle: record.Current_Job_Title || '',
    candidateStatus: record.Candidate_Status || '',
    source: record.Source || '',
    website: record.Website || '',
    city: record.City || '',
    state: record.State || '',
    createdTime: record.Created_Time || '',
    zohoRecordUrl: await buildRecordUrl(record.id),
  };
}

/**
 * Escapes a value for safe use inside a Zoho criteria expression.
 *
 * Zoho's criteria query language uses parentheses to group conditions and
 * commas to separate values (e.g. for `in` operators), so a literal `(`,
 * `)`, or `,` inside a *value* — like an employer name such as "Therapy
 * Management Corporation (TMC)" — gets parsed as query syntax instead of
 * literal text, and the whole request comes back as INVALID_QUERY /
 * "invalid query formed". Zoho's docs call for backslash-escaping these
 * characters in the value BEFORE URL-encoding it. Backslashes themselves
 * are escaped first so an already-escaped char doesn't get double-escaped.
 */
function escapeCriteriaValue(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/,/g, '\\,');
}

// ── Name / text normalization for scoring ──────────────────────────────────────
// Pronoun tokens are stripped because LinkedIn pronoun badges ("She/Her") have
// historically contaminated name/title fields on certain page variants.
const PRONOUNS = new Set([
  'he', 'him', 'his', 'she', 'her', 'hers', 'they', 'them', 'their', 'theirs',
]);

function normalizeText(s) {
  if (!s) return '';
  return String(s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')                      // punctuation → space
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(s) {
  return normalizeText(s)
    .split(' ')
    .filter((t) => t.length > 2 && !PRONOUNS.has(t));
}

function tokenOverlap(a, b) {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  let n = 0;
  for (const t of a) if (setB.has(t)) n++;
  return n;
}

// Score a candidate RECORD (mapped) against the PARSED profile. Only used to
// RANK name-based possible matches — never to auto-accept. Employer overlap is
// the strongest corroborator available on the lookup payload today; title and
// location scoring can be added later by threading those fields through the
// lookup request (frontend → background LOOKUP → lookup route → here).
function scoreMatch(parsed, record) {
  return tokenOverlap(tokenize(parsed.currentEmployer), tokenize(record.currentEmployer)) * 3;
}

/**
 * Search for a candidate in Zoho Recruit.
 *
 * Two tiers of confidence:
 *   1. UNIQUE identifiers (email → LinkedIn URL → phone). Each PRESENT one is
 *      tried in priority order; the first hit returns found:true with high
 *      confidence. Trying every present identifier (not just the first) is what
 *      lets a LinkedIn page with Contact info open — email present but that
 *      email not yet on the record — still match on its URL.
 *   2. NAME fallback. Runs whenever no unique identifier matched AND a name is
 *      available. Returns ranked possibleMatches at MEDIUM confidence with
 *      found:false, so the panel asks the recruiter to confirm rather than the
 *      system auto-merging. This is the cross-platform bridge: an Indeed profile
 *      whose email is absent from a LinkedIn-sourced record surfaces that record
 *      here instead of being reported as brand-new (which created duplicates).
 *
 * The name query intentionally does NOT filter by Current_Employer — employer
 * text rarely matches character-for-character across platforms, so filtering on
 * it turned real matches into zero-result misses. Employer feeds scoreMatch
 * for RANKING instead, never as a gate.
 */
async function searchCandidate({ email, phone, linkedinUrl, firstName, lastName, currentEmployer }) {
  const token = await getAccessToken();
  const headers = { Authorization: `Zoho-oauthtoken ${token}` };

  // Run a search URL → array of raw records (empty array = no match / 204).
  async function runSearch(searchUrl) {
    try {
      const response = await axios.get(searchUrl, { headers });
      const records = response.data?.data;
      return Array.isArray(records) ? records : [];
    } catch (err) {
      if (err.response?.status === 204 || err.response?.data?.code === 'NO_CONTENT') {
        return [];
      }
      const zohoMsg = err.response?.data?.message || err.message;
      console.error(`[${new Date().toISOString()}] searchCandidate error:`, zohoMsg);
      throw new Error(`Zoho search failed: ${zohoMsg}`);
    }
  }

  // ── Tier 1: unique identifiers, high confidence ─────────────────────────
  const primaryAttempts = [];
  if (email) {
    primaryAttempts.push(['email', `${BASE_URL}/Candidates/search?email=${encodeURIComponent(email)}`]);
  }
  if (linkedinUrl) {
    primaryAttempts.push(['url', `${BASE_URL}/Candidates/search?criteria=(Website:equals:${encodeURIComponent(escapeCriteriaValue(linkedinUrl))})`]);
  }
  if (phone) {
    primaryAttempts.push(['phone', `${BASE_URL}/Candidates/search?phone=${encodeURIComponent(phone)}`]);
  }

  for (const [matchType, url] of primaryAttempts) {
    const records = await runSearch(url);
    if (records.length > 0) {
      return {
        found: true,
        confidence: 'high',
        matchType,
        candidate: await mapCandidate(records[0]),
      };
    }
  }

  // ── Tier 2: name fallback, medium confidence (recruiter confirms) ───────
  if (firstName && lastName) {
    const criteria = `(First_Name:equals:${encodeURIComponent(escapeCriteriaValue(firstName))})and(Last_Name:equals:${encodeURIComponent(escapeCriteriaValue(lastName))})`;
    const records = await runSearch(`${BASE_URL}/Candidates/search?criteria=${criteria}`);

    if (records.length > 0) {
      const mapped = await Promise.all(records.map((r) => mapCandidate(r)));
      const scored = mapped
        .map((candidate) => ({ candidate, score: scoreMatch({ currentEmployer }, candidate) }))
        .sort((a, b) => b.score - a.score);

      return {
        found: false,
        confidence: 'medium',
        possibleMatches: scored.map((s) => ({ ...s.candidate, matchScore: s.score })),
      };
    }
  }

  // ── Nothing anywhere ────────────────────────────────────────────────────
  return { found: false };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: Parse location string into City / State / Country
// ═══════════════════════════════════════════════════════════════════════════════

function parseLocation(locationStr) {
  if (!locationStr) return {};

  // Expected format: "San Francisco, California, United States"
  const parts = locationStr.split(',').map(s => s.trim()).filter(Boolean);

  if (parts.length >= 3) {
    return { city: parts[0], state: parts[1], country: parts.slice(2).join(', ') };
  }
  if (parts.length === 2) {
    return { city: parts[0], state: parts[1] };
  }
  if (parts.length === 1) {
    return { city: parts[0] };
  }
  return {};
}

// Clamp a string to a max length. Zoho rejects over-length values with
// INVALID_DATA (details.maximum_length names the cap). Zoho Recruit's standard
// address fields (City/State/Country) cap at 30 chars, and LinkedIn "locations"
// are often long region descriptions (e.g. "Greater Minneapolis-St. Paul Area").
// The full, untruncated location is preserved in the Description.
function clampField(value, max) {
  if (value == null) return value;
  const s = String(value);
  return s.length > max ? s.slice(0, max) : s;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: Parse experience string to a number  ("8 yrs 3 mos" → 8, "2 yr" → 2)
// ═══════════════════════════════════════════════════════════════════════════════

function parseExperienceYears(totalExperienceStr) {
  if (!totalExperienceStr) return null;

  const yrMatch = totalExperienceStr.match(/(\d+)\s*(yr|year)/i);
  if (yrMatch) return parseInt(yrMatch[1], 10);

  const moMatch = totalExperienceStr.match(/(\d+)\s*(mo|month)/i);
  if (moMatch) return Math.round(parseInt(moMatch[1], 10) / 12);

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: Build structured Description from rich data (max 32,000 chars)
// ═══════════════════════════════════════════════════════════════════════════════

function buildDescription(data) {
  const lines = [];

  // Full, untruncated location (City/State/Country get clamped to 30 for Zoho).
  if (data.location) {
    lines.push(`Location: ${data.location}`);
    lines.push('');
  }

  // ── About ───────────────────────────────────────────────────────────────
  if (data.about) {
    lines.push('=== ABOUT ===');
    lines.push(data.about);
    lines.push('');
  }

  // ── Experience ──────────────────────────────────────────────────────────
  if (data.experience && data.experience.length > 0) {
    lines.push('=== EXPERIENCE ===');
    for (const exp of data.experience) {
      const titleLine = [exp.title, exp.company].filter(Boolean).join(' at ');
      lines.push(titleLine || '(untitled role)');
      if (exp.dateRange) lines.push(`  Dates: ${exp.dateRange}`);
      if (exp.duration) lines.push(`  Duration: ${exp.duration}`);
      if (exp.location) lines.push(`  Location: ${exp.location}`);
      if (exp.fundingStage) lines.push(`  Funding: ${exp.fundingStage}`);
      if (exp.description) lines.push(`  ${exp.description}`);
      lines.push('');
    }
  }

  // ── Experience Tags ─────────────────────────────────────────────────────
  if (data.experienceTags && data.experienceTags.length > 0) {
    lines.push(`Experience Tags: ${data.experienceTags.join(', ')}`);
    lines.push('');
  }

  // ── Education ───────────────────────────────────────────────────────────
  if (data.education && data.education.length > 0) {
    lines.push('=== EDUCATION ===');
    for (const edu of data.education) {
      lines.push(edu.school || '(unknown school)');
      if (edu.degree) lines.push(`  Degree: ${edu.degree}`);
      if (edu.fieldOfStudy) lines.push(`  Field: ${edu.fieldOfStudy}`);
      if (edu.dateRange) lines.push(`  Dates: ${edu.dateRange}`);
      if (edu.description) lines.push(`  ${edu.description}`);
      lines.push('');
    }
  }

  // ── Skills by category ──────────────────────────────────────────────────
  if (data.skillCategories && Object.keys(data.skillCategories).length > 0) {
    lines.push('=== SKILLS BY CATEGORY ===');
    for (const [cat, skills] of Object.entries(data.skillCategories)) {
      lines.push(`${cat}: ${skills.join(', ')}`);
    }
    lines.push('');
  } else if (data.skills && data.skills.length > 0) {
    lines.push(`=== SKILLS ===`);
    lines.push(data.skills.join(', '));
    lines.push('');
  }

  // ── Languages ───────────────────────────────────────────────────────────
  if (data.languages && data.languages.length > 0) {
    const langList = data.languages.map(l => (typeof l === 'string' ? l : l.language || l)).join(', ');
    lines.push(`Languages: ${langList}`);
    lines.push('');
  }

  // ── GitHub Profile ──────────────────────────────────────────────────────
  if (data.githubProfile) {
    lines.push('=== GITHUB PROFILE ===');
    if (data.githubProfile.username) lines.push(`Username: ${data.githubProfile.username}`);
    if (data.githubProfile.hireable) lines.push('Open to opportunities: Yes');
    if (data.githubProfile.followers != null) lines.push(`Followers: ${data.githubProfile.followers}`);
    if (data.githubProfile.totalCommits != null) lines.push(`Total commits: ${data.githubProfile.totalCommits}`);
    lines.push('');
  }
  if (data.githubUrl) {
    lines.push(`GitHub URL: ${data.githubUrl}`);
    lines.push('');
  }

  // ── Tenure Stats ────────────────────────────────────────────────────────
  const tenureParts = [];
  if (data.avgTenure) tenureParts.push(`Avg tenure: ${data.avgTenure}`);
  if (data.currentTenure) tenureParts.push(`Current tenure: ${data.currentTenure}`);
  if (data.totalExperience) tenureParts.push(`Total experience: ${data.totalExperience}`);
  if (tenureParts.length > 0) {
    lines.push(`Tenure: ${tenureParts.join(' | ')}`);
    lines.push('');
  }

  // ── Source ──────────────────────────────────────────────────────────────
  lines.push(`Source platform: ${data.source || data.platform || 'Unknown'}`);
  lines.push(`Added via Recruiter Lens extension`);

  // Trim to 32,000 chars (Zoho limit)
  const full = lines.join('\n');
  return full.length > 32000 ? full.substring(0, 31997) + '...' : full;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADD CANDIDATE — maps all rich parsed data to Zoho fields
// ═══════════════════════════════════════════════════════════════════════════════

async function addCandidate(candidateData) {
  const {
    firstName,
    lastName,
    email,
    phone,
    currentEmployer,
    currentTitle,
    linkedinUrl,
    source,
    // Rich data fields
    location,
    skills,
    about,
    experience,
    experienceTags,
    education,
    skillCategories,
    languages,
    githubUrl,
    githubProfile,
    avgTenure,
    currentTenure,
    totalExperience,
  } = candidateData;

  const token = await getAccessToken();
  const headers = {
    Authorization: `Zoho-oauthtoken ${token}`,
    'Content-Type': 'application/json',
  };

  // Parse location into city/state/country
  const locParts = parseLocation(location);

  // Parse total experience to a number
  const expYears = parseExperienceYears(totalExperience);

  // Build skills string
  const skillSetStr = (skills && skills.length > 0) ? skills.join(', ') : '';

  // Build the structured Description from all rich data
  const description = buildDescription(candidateData);

  // Build Additional_Info with about text + GitHub
  const additionalParts = [];
  if (about) additionalParts.push(about);
  if (githubUrl) additionalParts.push(`GitHub: ${githubUrl}`);
  const additionalInfo = additionalParts.join('\n\n') || '';

  // Dedup keys. Email alone let the same LinkedIn profile duplicate whenever
  // the first push had a blank email (Contact info overlay not opened) and a
  // later push had it — Zoho can't match on a blank value, so it created a
  // second record. Add Website (the canonical /in/<slug> URL) so the profile
  // matches on URL regardless of email state.
  //
  // ONLY when linkedinUrl is populated: a blank dedup field must never be a
  // matching key. Indeed pushes carry no linkedinUrl, so their dedup list
  // stays ['Email'] exactly as today — working behavior untouched. Juicebox
  // only gains URL dedup when it has a real profile URL. (Evidence that blank
  // values don't match: blank-email Indeed candidates don't merge today, which
  // is why Indeed works — the same reason a blank Website can't false-merge.)
  const duplicateCheckFields = ['Email'];
  if (linkedinUrl) duplicateCheckFields.push('Website');

  const payload = {
    data: [
      {
        First_Name: firstName || '',
        Last_Name: lastName,
        Email: email || '',
        Phone: phone || '',
        Current_Employer: clampField(currentEmployer || '', 100),
        Current_Job_Title: clampField(currentTitle || '', 100),
        Website: linkedinUrl || '',
        Source: source,
        Candidate_Status: 'New',

        // ── New standard field mappings ────────────────────────────────────
        Skill_Set: skillSetStr,
        City: clampField(locParts.city || '', 30),
        State: clampField(locParts.state || '', 30),
        Country: clampField(locParts.country || '', 30),
        Additional_Info: additionalInfo,
        Description: description,
        ...(expYears != null ? { Experience_in_Years: expYears } : {}),
      },
    ],
    duplicate_check_fields: duplicateCheckFields,
  };

  console.log(`[${new Date().toISOString()}] addCandidate — Zoho payload fields:`,
    Object.keys(payload.data[0]).filter(k => payload.data[0][k]).join(', '));

  try {
    const response = await axios.post(`${BASE_URL}/Candidates/upsert`, payload, { headers });
    const result = response.data?.data?.[0];

    if (!result) {
      throw new Error('Zoho returned an empty response for addCandidate.');
    }

    const code = result.code;
    const candidateId = String(result.details?.id);

    if (code !== 'SUCCESS' && code !== 'DUPLICATE') {
      // Surface Zoho's full per-record result. For INVALID_DATA, result.details
      // names the offending field via `api_name` — the one piece of info we need
      // to know *which* field Zoho rejected instead of guessing.
      console.error(
        `[${new Date().toISOString()}] addCandidate — Zoho rejected record:`,
        JSON.stringify(result)
      );
      const detailStr = result.details ? ` (details: ${JSON.stringify(result.details)})` : '';
      throw new Error(`Zoho upsert failed with code: ${code} — ${result.message || ''}${detailStr}`);
    }

    return {
      action: code === 'DUPLICATE' ? 'updated' : 'created',
      candidateId,
      zohoRecordUrl: await buildRecordUrl(candidateId),
    };
  } catch (err) {
    const zohoMsg = err.response?.data?.message || err.message;
    console.error(`[${new Date().toISOString()}] addCandidate error:`, zohoMsg);
    throw new Error(`Zoho addCandidate failed: ${zohoMsg}`);
  }
}

/**
 * Fetch a candidate's real resume PDF from a presigned Indeed S3 URL.
 *
 * This URL is self-contained (AWS SigV4 query params) and requires no auth
 * headers of ours — it's the same request the recruiter's browser would
 * make. It expires 5 minutes after Indeed generated it, so this must be
 * called immediately after the frontend hands it to us, never queued.
 *
 * Throws a distinct, human-readable error for the expired-link case so the
 * caller can surface something more useful than a raw axios/S3 error.
 */
async function fetchIndeedResumeBuffer(presignedUrl) {
  try {
    const response = await axios.get(presignedUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
      validateStatus: () => true, // handle non-2xx ourselves for a clearer message
    });

    if (response.status === 403) {
      // S3 returns 403 (SignatureDoesNotMatch / AccessDenied / Request has
      // expired) once the presigned URL's 5-minute window has passed.
      throw new Error('Indeed resume link expired before it could be fetched');
    }

    if (response.status !== 200) {
      throw new Error(`Indeed returned HTTP ${response.status} fetching the resume file`);
    }

    const contentType = response.headers?.['content-type'] || '';
    if (contentType && !contentType.includes('pdf')) {
      throw new Error(`Unexpected content-type from Indeed resume link: ${contentType}`);
    }

    return Buffer.from(response.data);
  } catch (err) {
    if (err.response) {
      // Shouldn't hit this branch given validateStatus above, but keep as a
      // safety net for network-layer axios errors that still carry a response.
      throw new Error(`Indeed resume fetch failed: HTTP ${err.response.status}`);
    }
    if (err.code === 'ECONNABORTED') {
      throw new Error('Indeed resume fetch timed out');
    }
    // Re-throw our own descriptive errors as-is; wrap anything else.
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/**
 * Attach a PDF buffer to a candidate's record.
 *
 * Zoho only allows a single attachment per attachments_category per
 * candidate — a second upload to the same category comes back as
 * INVALID_DATA ("you are not allowed to attach more than one file to this
 * category"), not a silent overwrite. We attach both the generated summary
 * PDF and the real Indeed resume to the same candidate, so they can't both
 * use 'Resume'. Pass category=null (default) for a general/uncategorized
 * attachment (used for the generated summary); pass 'Resume' explicitly
 * for the candidate's actual resume file.
 */
async function attachPdfToCandidate(candidateId, pdfBuffer, filename, category = null) {
  const token = await getAccessToken();

  const form = new FormData();
  form.append('file', pdfBuffer, {
    filename,
    contentType: 'application/pdf',
  });
  if (category) {
    form.append('attachments_category', category);
  }

  try {
    const response = await axios.post(
      `${BASE_URL}/Candidates/${candidateId}/Attachments`,
      form,
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          ...form.getHeaders(),
        },
      }
    );

    // Zoho's attachment endpoint can return HTTP 200 while embedding an
    // error code in the response body (e.g. bad scope, invalid candidateId).
    // Inspect it explicitly instead of trusting the HTTP status alone —
    // this is the log gap that made the attach step look silent before.
    const result = response.data?.data?.[0];
    const code = result?.code;

    console.log(
      `[${new Date().toISOString()}] attachPdfToCandidate — candidate ${candidateId}, file "${filename}" — Zoho response:`,
      JSON.stringify(response.data)
    );

    if (code && code !== 'SUCCESS') {
      throw new Error(`Zoho rejected attachment (${code}): ${result?.message || 'no message'}`);
    }

    return true;
  } catch (err) {
    const zohoMsg = err.response?.data?.message || err.message;
    console.error(
      `[${new Date().toISOString()}] attachPdfToCandidate error — candidate ${candidateId}, file "${filename}":`,
      zohoMsg,
      err.response?.data ? JSON.stringify(err.response.data) : '(no response body)'
    );
    throw new Error(`PDF attachment failed: ${zohoMsg}`);
  }
}

/**
 * Create a note on a candidate record.
 */
async function createNote(candidateId, noteContent) {
  const token = await getAccessToken();
  const headers = {
    Authorization: `Zoho-oauthtoken ${token}`,
    'Content-Type': 'application/json',
  };

  const payload = {
    data: [
      {
        Note_Title: 'Added via Recruiter Extension',
        Note_Content: noteContent,
        Parent_Id: candidateId,
        se_module: 'Candidates',
      },
    ],
  };

  try {
    await axios.post(`${BASE_URL}/Notes`, payload, { headers });
    return true;
  } catch (err) {
    const zohoMsg = err.response?.data?.message || err.message;
    console.error(`[${new Date().toISOString()}] createNote error:`, zohoMsg);
    throw new Error(`Note creation failed: ${zohoMsg}`);
  }
}

/**
 * Enrich an EXISTING candidate record in place.
 *
 * Called when the recruiter confirms a name-only "possible match" in the panel:
 * we already know the Zoho record id, so instead of upserting (which would risk
 * a duplicate when neither email nor Website matches) we backfill ONLY the
 * fields that are currently blank on that record. Nothing the recruiter already
 * has is ever overwritten. This is what makes one shared DB across three
 * platforms get richer over time: a LinkedIn record with no email gains the
 * Indeed email/phone, so every future encounter matches on a unique identifier.
 */
async function updateCandidate(existingCandidateId, candidateData, { dryRun = false } = {}) {
  const {
    email, phone, currentEmployer, currentTitle, linkedinUrl,
    location, skills, totalExperience,
  } = candidateData;

  const token = await getAccessToken();
  const headers = {
    Authorization: `Zoho-oauthtoken ${token}`,
    'Content-Type': 'application/json',
  };

  // Fetch the existing record so we only fill BLANK fields.
  let existing = {};
  try {
    const getRes = await axios.get(`${BASE_URL}/Candidates/${existingCandidateId}`, { headers });
    existing = getRes.data?.data?.[0] || {};
  } catch (err) {
    const zohoMsg = err.response?.data?.message || err.message;
    console.error(`[${new Date().toISOString()}] updateCandidate — could not fetch record ${existingCandidateId}:`, zohoMsg);
    throw new Error(`Zoho update failed (fetch): ${zohoMsg}`);
  }

  const isBlank = (v) => v == null || String(v).trim() === '';
  const fields = {};
  const enriched = [];

  // Only write when the incoming value is present AND the stored value is blank.
  const backfill = (apiName, value) => {
    if (!isBlank(value) && isBlank(existing[apiName])) {
      fields[apiName] = value;
      enriched.push({ field: apiName, value });
    }
  };

  backfill('Email', email);
  backfill('Phone', phone);
  backfill('Current_Employer', clampField(currentEmployer, 100));
  backfill('Current_Job_Title', clampField(currentTitle, 100));
  backfill('Website', linkedinUrl);

  const locParts = parseLocation(location);
  backfill('City', clampField(locParts.city || '', 30));
  backfill('State', clampField(locParts.state || '', 30));
  backfill('Country', clampField(locParts.country || '', 30));

  const skillSetStr = (skills && skills.length > 0) ? skills.join(', ') : '';
  backfill('Skill_Set', skillSetStr);

  const expYears = parseExperienceYears(totalExperience);
  if (expYears != null) backfill('Experience_in_Years', expYears);

  // Seed Description from rich data only when the existing one is empty — never
  // clobber a Description the record already carries.
  if (isBlank(existing.Description)) {
    const description = buildDescription(candidateData);
    if (!isBlank(description)) {
      fields.Description = description;
      enriched.push({ field: 'Description', value: description });
    }
  }

  // Dry run: return the computed diff (field + value that WOULD be written)
  // without touching Zoho, so the panel can preview it before committing.
  if (dryRun) {
    return { preview: true, action: 'preview', enrichedFields: enriched };
  }

  if (Object.keys(fields).length === 0) {
    console.log(`[${new Date().toISOString()}] updateCandidate — record ${existingCandidateId} already has every field populated; nothing to enrich`);
    return {
      action: 'updated',
      candidateId: String(existingCandidateId),
      zohoRecordUrl: await buildRecordUrl(existingCandidateId),
      enrichedFields: [],
    };
  }

  const payload = { data: [{ id: String(existingCandidateId), ...fields }] };

  console.log(`[${new Date().toISOString()}] updateCandidate — enriching record ${existingCandidateId} with: ${enriched.map((e) => e.field).join(', ')}`);

  try {
    const response = await axios.put(`${BASE_URL}/Candidates`, payload, { headers });
    const result = response.data?.data?.[0];
    const code = result?.code;

    if (code !== 'SUCCESS') {
      console.error(`[${new Date().toISOString()}] updateCandidate — Zoho rejected record:`, JSON.stringify(result));
      const detailStr = result?.details ? ` (details: ${JSON.stringify(result.details)})` : '';
      throw new Error(`Zoho update failed with code: ${code} — ${result?.message || ''}${detailStr}`);
    }

    return {
      action: 'updated',
      candidateId: String(existingCandidateId),
      zohoRecordUrl: await buildRecordUrl(existingCandidateId),
      enrichedFields: enriched,
    };
  } catch (err) {
    const zohoMsg = err.response?.data?.message || err.message;
    console.error(`[${new Date().toISOString()}] updateCandidate error:`, zohoMsg);
    throw new Error(`Zoho updateCandidate failed: ${zohoMsg}`);
  }
}

/**
 * Convert a PDF resume buffer into a .docx buffer.
 *
 * Pure-JS pipeline: extract the PDF's text with pdf-parse (same dual v1/v2
 * export-shape handling used in extractContactFromResume), then rebuild it as
 * a Word document with the `docx` library. This is a TEXT-level conversion —
 * it produces a searchable, editable .docx of the resume's text content, not a
 * pixel-perfect layout clone (no pure-JS library reliably reproduces PDF
 * layout). The original PDF is still attached alongside it for full fidelity.
 *
 * Throws on failure so the caller can log and skip the .docx without disturbing
 * the PDF attachment that already succeeded.
 */
async function convertPdfToDocx(pdfBuffer) {
  // ── Extract text (dual pdf-parse API shape — mirrors extractContactFromResume) ──
  const pdfParseModule = require('pdf-parse');
  let text = '';

  if (typeof pdfParseModule === 'function') {
    // v1.x — callable function, returns { text }
    const parsed = await pdfParseModule(pdfBuffer);
    text = parsed?.text || '';
  } else if (pdfParseModule?.PDFParse) {
    // v2.x — class-based API
    const parser = new pdfParseModule.PDFParse({ data: pdfBuffer });
    try {
      const parsed = await parser.getText();
      text = parsed?.text || '';
    } finally {
      await parser.destroy().catch(() => {});
    }
  } else if (typeof pdfParseModule?.default === 'function') {
    const parsed = await pdfParseModule.default(pdfBuffer);
    text = parsed?.text || '';
  } else {
    throw new Error(
      `Unrecognized pdf-parse export shape: ${Object.keys(pdfParseModule || {}).join(', ') || '(none)'}`
    );
  }

  if (!text.trim()) {
    throw new Error('No extractable text in PDF (scanned/image-only resume?)');
  }

  // ── Rebuild as .docx ────────────────────────────────────────────────────
  const { Document, Packer, Paragraph, TextRun } = require('docx');

  // One Paragraph per line; blank lines become empty paragraphs so the
  // resume's vertical spacing is roughly preserved.
  const paragraphs = text.split(/\r?\n/).map(
    (line) => new Paragraph({ children: [new TextRun(line)] })
  );

  const doc = new Document({ sections: [{ children: paragraphs }] });

  return Packer.toBuffer(doc);
}

/**
 * Attach an arbitrary file buffer to a candidate's record.
 *
 * Generic sibling of attachPdfToCandidate — same Zoho endpoint and the same
 * one-attachment-per-category constraint, but the caller supplies the MIME type
 * so non-PDF files (e.g. the .docx resume copy) attach with the correct content
 * type. attachPdfToCandidate is left untouched for the existing PDF path.
 */
async function attachFileToCandidate(candidateId, fileBuffer, filename, mimeType, category = null) {
  const token = await getAccessToken();

  const form = new FormData();
  form.append('file', fileBuffer, {
    filename,
    contentType: mimeType,
  });
  if (category) {
    form.append('attachments_category', category);
  }

  try {
    const response = await axios.post(
      `${BASE_URL}/Candidates/${candidateId}/Attachments`,
      form,
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          ...form.getHeaders(),
        },
      }
    );

    const result = response.data?.data?.[0];
    const code = result?.code;

    console.log(
      `[${new Date().toISOString()}] attachFileToCandidate — candidate ${candidateId}, file "${filename}" (${mimeType}) — Zoho response:`,
      JSON.stringify(response.data)
    );

    if (code && code !== 'SUCCESS') {
      throw new Error(`Zoho rejected attachment (${code}): ${result?.message || 'no message'}`);
    }

    return true;
  } catch (err) {
    const zohoMsg = err.response?.data?.message || err.message;
    console.error(
      `[${new Date().toISOString()}] attachFileToCandidate error — candidate ${candidateId}, file "${filename}":`,
      zohoMsg,
      err.response?.data ? JSON.stringify(err.response.data) : '(no response body)'
    );
    throw new Error(`File attachment failed: ${zohoMsg}`);
  }
}

module.exports = { searchCandidate, addCandidate, updateCandidate, attachPdfToCandidate, attachFileToCandidate, convertPdfToDocx, createNote, fetchIndeedResumeBuffer };
