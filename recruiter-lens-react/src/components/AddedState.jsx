// components/AddedState.jsx
import React from "react";
import { tabAPI } from "../api";

export default function AddedState({ result }) {
  const { action, zohoRecordUrl, pdfAttached, noteCreated } = result;

  return (
    <div className="py-5 px-4 flex flex-col items-center gap-2">
      {/* Green checkmark circle */}
      <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-1">
        <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <p className="text-green-700 font-bold text-base">Added to Database!</p>

      {/* "Updated" banner — shown if record already existed */}
      {action === "updated" && (
        <div className="w-full bg-yellow-50 border border-yellow-200 text-yellow-800
                        text-xs rounded-lg p-2 text-center mt-1">
          This candidate already existed. Their record was updated.
        </div>
      )}

      {/* Confirmation lines */}
      <div className="w-full mt-1 space-y-1">
        {pdfAttached === true && (
          <p className="text-gray-600 text-xs flex items-center gap-1.5">
            <span className="text-green-500 font-bold">✓</span>
            PDF profile attached
          </p>
        )}
        {noteCreated === true && (
          <p className="text-gray-600 text-xs flex items-center gap-1.5">
            <span className="text-green-500 font-bold">✓</span>
            Note saved
          </p>
        )}
      </div>

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
