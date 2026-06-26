const express = require('express');
const { addCandidate, attachPdfToCandidate, createNote } = require('../services/zoho');
const { generateCandidatePdf } = require('../services/pdfGenerator');

const router = express.Router();

const VALID_SOURCES = ['LinkedIn', 'Indeed', 'Juicebox'];

/**
 * POST /candidate/add
 * Adds a new candidate to Zoho Recruit, attaches a PDF profile, and optionally adds a note.
 *
 * Body: { firstName, lastName*, email, phone, currentEmployer, currentTitle, linkedinUrl, source*, notes }
 * Response: { success: true, action, candidateId, zohoRecordUrl, pdfAttached, noteCreated }
 */
router.post('/add', async (req, res) => {
  const {
    firstName = '',
    lastName,
    email = '',
    phone = '',
    currentEmployer = '',
    currentTitle = '',
    linkedinUrl = '',
    source,
    notes = '',
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

  // ── Step 1: Add / upsert candidate in Zoho ──────────────────────────────
  let zohoResult;
  try {
    zohoResult = await addCandidate({
      firstName,
      lastName,
      email,
      phone,
      currentEmployer,
      currentTitle,
      linkedinUrl,
      source,
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] /candidate/add — Zoho addCandidate failed:`, err.message);
    return res.status(500).json({ error: err.message });
  }

  const { action, candidateId, zohoRecordUrl } = zohoResult;

  // ── Step 2 + 3: Generate PDF and attach it ──────────────────────────────
  let pdfAttached = false;
  try {
    const pdfBuffer = await generateCandidatePdf({
      firstName,
      lastName,
      email,
      phone,
      currentEmployer,
      currentTitle,
      linkedinUrl,
      source,
    });

    const filename = `${firstName || 'candidate'}_${lastName}_profile.pdf`
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9._-]/g, '');

    await attachPdfToCandidate(candidateId, pdfBuffer, filename);
    pdfAttached = true;
  } catch (err) {
    // Non-fatal — log and continue
    console.error(
      `[${new Date().toISOString()}] /candidate/add — PDF generation/attachment failed:`,
      err.message
    );
  }

  // ── Step 4: Create note if provided ─────────────────────────────────────
  let noteCreated = false;
  if (notes && notes.trim().length > 0) {
    try {
      await createNote(candidateId, notes.trim());
      noteCreated = true;
    } catch (err) {
      // Non-fatal — log and continue
      console.error(
        `[${new Date().toISOString()}] /candidate/add — Note creation failed:`,
        err.message
      );
    }
  }

  // ── Step 5: Respond ─────────────────────────────────────────────────────
  return res.json({
    success: true,
    action,
    candidateId,
    zohoRecordUrl,
    pdfAttached,
    noteCreated,
  });
});

module.exports = router;
