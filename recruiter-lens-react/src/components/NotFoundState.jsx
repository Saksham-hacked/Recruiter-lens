// components/NotFoundState.jsx
import React, { useState } from "react";
import { useAddCandidate } from "../hooks/useAddCandidate";
import { PLATFORMS } from "../constants";
import AddedState from "./AddedState";

const INPUT_BASE =
  "border border-gray-200 rounded-lg px-3 py-2 text-sm w-full " +
  "focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";

const INPUT_READONLY =
  "border border-gray-200 rounded-lg px-3 py-2 text-sm w-full " +
  "focus:outline-none bg-gray-50 cursor-not-allowed";

export default function NotFoundState({ candidateData }) {
  const { formData, updateField, submit, isSubmitting, result, error } =
    useAddCandidate(candidateData);

  const [lastNameTouched, setLastNameTouched] = useState(false);

  // Once successfully added, swap to AddedState
  if (result) {
    return <AddedState result={result} />;
  }

  const isLinkedIn = candidateData?.platform === PLATFORMS.LINKEDIN;
  const lastNameInvalid = lastNameTouched && !formData.lastName.trim();

  function handleSubmit() {
    setLastNameTouched(true);
    submit();
  }

  return (
    <div className="py-4 px-4">
      {/* Red X circle */}
      <div className="flex flex-col items-center mb-3">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-1">
          <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                  d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <p className="text-red-600 font-semibold text-base">Not in Database</p>
      </div>

      {/* Form */}
      <div className="space-y-2">
        {/* First Name */}
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">First Name</label>
          <input
            className={INPUT_BASE}
            value={formData.firstName}
            onChange={(e) => updateField("firstName", e.target.value)}
            placeholder="First name"
          />
        </div>

        {/* Last Name */}
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">
            Last Name <span className="text-red-500">*</span>
          </label>
          <input
            className={
              INPUT_BASE +
              (lastNameInvalid ? " border-red-400 focus:ring-red-400" : "")
            }
            value={formData.lastName}
            onChange={(e) => updateField("lastName", e.target.value)}
            onBlur={() => setLastNameTouched(true)}
            placeholder="Last name"
          />
          {lastNameInvalid && (
            <p className="text-red-500 text-xs mt-0.5">Last name is required.</p>
          )}
        </div>

        {/* Email */}
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">Email</label>
          <input
            className={INPUT_BASE}
            value={formData.email}
            onChange={(e) => updateField("email", e.target.value)}
            placeholder="Email"
            type="email"
          />
        </div>

        {/* Phone */}
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">Phone</label>
          <input
            className={INPUT_BASE}
            value={formData.phone}
            onChange={(e) => updateField("phone", e.target.value)}
            placeholder="Phone"
            type="tel"
          />
        </div>

        {/* Current Title */}
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">Current Title</label>
          <input
            className={INPUT_BASE}
            value={formData.currentTitle}
            onChange={(e) => updateField("currentTitle", e.target.value)}
            placeholder="Current title"
          />
        </div>

        {/* Current Employer */}
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">Current Employer</label>
          <input
            className={INPUT_BASE}
            value={formData.currentEmployer}
            onChange={(e) => updateField("currentEmployer", e.target.value)}
            placeholder="Current employer"
          />
        </div>

        {/* LinkedIn URL */}
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">LinkedIn URL</label>
          <input
            className={isLinkedIn ? INPUT_READONLY : INPUT_BASE}
            value={formData.linkedinUrl}
            onChange={(e) => !isLinkedIn && updateField("linkedinUrl", e.target.value)}
            readOnly={isLinkedIn}
            placeholder="LinkedIn URL"
          />
        </div>

        {/* Source */}
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">
            Source <span className="text-red-500">*</span>
          </label>
          <select
            className={INPUT_BASE}
            value={formData.source}
            onChange={(e) => updateField("source", e.target.value)}
          >
            <option value="LinkedIn">LinkedIn</option>
            <option value="Indeed">Indeed</option>
            <option value="Juicebox">Juicebox</option>
          </select>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">Notes</label>
          <textarea
            className={INPUT_BASE}
            rows={2}
            value={formData.notes}
            onChange={(e) => updateField("notes", e.target.value)}
            placeholder="Add a note about this candidate..."
          />
        </div>
      </div>

      {/* Error from hook */}
      {error && (
        <p className="text-red-500 text-xs mt-2 text-center">{error}</p>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="mt-3 w-full bg-[#1a1a2e] text-white rounded-xl py-2.5 font-medium
                   text-sm hover:bg-[#2a2a3e] transition-colors disabled:opacity-60
                   disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isSubmitting ? (
          <>
            <svg className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                 viewBox="0 0 24 24" />
            Adding...
          </>
        ) : (
          "Add to Database"
        )}
      </button>
    </div>
  );
}
