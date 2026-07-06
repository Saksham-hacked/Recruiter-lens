// hooks/useAddCandidate.js
// Manages the add-candidate form state and submission.
// Sends both user-editable core fields AND all rich parsed data to the backend.
import { useState } from "react";
import { candidateAPI } from "../api";

export function useAddCandidate(candidateData, resumeStatus = { state: "none" }) {
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

    // Indeed-only: block submit on a stale resume capture rather than
    // silently sending the backend a presigned URL that's certain to have
    // expired by the time it tries to fetch it. The recruiter needs to
    // re-click "Download resume" on the page to refresh the capture.
    if (resumeStatus.state === "stale") {
      setError("Resume link expired — click \u201cDownload resume\u201d again on the page, then try again.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      // Merge user-editable form fields with all rich parsed data
      const payload = {
        // Core fields (user can edit these in the form)
        firstName:       formData.firstName       || null,
        lastName:        formData.lastName,
        email:           formData.email           || null,
        phone:           formData.phone           || null,
        currentEmployer: formData.currentEmployer || null,
        currentTitle:    formData.currentTitle    || null,
        linkedinUrl:     formData.linkedinUrl     || null,
        source:          formData.source,
        notes:           formData.notes           || null,

        // Rich parsed data (passed through from parser, not user-editable)
        location:         candidateData?.location         || null,
        skills:           candidateData?.skills           || null,
        about:            candidateData?.about            || null,
        experience:       candidateData?.experience       || null,
        experienceTags:   candidateData?.experienceTags   || null,
        education:        candidateData?.education        || null,
        skillCategories:  candidateData?.skillCategories  || null,
        languages:        candidateData?.languages        || null,
        githubUrl:        candidateData?.githubUrl        || null,
        githubProfile:    candidateData?.githubProfile    || null,
        avgTenure:        candidateData?.avgTenure        || null,
        currentTenure:    candidateData?.currentTenure    || null,
        totalExperience:  candidateData?.totalExperience  || null,

        // Indeed real-resume attachment (captured via MAIN-world interceptor
        // watching the page's own "Download resume" GraphQL call). null when
        // never captured, captured for a different candidate, or the panel
        // isn't on Indeed — backend treats this as "no real resume to attach"
        // and still attaches the generated summary PDF as normal.
        indeedResumeUrl:  resumeStatus.state === "ready" ? resumeStatus.pdfResumeUrl : null,
      };

      console.log("[Recruiter Lens] Add candidate request sent:", {
        ...payload,
        // Summarize arrays for cleaner logging
        skills: payload.skills ? `[${payload.skills.length} skills]` : null,
        experience: payload.experience ? `[${payload.experience.length} entries]` : null,
        education: payload.education ? `[${payload.education.length} entries]` : null,
      });

      const response = await candidateAPI.addCandidate(payload);
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
