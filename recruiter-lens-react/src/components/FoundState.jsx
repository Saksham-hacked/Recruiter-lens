// components/FoundState.jsx
import React from "react";
import { tabAPI } from "../api";
import { useAddCandidate } from "../hooks/useAddCandidate";
import AddedState from "./AddedState";
import EnrichPreview from "./EnrichPreview";

export default function FoundState({ candidate, candidateData }) {
  const {
    id,
    firstName,
    lastName,
    currentTitle,
    currentEmployer,
    candidateStatus,
    createdTime,
    zohoRecordUrl,
  } = candidate;

  // Enrich = backfill the existing record's BLANK fields from what we just
  // parsed on this page (e.g. found by URL on LinkedIn but the record came
  // from Indeed with no LinkedIn sections). Backend never overwrites existing
  // values, so it's safe to offer whenever we're on a real parsed profile.
  const { submit, reset, isSubmitting, result, error } = useAddCandidate(
    candidateData || {},
    { state: "none" }
  );

  // Two-step: first click previews the diff (dry run); confirm commits.
  if (result?.preview) {
    return (
      <EnrichPreview
        result={result}
        isSubmitting={isSubmitting}
        error={error}
        onConfirm={() => submit({ existingCandidateId: id })}
        onCancel={reset}
      />
    );
  }

  // Successful enrich → same confirmation screen as a normal add/update.
  if (result) return <AddedState result={result} />;

  // Format date: "Jan 15, 2024"
  let addedOn = "";
  try {
    addedOn = new Date(createdTime).toLocaleDateString("en-US", {
      month: "short",
      day:   "numeric",
      year:  "numeric",
    });
  } catch (_) {
    addedOn = createdTime ?? "";
  }

  return (
    <div className="py-5 px-4 flex flex-col items-center gap-2">
      {/* Green checkmark circle */}
      <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-1">
        <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <p className="text-green-700 font-semibold text-base">Already in Database</p>

      <p className="text-gray-900 font-bold text-lg text-center">
        {firstName} {lastName}
      </p>

      {(currentTitle || currentEmployer) && (
        <p className="text-gray-600 text-sm text-center">
          {[currentTitle, currentEmployer].filter(Boolean).join(" @ ")}
        </p>
      )}

      {candidateStatus && (
        <span className="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full">
          {candidateStatus}
        </span>
      )}

      {addedOn && (
        <p className="text-gray-400 text-xs">Added on {addedOn}</p>
      )}

      <button
        onClick={() => tabAPI.openTab(zohoRecordUrl)}
        className="mt-3 w-full bg-[#1a1a2e] text-white rounded-xl py-2.5 font-medium
                   text-sm hover:bg-[#2a2a3e] transition-colors"
      >
        View in Zoho
      </button>

      {candidateData && id && (
        <button
          onClick={() => submit({ existingCandidateId: id, preview: true })}
          disabled={isSubmitting}
          className="mt-2 w-full border border-gray-300 text-gray-700 rounded-xl py-2
                     text-sm font-medium hover:bg-gray-50 transition-colors
                     disabled:opacity-60 disabled:cursor-not-allowed"
          title="Preview what would be added to this record (nothing is written yet)"
        >
          {isSubmitting ? "Checking…" : "Enrich with this page's data"}
        </button>
      )}

      {error && <p className="text-red-500 text-xs mt-2 text-center">{error}</p>}
    </div>
  );
}
