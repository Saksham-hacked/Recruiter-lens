// components/EnrichPreview.jsx
// Shows the exact field/value diff an enrich WOULD write, before committing.
// result.enrichedFields = [{ field, value }] from the backend dry run.
import React from "react";

// Zoho API field names → friendly labels for the panel.
const LABELS = {
  Email: "Email",
  Phone: "Phone",
  Current_Employer: "Current employer",
  Current_Job_Title: "Job title",
  Website: "Website / LinkedIn",
  City: "City",
  State: "State",
  Country: "Country",
  Skill_Set: "Skills",
  Experience_in_Years: "Experience (years)",
  Description: "Summary / details",
};

function preview(value) {
  const s = String(value ?? "");
  return s.length > 90 ? s.slice(0, 90) + "…" : s;
}

export default function EnrichPreview({ result, onConfirm, onCancel, isSubmitting, error }) {
  const fields = result?.enrichedFields || [];
  const nothing = fields.length === 0;

  return (
    <div className="py-4 px-4">
      <p className="text-gray-900 font-semibold text-sm mb-1">
        {nothing ? "Nothing new to add" : "These fields will be added"}
      </p>
      <p className="text-gray-500 text-xs mb-3">
        {nothing
          ? "This record already has everything on this page. No blank fields to fill."
          : "Only blank fields on the record are filled — nothing existing is overwritten."}
      </p>

      {!nothing && (
        <div className="space-y-1.5 mb-3">
          {fields.map((f) => (
            <div key={f.field} className="border border-gray-200 rounded-lg p-2">
              <p className="text-gray-400 text-[10px] uppercase tracking-wide">
                {LABELS[f.field] || f.field}
              </p>
              <p className="text-gray-800 text-xs mt-0.5 break-words">{preview(f.value)}</p>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-red-500 text-xs mb-2 text-center">{error}</p>}

      <div className="flex items-center gap-2">
        {!nothing && (
          <button
            onClick={onConfirm}
            disabled={isSubmitting}
            className="flex-1 bg-[#1a1a2e] text-white rounded-xl py-2 text-sm font-medium
                       hover:bg-[#2a2a3e] transition-colors disabled:opacity-60
                       disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Enriching…" : `Confirm — add ${fields.length} field${fields.length > 1 ? "s" : ""}`}
          </button>
        )}
        <button
          onClick={onCancel}
          disabled={isSubmitting}
          className={`${nothing ? "flex-1" : ""} px-4 py-2 border border-gray-300 text-gray-700
                     rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors
                     disabled:opacity-60`}
        >
          {nothing ? "Back" : "Cancel"}
        </button>
      </div>
    </div>
  );
}
