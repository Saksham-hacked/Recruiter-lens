// constants.js — shared across all src files

export const BACKEND_URL = "https://recruiterlens.duckdns.org";
// Production backend (AWS EC2 + Caddy HTTPS). Keep in sync with background.js and popup.js.

export const API_KEY = "welcome123";
// must match API_KEY in backend .env exactly

export const ZOHO_RECORD_BASE =
  "https://recruit.zoho.in/recruit/TabGenerate.do?module=Candidates&id=";

export const MESSAGE_TYPES = {
  LOOKUP: "LOOKUP",
  ADD_CANDIDATE: "ADD_CANDIDATE",
  OPEN_TAB: "OPEN_TAB",
  UPDATE_ICON: "UPDATE_ICON",
};

export const PLATFORMS = {
  LINKEDIN: "LinkedIn",
  INDEED: "Indeed",
  JUICEBOX: "Juicebox",
};
