const express = require('express');
const {
  addCandidate,
  attachPdfToCandidate,
  createNote,
  fetchIndeedResumeBuffer,
} = require('../services/zoho');
const { generateCandidatePdf } = require('../services/pdfGenerator');

const router = express.Router();

const VALID_SOURCES = ['LinkedIn', 'Indeed', 'Juicebox'];

/**
 * Best-effort contact extraction from a resume PDF buffer.
 *
 * Indeed Smart Sourcing never exposes the candidate's email/phone on the
 * page, so the add form comes in blank for those. The real resume the
 * recruiter downloaded almost always has them in plain text — we pull them
 * out here and use them ONLY to backfill fields the recruiter left empty,
 * never to overwrite something they typed.
 *
 * pdf-parse is lazy-required inside the try/catch so a missing dependency, a
 * scanned/image-only resume, or a parse error degrades gracefully to "no
 * contact found" instead of taking down the whole /candidate/add route.
 */
async function extractContactFromResume(pdfBuffer) {
  try {
    // pdf-parse v2.x replaced the old callable-function API with a
    // PDFParse class (new PDFParse({ data }).getText()). v1.x is still a
    // plain function. Support both shapes so an npm upgrade/downgrade of
    // this dependency doesn't silently break contact extraction again.
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

    if (!text) return {};

    // Email: first RFC-ish match, lowercased for consistency.
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);

    // Phone: tolerate +country codes, spaces, dashes, dots, parens. Require
    // 10–15 digits total so we don't match years, zips, or ID numbers.
    let phone = null;
    const phoneCandidates = text.match(/\+?\d[\d\s().-]{8,}\d/g) || [];
    for (const candidate of phoneCandidates) {
      const digits = candidate.replace(/\D/g, '');
      if (digits.length >= 10 && digits.length <= 15) {
        phone = candidate.trim().replace(/\s+/g, ' ');
        break;
      }
    }

    return {
      email: emailMatch ? emailMatch[0].toLowerCase() : null,
      phone,
    };
  } catch (err) {
    console.warn(
      `[${new Date().toISOString()}] extractContactFromResume — skipped (${err.message})`
    );
    return {};
  }
}

/**
 * POST /candidate/add
 * Adds a new candidate to Zoho Recruit with full rich profile data.
 *
 * Core fields: firstName, lastName*, email, phone, currentEmployer, currentTitle, linkedinUrl, source*, notes
 * Rich fields: location, skills[], about, experience[], experienceTags[], education[],
 *              skillCategories{}, languages[], githubUrl, githubProfile{},
 *              avgTenure, currentTenure, totalExperience
 */
