// components/PossibleMatchState.jsx
// Shown when the backend returns name-only match(es) at MEDIUM confidence.
// Name matches are PROBABLE, not certain, so we never auto-merge — the
// recruiter confirms. Confirming enriches the existing record (backfills its
// blank fields); "None of these" falls back to the normal add-new form.
import React, { useState } from "react";
import { useAddCandidate } from "../hooks/useAddCandidate";
import { tabAPI } from "../api";
import AddedState from "./AddedState";
import NotFoundState from "./NotFoundState";
import EnrichPreview from "./EnrichPreview";

function formatDate(v) {
  try {
    return new Date(v).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch (_) {
    return v || "";
  }
}

export default function PossibleMatchState({ candidateData, possibleMatches }) {
  const [addNew, setAddNew] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  // resumeStatus isn't relevant on the enrich path — pass a neutral status.
  const { submit, reset, isSubmitting, result, error } = useAddCandidate(
    candidateData,
    { state: "none" }
  );

  // Two-step: previewing a chosen match shows its diff; confirm commits it.
  if (result?.preview) {
    return (
      <EnrichPreview
        result={result}
        isSubmitting={isSubmitting}
        error={error}
        onConfirm={() => submit({ existingCandidateId: selectedId })}
        onCancel={() => { reset(); setSelectedId(null); }}
      />
    );
  }

  // Successful enrich → same confirmation screen as a normal add.
  if (result) return <AddedState result={result} />;

  // Recruiter said none of these are the person → normal add-new form.
  if (addNew) return <NotFoundState candidateData={candidateData} />;

  const matches = possibleMatches || [];

  return (
    <div className="py-4 px-4">
      {/* Amber warning header */}
      <div className="flex flex-col items-center mb-3">
        <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-1">
          <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <p className="text-amber-600 font-semibold text-base">Possible Match Found</p>
        <p className="text-gray-500 text-xs text-center mt-1">
          Someone with this name is already in the database. Is this the same person?
        </p>
      </div>

      {/* Ranked match cards */}
      <div className="space-y-2">
        {matches.map((m) => (
          <div key={m.id} className="border border-gray-200 rounded-lg p-3">
            <p className="text-gray-900 font-semibold text-sm">
              {m.firstName} {m.lastName}
            </p>

            {(m.currentTitle || m.currentEmployer) && (
              <p className="text-gray-600 text-xs mt-0.5">
                {[m.currentTitle, m.currentEmployer].filter(Boolean).join(" @ ")}
              </p>
            )}

            {(m.city || m.state) && (
              <p className="text-gray-500 text-xs mt-0.5">
                {[m.city, m.state].filter(Boolean).join(", ")}
              </p>
            )}

            <div className="flex items-center gap-2 mt-1">
              {m.source && (
                <span className="bg-gray-100 text-gray-600 text-[10px] px-1.5 py-0.5 rounded">
                  {m.source}
                </span>
              )}
              {m.createdTime && (
                <span className="text-gray-400 text-[10px]">Added {formatDate(m.createdTime)}</span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => { setSelectedId(m.id); submit({ existingCandidateId: m.id, preview: true }); }}
                disabled={isSubmitting}
                className="flex-1 bg-[#1a1a2e] text-white rounded-lg py-1.5 text-xs font-medium
                           hover:bg-[#2a2a3e] transition-colors disabled:opacity-60
                           disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Working…" : "This is them — enrich"}
              </button>
              <button
                onClick={() => tabAPI.openTab(m.zohoRecordUrl)}
                className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-800
                           border border-gray-200 rounded-lg"
                title="Open this record in Zoho"
              >
                View
              </button>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="text-red-500 text-xs mt-2 text-center">{error}</p>}

      {/* None of these → add as new */}
      <button
        onClick={() => setAddNew(true)}
        disabled={isSubmitting}
        className="mt-3 w-full border border-gray-300 text-gray-700 rounded-xl py-2 text-sm
                   font-medium hover:bg-gray-50 transition-colors disabled:opacity-60"
      >
        None of these — add as new
      </button>
    </div>
  );
}
