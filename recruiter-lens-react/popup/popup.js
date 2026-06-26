// popup.js — plain JS, no React, no bundler

const BACKEND_URL = "http://localhost:3000"; // keep in sync with background.js

async function init() {
  const dotEl         = document.getElementById("status-dot");
  const statusTextEl  = document.getElementById("status-text");
  const lookupValueEl = document.getElementById("lookup-value");

  // ── 1. Health check (no API key — intentionally public) ──────────────────
  try {
    const res = await fetch(`${BACKEND_URL}/health`, { method: "GET" });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.zohoConnected === true) {
        dotEl.classList.add("connected");
        statusTextEl.textContent = "Connected";
      } else {
        dotEl.classList.add("disconnected");
        statusTextEl.textContent = "Zoho Disconnected";
      }
    } else {
      dotEl.classList.add("disconnected");
      statusTextEl.textContent = "Backend Unreachable";
    }
  } catch (_) {
    dotEl.classList.add("disconnected");
    statusTextEl.textContent = "Backend Offline";
  }

  // ── 2. Last lookup result from storage ───────────────────────────────────
  try {
    const data = await new Promise((resolve) =>
      chrome.storage.local.get("lastLookup", resolve)
    );

    const lastLookup = data?.lastLookup;

    if (!lastLookup) {
      lookupValueEl.textContent = "Open a candidate profile to begin";
      return;
    }

    if (lastLookup.status === "found" && lastLookup.candidateName) {
      lookupValueEl.textContent = `${lastLookup.candidateName} — In Database ✓`;
      lookupValueEl.classList.add("in-db");
    } else if (lastLookup.status === "notFound") {
      lookupValueEl.textContent = "Not in Database";
      lookupValueEl.classList.add("not-in-db");
    } else {
      lookupValueEl.textContent = "Open a candidate profile to begin";
    }
  } catch (_) {
    lookupValueEl.textContent = "Open a candidate profile to begin";
  }
}

document.addEventListener("DOMContentLoaded", init);
