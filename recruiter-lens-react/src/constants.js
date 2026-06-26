// constants.js — shared across all src files

export const BACKEND_URL = "http://localhost:3000";
// TODO: replace with production URL before deploying to AWS

export const API_KEY = "your-api-key-here";
// TODO: must match API_KEY in backend .env exactly

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
