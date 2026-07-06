// background.js — Root level, NOT bundled by webpack
// Matches the exact listener pattern from expense-manager's background.js

const BACKEND_URL = "http://localhost:3000"; // TODO: replace with production URL before deploying to AWS
const API_KEY = "welcome123";         // TODO: must match API_KEY in backend .env exactly

console.log("[Recruiter Lens] Background service worker started");

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      console.log("[Recruiter Lens] Background received message:", msg.type, msg.payload);

      switch (msg.type) {

        case "LOOKUP": {
          const { email, phone, linkedinUrl, platform, firstName, lastName, currentEmployer } = msg.payload;
          console.log("[Recruiter Lens] Lookup request sent:", { email, phone, linkedinUrl, platform, firstName, lastName, currentEmployer });

          const res = await fetch(`${BACKEND_URL}/lookup`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-Key": API_KEY,
            },
            body: JSON.stringify({ email, phone, linkedinUrl, platform, firstName, lastName, currentEmployer }),
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || "Lookup failed");
          }

          const result = await res.json();
          console.log("[Recruiter Lens] Lookup response received:", result);
          sendResponse(result);
          break;
        }

        case "ADD_CANDIDATE": {
          console.log("[Recruiter Lens] Add candidate request sent:", msg.payload);

          const res = await fetch(`${BACKEND_URL}/candidate/add`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-Key": API_KEY,
            },
            body: JSON.stringify(msg.payload),
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || "Failed to add candidate");
          }

          const result = await res.json();
          console.log("[Recruiter Lens] Add candidate response received:", result);
          sendResponse(result);
          break;
        }

        case "OPEN_TAB": {
          chrome.tabs.create({ url: msg.payload.url });
          sendResponse({ success: true });
          break;
        }

        case "UPDATE_ICON": {
          const { status } = msg.payload;
          const badges = {
            found:    { text: "✓",   color: "#0a8a4f" },
            notfound: { text: "!",   color: "#d93025" },
            loading:  { text: "...", color: "#888888" },
            error:    { text: "?",   color: "#ff6600" },
          };
          const badge = badges[status] || badges.error;
          chrome.action.setBadgeText({ text: badge.text });
          chrome.action.setBadgeBackgroundColor({ color: badge.color });
          sendResponse({ success: true });
          break;
        }

        default:
          sendResponse({ error: "Unknown message type" });
      }
    } catch (err) {
      console.error("[Recruiter Lens BG Error]:", err);
      sendResponse({ error: err.message });
    }
  })();

  return true; // REQUIRED: keeps message channel open for async
});
