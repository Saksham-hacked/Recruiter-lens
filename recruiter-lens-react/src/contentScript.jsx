// src/contentScript.jsx
// Entry point compiled by webpack → dist/contentScript.js
// Mounts React into an isolated Shadow DOM so LinkedIn/Indeed CSS can't bleed in.

import React from "react";
import { createRoot } from "react-dom/client";
import Panel from "./components/Panel";
import { detectPlatform } from "./utils/platformDetector";
import tailwindCSS from "./styles.css";

// Guard: only inject on candidate profile pages, and never twice
if (!document.getElementById("recruiter-lens-host") && detectPlatform() !== null) {
  // 1. Host element
  const host = document.createElement("div");
  host.id = "recruiter-lens-host";

  // 2. Shadow DOM (open so devtools can inspect)
  const shadow = host.attachShadow({ mode: "open" });

  // 3. Inject compiled Tailwind CSS into shadow root (no CDN needed)
  const style = document.createElement("style");
  style.textContent = tailwindCSS;
  shadow.appendChild(style);

  // 4. React mount target inside shadow
  const container = document.createElement("div");
  shadow.appendChild(container);

  // 5. Attach host to page
  document.body.appendChild(host);

  // 6. Mount React
  createRoot(container).render(<Panel />);

  console.log("[Recruiter Lens] Panel injected into Shadow DOM");
}
