// components/Panel.jsx
// Root floating panel shell. Uses useLookup for state.
import React, { useState } from "react";
import { useLookup } from "../hooks/useLookup";
import { useDraggable } from "../hooks/useDraggable";
import LoadingState  from "./LoadingState";
import FoundState    from "./FoundState";
import NotFoundState from "./NotFoundState";
import ErrorState    from "./ErrorState";

export default function Panel() {
  const { status, candidate, candidateData, error, retry } = useLookup();
  const [collapsed, setCollapsed] = useState(false);
  const { pos, dragHandlers } = useDraggable();

  function closePanel() {
    document.getElementById("recruiter-lens-host")?.remove();
  }

  // ── Collapsed: small floating badge, draggable, click to reopen ──
  if (collapsed) {
    return (
      <button
        {...dragHandlers}
        onClick={(e) => {
          // Only treat as a click (not the end of a drag) if pointer barely moved
          setCollapsed(false);
        }}
        style={{
          position: "fixed",
          left: pos.x,
          top: pos.y,
          zIndex: 999999,
          touchAction: "none",
        }}
        className="w-12 h-12 rounded-full bg-[#1a1a2e] shadow-2xl flex items-center
                   justify-center cursor-grab active:cursor-grabbing select-none"
        aria-label="Expand Recruiter Lens"
      >
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
        </svg>
      </button>
    );
  }

  return (
    <div
      className="fixed w-80 z-[999999] bg-white rounded-2xl
                 shadow-2xl border border-gray-100 flex flex-col"
      style={{
        left: pos.x,
        top: pos.y,
        fontFamily: "system-ui, -apple-system, sans-serif",
        maxHeight: "calc(100vh - 100px)",
      }}
    >
      {/* ── Header (drag handle, fixed, never scrolls) ── */}
      <div
        {...dragHandlers}
        style={{ touchAction: "none" }}
        className="flex items-center justify-between px-4 py-3
                   border-b border-gray-100 bg-[#1a1a2e] rounded-t-2xl shrink-0
                   cursor-grab active:cursor-grabbing select-none"
      >
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <span className="text-white font-semibold text-sm tracking-wide">
            Recruiter Lens
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={retry}
            disabled={status === "loading"}
            className="text-gray-300 hover:text-white transition-colors p-0.5 rounded
                       disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Re-parse page"
            title="Re-parse this profile (use after the page has fully loaded / scrolled)"
          >
            <svg
              className={`w-4 h-4 ${status === "loading" ? "animate-spin" : ""}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={() => setCollapsed(true)}
            className="text-gray-300 hover:text-white transition-colors p-0.5 rounded"
            aria-label="Minimize"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
            </svg>
          </button>
          <button
            onClick={closePanel}
            className="text-gray-300 hover:text-white transition-colors p-0.5 rounded"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Body (scrollable) ── */}
      <div className="overflow-y-auto overscroll-contain" style={{ scrollbarWidth: "thin" }}>
        {status === "loading"  && <LoadingState />}
        {status === "found"    && <FoundState candidate={candidate} />}
        {status === "notFound" && <NotFoundState candidateData={candidateData} />}
        {status === "error"    && <ErrorState error={error} onRetry={retry} />}

        {status === "idle" && (
          <div className="py-6 px-4 text-center text-gray-400 text-sm">
            Detecting profile…
          </div>
        )}
      </div>
    </div>
  );
}
