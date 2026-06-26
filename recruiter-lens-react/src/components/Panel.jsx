// components/Panel.jsx
// Root floating panel shell. Uses useLookup for state.
import React from "react";
import { useLookup } from "../hooks/useLookup";
import LoadingState  from "./LoadingState";
import FoundState    from "./FoundState";
import NotFoundState from "./NotFoundState";
import ErrorState    from "./ErrorState";

export default function Panel() {
  const { status, candidate, candidateData, error, retry } = useLookup();

  function closePanel() {
    document.getElementById("recruiter-lens-host")?.remove();
  }

  return (
    <div
      className="fixed right-5 top-20 w-80 z-[999999] bg-white rounded-2xl
                 shadow-2xl border border-gray-100 overflow-hidden"
      style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3
                      border-b border-gray-100 bg-[#1a1a2e]">
        <div className="flex items-center gap-2">
          {/* Simple lens icon */}
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <span className="text-white font-semibold text-sm tracking-wide">
            Recruiter Lens
          </span>
        </div>
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

      {/* ── Body ── */}
      {status === "loading"  && <LoadingState />}
      {status === "found"    && <FoundState candidate={candidate} />}
      {status === "notFound" && <NotFoundState candidateData={candidateData} />}
      {status === "error"    && <ErrorState error={error} onRetry={retry} />}

      {/* idle: nothing — lookup hasn't started yet or platform not detected */}
      {status === "idle" && (
        <div className="py-6 px-4 text-center text-gray-400 text-sm">
          Detecting profile…
        </div>
      )}
    </div>
  );
}
