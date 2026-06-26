// hooks/useAddCandidate.js
// Manages the add-candidate form state and submission.
import { useState } from "react";
import { candidateAPI } from "../api";

export function useAddCandidate(candidateData) {
  const [formData, setFormData] = useState({
    firstName:       candidateData?.firstName       ?? "",
    lastName:        candidateData?.lastName        ?? "",
    email:           candidateData?.email           ?? "",
    phone:           candidateData?.phone           ?? "",
    currentEmployer: candidateData?.currentEmployer ?? "",
    currentTitle:    candidateData?.currentTitle    ?? "",
    linkedinUrl:     candidateData?.linkedinUrl     ?? "",
    source:          candidateData?.platform        ?? "LinkedIn",
    notes:           "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult]             = useState(null);
  const [error, setError]               = useState(null);

  function updateField(field, value) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  async function submit() {
    // Validate required fields
    if (!formData.lastName.trim()) {
      setError("Last name is required.");
      return;
    }
    if (!formData.source.trim()) {
      setError("Source is required.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      console.log("[Recruiter Lens] Add candidate request sent:", formData);
      const response = await candidateAPI.addCandidate({
        firstName:       formData.firstName       || null,
        lastName:        formData.lastName,
        email:           formData.email           || null,
        phone:           formData.phone           || null,
        currentEmployer: formData.currentEmployer || null,
        currentTitle:    formData.currentTitle    || null,
        linkedinUrl:     formData.linkedinUrl     || null,
        source:          formData.source,
        notes:           formData.notes           || null,
      });
      console.log("[Recruiter Lens] Add candidate response received:", response);
      setResult(response);
    } catch (err) {
      console.log("[Recruiter Lens] Add candidate error:", err.message);
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return { formData, updateField, submit, isSubmitting, result, error };
}