router.post('/add', async (req, res) => {
  console.log(`[${new Date().toISOString()}] /candidate/add — Request body keys:`, Object.keys(req.body).join(', '));

  const {
    // Core fields
    firstName = '',
    lastName,
    email = '',
    phone = '',
    currentEmployer = '',
    currentTitle = '',
    linkedinUrl = '',
    source,
    notes = '',
    // Rich profile data
    location = '',
    skills = [],
    about = '',
    experience = [],
    experienceTags = [],
    education = [],
    skillCategories = {},
    languages = [],
    githubUrl = '',
    githubProfile = null,
    avgTenure = '',
    currentTenure = '',
    totalExperience = '',
    // Indeed Smart Sourcing real-resume presigned S3 URL, captured by the
    // MAIN-world interceptor when the recruiter clicked "Download resume".
    // null for LinkedIn / Juicebox / legacy Indeed pages.
    indeedResumeUrl = null,
  } = req.body;

  // ── Validation ──────────────────────────────────────────────────────────
  if (!lastName) {
    return res.status(400).json({ error: 'lastName is required.' });
  }

  if (!source) {
    return res.status(400).json({ error: 'source is required.' });
  }

  if (!VALID_SOURCES.includes(source)) {
    return res.status(400).json({
      error: `source must be one of: ${VALID_SOURCES.join(', ')}.`,
    });
  }

  // ── Step 0: Fetch the real Indeed resume up front ───────────────────────
  // Done BEFORE the Zoho upsert on purpose:
  //   1. The presigned S3 link expires ~5 min after Indeed minted it, so we
  //      grab the bytes as early as possible.
  //   2. Any email we extract from it can feed the upsert's Email-based
  //      duplicate check below, so a candidate who already exists under that
  //      email gets UPDATED instead of duplicated.
  // Fails safe: any error here just means "no real resume / no extraction"
  // and the normal create-with-generated-summary flow proceeds untouched.
  let indeedResumeBuffer = null;
  let indeedResumeError = null;

  if (indeedResumeUrl) {
    try {
      indeedResumeBuffer = await fetchIndeedResumeBuffer(indeedResumeUrl);
      console.log(
        `[${new Date().toISOString()}] /candidate/add — Indeed resume fetched (${indeedResumeBuffer.length} bytes)`
      );
    } catch (err) {
      indeedResumeError = err.message;
      console.error(
        `[${new Date().toISOString()}] /candidate/add — Indeed resume fetch failed:`,
        err.message
      );
    }
  }

  // Backfill email/phone from the resume ONLY where the recruiter left them
  // blank (Indeed Smart Sourcing hides contact info on the page).
  let resolvedEmail = email;
  let resolvedPhone = phone;
  if (indeedResumeBuffer) {
    const contact = await extractContactFromResume(indeedResumeBuffer);
    if (!resolvedEmail && contact.email) {
      resolvedEmail = contact.email;
      console.log(`[${new Date().toISOString()}] /candidate/add — backfilled email from resume`);
    }
    if (!resolvedPhone && contact.phone) {
      resolvedPhone = contact.phone;
      console.log(`[${new Date().toISOString()}] /candidate/add — backfilled phone from resume`);
    }
  }

  // Bundle all data for downstream services
  const fullCandidateData = {
    firstName, lastName, email: resolvedEmail, phone: resolvedPhone,
    currentEmployer, currentTitle,
    linkedinUrl, source, location, skills, about, experience,
    experienceTags, education, skillCategories, languages,
    githubUrl, githubProfile, avgTenure, currentTenure, totalExperience,
  };

  // ── Step 1: Add / upsert candidate in Zoho ──────────────────────────────
  let zohoResult;
  try {
    zohoResult = await addCandidate(fullCandidateData);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] /candidate/add — Zoho addCandidate failed:`, err.message);
    return res.status(500).json({ error: err.message });
  }

  const { action, candidateId, zohoRecordUrl } = zohoResult;

  // ── Step 2 + 3: Generate PDF and attach it (ONLY when there's no real
  // resume) ─────────────────────────────────────────────────────────────
  // The generated summary is a fallback stand-in for an actual resume. If
  // we already have the candidate's real Indeed resume, attach that alone
  // and skip generating/attaching the summary — no reason to clutter the
  // record with both.
  let pdfAttached = false;
  if (!indeedResumeBuffer) {
    try {
      const pdfBuffer = await generateCandidatePdf(fullCandidateData);

      const filename = `${firstName || 'candidate'}_${lastName}_profile.pdf`
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9._-]/g, '');

      console.log(
        `[${new Date().toISOString()}] /candidate/add — no real resume available, attaching generated summary PDF "${filename}" (${pdfBuffer.length} bytes) to candidate ${candidateId}`
      );
      await attachPdfToCandidate(candidateId, pdfBuffer, filename);
      pdfAttached = true;
      console.log(
        `[${new Date().toISOString()}] /candidate/add — generated summary PDF attached OK for candidate ${candidateId}`
      );
    } catch (err) {
      console.error(
        `[${new Date().toISOString()}] /candidate/add — PDF generation/attachment failed:`,
        err.message
      );
    }
  } else {
    console.log(
      `[${new Date().toISOString()}] /candidate/add — real Indeed resume present, skipping generated summary PDF for candidate ${candidateId}`
    );
  }

  // ── Step 3b: Attach the candidate's REAL resume (Indeed only) ────────────
  // The actual file the recruiter downloaded from Indeed. This is the only
  // attachment when a real resume is available (Step 2+3 above is skipped
  // in that case). indeedResumeError may already be set from the fetch step
  // above; only overwrite it on a fresh attach failure.
  let indeedResumeAttached = false;
  if (indeedResumeBuffer) {
    try {
      const resumeFilename = `${firstName || 'candidate'}_${lastName}_resume.pdf`
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9._-]/g, '');

      console.log(
        `[${new Date().toISOString()}] /candidate/add — attaching real Indeed resume "${resumeFilename}" (${indeedResumeBuffer.length} bytes) to candidate ${candidateId}`
      );
      // 'Resume' category — the generated summary above is attached with no
      // category on purpose so the two uploads don't collide (Zoho allows
      // only one attachment per category per candidate).
      await attachPdfToCandidate(candidateId, indeedResumeBuffer, resumeFilename, 'Resume');
      indeedResumeAttached = true;
      console.log(
        `[${new Date().toISOString()}] /candidate/add — real Indeed resume attached OK for candidate ${candidateId}`
      );
    } catch (err) {
      indeedResumeError = err.message;
      console.error(
        `[${new Date().toISOString()}] /candidate/add — Indeed resume attach failed:`,
        err.message
      );
    }
  }

  // ── Step 4: Create note if provided ─────────────────────────────────────
  let noteCreated = false;
  if (notes && notes.trim().length > 0) {
    try {
      await createNote(candidateId, notes.trim());
      noteCreated = true;
    } catch (err) {
      console.error(
        `[${new Date().toISOString()}] /candidate/add — Note creation failed:`,
        err.message
      );
    }
  }

  // ── Step 5: Respond ─────────────────────────────────────────────────────
  const richFieldCount = [
    skills?.length, experience?.length, education?.length,
    languages?.length, about, githubUrl, githubProfile,
  ].filter(Boolean).length;

  console.log(`[${new Date().toISOString()}] /candidate/add — Success: ${action}, ID: ${candidateId}, rich fields: ${richFieldCount}`);

  return res.json({
    success: true,
    action,
    candidateId,
    zohoRecordUrl,
    pdfAttached,
    noteCreated,
    indeedResumeAttached,
    indeedResumeError,
  });
});

module.exports = router;
