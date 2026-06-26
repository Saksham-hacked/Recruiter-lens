const axios = require('axios');
const FormData = require('form-data');
const { getAccessToken } = require('./tokenManager');

const BASE_URL = process.env.ZOHO_BASE_URL;

// ── Org ID cache ──────────────────────────────────────────────────────────────
let cachedOrgId = null;

/**
 * Fetches and caches the Zoho Recruit org ID (needed for building record URLs).
 * Calls /org once and reuses the result for the lifetime of the process.
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
    // Fallback — return null so buildRecordUrl can degrade gracefully
    return null;
  }
}

/**
 * Builds the Zoho Recruit record URL from a candidate id.
 * Uses the org-scoped URL format that actually works in the browser.
 */
async function buildRecordUrl(id) {
  const orgId = await getOrgId();

  if (orgId) {
    return `https://recruit.zoho.in/recruit/org${orgId}/tab/Candidates/${id}`;
  }

  // Fallback if org ID fetch failed
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
    createdTime: record.Created_Time || '',
    zohoRecordUrl: await buildRecordUrl(record.id),
  };
}

/**
 * Search for a candidate in Zoho Recruit.
 * Priority: email > linkedinUrl > phone
 * Returns { found: true, candidate: {...} } or { found: false }
 */
async function searchCandidate({ email, phone, linkedinUrl }) {
  const token = await getAccessToken();
  const headers = { Authorization: `Zoho-oauthtoken ${token}` };

  let searchUrl;

  if (email) {
    searchUrl = `${BASE_URL}/Candidates/search?email=${encodeURIComponent(email)}`;
  } else if (linkedinUrl) {
    searchUrl = `${BASE_URL}/Candidates/search?criteria=(Website:equals:${encodeURIComponent(linkedinUrl)})`;
  } else if (phone) {
    searchUrl = `${BASE_URL}/Candidates/search?phone=${encodeURIComponent(phone)}`;
  }

  try {
    const response = await axios.get(searchUrl, { headers });
    const records = response.data?.data;

    if (!Array.isArray(records) || records.length === 0) {
      return { found: false };
    }

    return {
      found: true,
      candidate: await mapCandidate(records[0]),
    };
  } catch (err) {
    // Zoho returns 204 with no body when nothing is found — axios doesn't error but data is empty
    if (err.response?.status === 204 || err.response?.data?.code === 'NO_CONTENT') {
      return { found: false };
    }

    const zohoMsg = err.response?.data?.message || err.message;
    console.error(`[${new Date().toISOString()}] searchCandidate error:`, zohoMsg);
    throw new Error(`Zoho search failed: ${zohoMsg}`);
  }
}

/**
 * Add (or upsert) a candidate in Zoho Recruit.
 * Duplicate check field: Email.
 * Returns { action: 'created'|'updated', candidateId, zohoRecordUrl }
 */
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
  } = candidateData;

  const token = await getAccessToken();
  const headers = {
    Authorization: `Zoho-oauthtoken ${token}`,
    'Content-Type': 'application/json',
  };

  const payload = {
    data: [
      {
        First_Name: firstName || '',
        Last_Name: lastName,
        Email: email || '',
        Phone: phone || '',
        Current_Employer: currentEmployer || '',
        Current_Job_Title: currentTitle || '',
        Website: linkedinUrl || '',
        Source: source,
        Candidate_Status: 'New',
      },
    ],
    duplicate_check_fields: ['Email'],
  };

  try {
    const response = await axios.post(`${BASE_URL}/Candidates/upsert`, payload, { headers });
    const result = response.data?.data?.[0];

    if (!result) {
      throw new Error('Zoho returned an empty response for addCandidate.');
    }

    const code = result.code;
    const candidateId = String(result.details?.id);

    if (code !== 'SUCCESS' && code !== 'DUPLICATE') {
      throw new Error(`Zoho upsert failed with code: ${code} — ${result.message || ''}`);
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
 * Attach a PDF buffer to a candidate's record as a Resume attachment.
 */
async function attachPdfToCandidate(candidateId, pdfBuffer, filename) {
  const token = await getAccessToken();

  const form = new FormData();
  form.append('file', pdfBuffer, {
    filename,
    contentType: 'application/pdf',
  });
  form.append('attachments_category', 'Resume');

  try {
    await axios.post(`${BASE_URL}/Candidates/${candidateId}/Attachments`, form, {
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        ...form.getHeaders(),
      },
    });
    return true;
  } catch (err) {
    const zohoMsg = err.response?.data?.message || err.message;
    console.error(`[${new Date().toISOString()}] attachPdfToCandidate error:`, zohoMsg);
    throw new Error(`PDF attachment failed: ${zohoMsg}`);
  }
}

/**
 * Create a note on a candidate record.
 * Only called when notes string is non-empty.
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

module.exports = { searchCandidate, addCandidate, attachPdfToCandidate, createNote };
