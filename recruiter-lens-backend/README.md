# Recruiter Lens — Backend

Node.js + Express backend for the Recruiter Lens Chrome Extension. Checks if a candidate exists in Zoho Recruit and adds them if not.

---

## Setup

### 1. Install dependencies

```bash
cd recruiter-lens-backend
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env` and fill in every value:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `PORT` | Port to run the server on (default: 3000) |
| `API_KEY` | A long random secret — the extension sends this as `X-API-Key` |
| `ZOHO_CLIENT_ID` | From your Zoho API Console (India region) |
| `ZOHO_CLIENT_SECRET` | From your Zoho API Console |
| `ZOHO_REDIRECT_URI` | Must exactly match what you registered in Zoho (`http://localhost:3000/oauth/callback`) |
| `ZOHO_BASE_URL` | `https://recruit.zoho.in/recruit/v2` |
| `ZOHO_ACCOUNTS_URL` | `https://accounts.zoho.in/oauth/v2` |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Your Supabase service role key (not the anon key) |

### 3. Create the Supabase table

Run this SQL in your Supabase project's SQL editor:

```sql
CREATE TABLE zoho_tokens (
  id integer PRIMARY KEY,
  access_token text,
  refresh_token text,
  expires_at bigint,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO zoho_tokens (id) VALUES (1);
```

This table always has exactly one row (`id=1`). The token manager reads and writes only that row.

### 4. Create a Zoho API app

1. Go to [https://api-console.zoho.in](https://api-console.zoho.in)
2. Create a **Server-based Application**
3. Set the redirect URI to `http://localhost:3000/oauth/callback`
4. Copy the **Client ID** and **Client Secret** into your `.env`

### 5. Run OAuth setup (one-time only)

Start the server first:

```bash
node index.js
```

Then open this URL in your browser:

```
http://localhost:3000/oauth/start
```

Log in with your Zoho Recruit account, approve access. You'll be redirected to `/oauth/callback` which exchanges the code for tokens and saves them to Supabase. You'll see:

```json
{ "message": "Zoho OAuth setup complete. You can now use the extension." }
```

You never need to do this again. The server auto-refreshes tokens every 45 minutes via a cron job.

### 6. Verify everything works

```
http://localhost:3000/health
```

Should return:

```json
{ "status": "ok", "zohoConnected": true, "timestamp": "..." }
```

---

## Running the server

```bash
# Production
node index.js

# Development (auto-restart on file changes)
npm run dev
```

---

## API Reference

All routes below require the header: `X-API-Key: <your API_KEY>`

### POST /lookup

Check if a candidate exists in Zoho Recruit.

**Request body** (at least one identifier required):
```json
{
  "email": "candidate@example.com",
  "phone": "+91XXXXXXXXXX",
  "linkedinUrl": "https://linkedin.com/in/username",
  "platform": "linkedin"
}
```

**Response (found)**:
```json
{
  "found": true,
  "candidate": {
    "id": "123456",
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "candidate@example.com",
    "phone": "+91XXXXXXXXXX",
    "currentEmployer": "Acme Corp",
    "currentTitle": "Software Engineer",
    "candidateStatus": "New",
    "source": "LinkedIn",
    "website": "https://linkedin.com/in/username",
    "createdTime": "2024-01-01T00:00:00+05:30",
    "zohoRecordUrl": "https://recruit.zoho.in/recruit/TabGenerate.do?module=Candidates&id=123456"
  }
}
```

**Response (not found)**:
```json
{ "found": false }
```

---

### POST /candidate/add

Add a new candidate to Zoho Recruit with a PDF profile attached.

**Request body**:
```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "candidate@example.com",
  "phone": "+91XXXXXXXXXX",
  "currentEmployer": "Acme Corp",
  "currentTitle": "Software Engineer",
  "linkedinUrl": "https://linkedin.com/in/username",
  "source": "LinkedIn",
  "notes": "Strong backend candidate, referred by team."
}
```

- `lastName` and `source` are required
- `source` must be one of: `LinkedIn`, `Indeed`, `Juicebox`

**Response**:
```json
{
  "success": true,
  "action": "created",
  "candidateId": "123456",
  "zohoRecordUrl": "https://recruit.zoho.in/recruit/TabGenerate.do?module=Candidates&id=123456",
  "pdfAttached": true,
  "noteCreated": true
}
```

---

### GET /health _(no API key needed)_

Returns server + Zoho connection status.

---

## Architecture notes

- Tokens are stored in Supabase and auto-refreshed every 45 min via `node-cron`
- All Zoho API calls are isolated in `services/zoho.js`
- PDF generation is in `services/pdfGenerator.js` using pdfkit
- The only security layer is the `X-API-Key` header — this is intentional for an internal tool
- If a PDF or note fails after a candidate is added, the response still returns `success: true` with `pdfAttached: false` or `noteCreated: false` — Zoho record creation is never rolled back
