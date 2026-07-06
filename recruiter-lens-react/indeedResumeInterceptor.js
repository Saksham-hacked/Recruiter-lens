// indeedResumeInterceptor.js — MAIN-world content script, resumes.indeed.com ONLY.
//
// Passively watches the page's OWN fetch() calls for the GraphQL operation
// ("ProfileAndResumeViewerTokenBased") that Indeed fires when a recruiter
// clicks "Download resume" / "Download profile and resume" from the profile
// dropdown. We never construct, replay, or authenticate this request
// ourselves — the permissionToken/indeed-api-key in that call belong to the
// page's own session. We only read the response the page's own fetch already
// produced, then hand the resulting presigned S3 URL to the isolated content
// script.
//
// Confirmed via HAR capture (2026-07-01):
//   - This operation does NOT fire on page load or scroll — only on the
//     explicit "Download resume" click.
//   - Response shape: data.sourcingProfile.pdfResumeUrl
//   - The URL is a presigned S3 link, valid for 5 minutes (X-Amz-Expires=300).
//
// Communication with the isolated-world content script: MAIN-world globals
// are NOT visible to isolated-world content scripts (separate JS contexts
// sharing only the DOM), so chrome.runtime is unavailable here and
// window.foo assignments won't cross the boundary. We use the one shared
// surface both worlds can read/write: the DOM. A CustomEvent gives the
// isolated script a live signal; a DOM attribute snapshot covers the case
// where the isolated script's listener wasn't attached yet when the capture
// happened (e.g. panel was closed and reopened after the click).
//
// Runs at document_start so window.fetch is patched before Indeed's own
// bundle has a chance to fire the request.

(function () {
  const TAG = "[Recruiter Lens][IndeedResumeInterceptor]";
  const GRAPHQL_HOST = "apis.indeed.com";
  const TARGET_OPERATION = "ProfileAndResumeViewerTokenBased";
  const EVENT_NAME = "recruiter-lens:resume-captured";
  const DOM_ATTR = "data-recruiter-lens-resume";

  // Guard against double-injection (e.g. SPA re-navigation re-running the
  // content script registration).
  if (window.__recruiterLensResumeInterceptorInstalled) return;
  window.__recruiterLensResumeInterceptorInstalled = true;

  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const [resource, init] = args;

    // Read the request's method/body BEFORE calling the original fetch.
    // If `resource` is a Request object, its body stream gets consumed by
    // the underlying fetch call, so cloning it after the fact would fail —
    // we must clone first if we need to read it at all.
    let url = null;
    let method = "GET";
    let bodyText = null;

    try {
      url = typeof resource === "string" ? resource : resource?.url || null;
      method = (
        init?.method ||
        (resource && typeof resource === "object" ? resource.method : null) ||
        "GET"
      ).toUpperCase();

      if (typeof init?.body === "string") {
        bodyText = init.body;
      } else if (resource && typeof resource === "object" && typeof resource.clone === "function") {
        bodyText = await resource.clone().text().catch(() => null);
      }
    } catch (err) {
      // Never let our inspection break the page's own request.
      console.warn(`${TAG} Pre-fetch inspection failed (non-fatal):`, err.message);
    }

    const response = await originalFetch.apply(this, args);

    const isTargetCall =
      url && url.includes(GRAPHQL_HOST) && method === "POST" &&
      bodyText && bodyText.includes(TARGET_OPERATION);

    if (isTargetCall) {
      // Clone the response so we never consume the body the page itself is
      // about to read. Runs async — does not delay returning `response`.
      response
        .clone()
        .json()
        .then((json) => {
          const pdfResumeUrl = json?.data?.sourcingProfile?.pdfResumeUrl;

          if (!pdfResumeUrl) {
            // Recruiter may have chosen "Download profile" only (no resume
            // in that dropdown option), or the response shape changed.
            console.log(`${TAG} ${TARGET_OPERATION} response had no pdfResumeUrl — nothing to capture`);
            return;
          }

          // Best-effort: tag the capture with whichever Smart Sourcing
          // candidate card is currently selected, so the isolated script can
          // confirm it's still looking at the same candidate at submit time.
          const selectedCard = document.querySelector(
            '[data-cauto-id^="MATCH_CARD_BASE-"][data-selected="true"]'
          );
          const candidateId = selectedCard?.getAttribute("data-candidate-id") || null;

          const detail = { pdfResumeUrl, candidateId, capturedAt: Date.now() };

          document.documentElement.setAttribute(DOM_ATTR, JSON.stringify(detail));
          document.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));

          console.log(`${TAG} Captured resume URL for candidate ${candidateId || "(unknown)"}`);
        })
        .catch((err) => {
          // Response wasn't JSON, or the schema changed under us. Fail
          // closed — log it so a schema drift is noticeable, but never
          // throw out of the page's own fetch call.
          console.warn(`${TAG} Could not parse ${TARGET_OPERATION} response (schema may have changed):`, err.message);
        });
    }

    return response;
  };

  console.log(`${TAG} Installed on ${window.location.hostname}`);
})();
