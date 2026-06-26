// components/FoundState.jsx
import React from "react";
import { tabAPI } from "../api";

export default function FoundState({ candidate }) {
  const {
    firstName,
    lastName,
    currentTitle,
    currentEmployer,
    candidateStatus,
    createdTime,
    zohoRecordUrl,
  } = candidate;

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
    </div>
  );
}
