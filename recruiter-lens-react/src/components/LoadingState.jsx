// components/LoadingState.jsx
import React from "react";

export default function LoadingState() {
  return (
    <div className="py-6 px-4">
      <div
        className="animate-spin border-4 border-blue-500 border-t-transparent
                   rounded-full w-8 h-8 mx-auto"
      />
      <p className="text-sm text-gray-500 text-center mt-3">
        Checking database...
      </p>
    </div>
  );
}
