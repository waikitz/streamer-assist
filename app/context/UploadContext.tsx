"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";

interface UploadContextValue {
  uploading: boolean;
  setUploading: (v: boolean) => void;
}

const UploadContext = createContext<UploadContextValue>({
  uploading: false,
  setUploading: () => {},
});

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [uploading, setUploading] = useState(false);

  // Warn when closing/refreshing the browser tab during upload
  useEffect(() => {
    if (!uploading) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [uploading]);

  return (
    <UploadContext.Provider value={{ uploading, setUploading }}>
      {children}
    </UploadContext.Provider>
  );
}

export function useUpload() {
  return useContext(UploadContext);
}
