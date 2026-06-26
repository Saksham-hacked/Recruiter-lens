// components/ErrorState.jsx
import React from "react";

export default function ErrorState({ error, onRetry }) {
  return (
    <div className="py-6 px-4 flex flex-col items-center gap-2">
      {/* Orange warning circle */}
      <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center mb-1">
        <svg className="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0
                   000-1.71L12.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      </div>

      <p className="text-orange-600 font-semibold text-base">Connection Error</p>

      <p className="text-gray-600 text-sm text-center break-words max-w-full">
        {error || "An unknown error occurred."}
      </p>

      <button
        onClick={onRetry}
        className="mt-3 w-full border border-gray-300 text-gray-700 rounded-xl py-2.5
                   font-medium text-sm hover:bg-gray-50 transition-colors"
      >
        Retry
      </button>
    </div>
  );
}
