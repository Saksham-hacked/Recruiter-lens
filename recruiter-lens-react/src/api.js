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
  async searchCandidate({ email, phone, linkedinUrl, platform }) {
    return callBackground(MESSAGE_TYPES.LOOKUP, { email, phone, linkedinUrl, platform });
    // Returns { found, candidate? }
  },
};

export const candidateAPI = {
  async addCandidate({
    firstName,
    lastName,
    email,
    phone,
    currentEmployer,
    currentTitle,
    linkedinUrl,
    source,
    notes,
  }) {
    return callBackground(MESSAGE_TYPES.ADD_CANDIDATE, {
      firstName,
      lastName,
      email,
      phone,
      currentEmployer,
      currentTitle,
      linkedinUrl,
      source,
      notes,
    });
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
