// api.js — ALL chrome.runtime.sendMessage calls live here only.
// Mirrors expense-manager's callBackground pattern exactly.

import { MESSAGE_TYPES } from "./constants";

function callBackground(type, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response) {
        reject(new Error("No response from background"));
        return;
      }
      if (response.error) {
        reject(new Error(response.error));
        return;
      }
      resolve(response);
    });
  });
}

export const lookupAPI = {
  async searchCandidate(lookupPayload) {
    // Pass the full payload through (email/phone/linkedinUrl plus optional
    // fallback identifiers firstName/lastName/currentEmployer). Platforms
    // that already send email/phone/linkedinUrl are unaffected — those fields
    // are still read first by the backend. This only stops silently dropping
    // the fallback fields for platforms (Indeed Smart Sourcing) that don't
    // have email/phone/linkedinUrl available.
    return callBackground(MESSAGE_TYPES.LOOKUP, lookupPayload);
    // Returns { found, candidate? }
  },
};

export const candidateAPI = {
  async addCandidate(candidatePayload) {
    // Pass the entire payload through — includes both core form fields
    // and rich parsed data (skills, experience, education, etc.)
    return callBackground(MESSAGE_TYPES.ADD_CANDIDATE, candidatePayload);
    // Returns { success, action, candidateId, zohoRecordUrl, pdfAttached, noteCreated }
  },
};

export const tabAPI = {
  async openTab(url) {
    return callBackground(MESSAGE_TYPES.OPEN_TAB, { url });
  },
};

export const iconAPI = {
  async updateIcon(status) {
    return callBackground(MESSAGE_TYPES.UPDATE_ICON, { status });
  },
};
