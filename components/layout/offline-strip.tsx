"use client";

import { useEffect, useState } from "react";

/** A persistent amber strip while offline — universal state, section 6. */
export function OfflineStrip() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-50 bg-warning-bg px-4 py-1.5 text-center text-[12px] text-warning"
    >
      Offline — showing saved data
    </div>
  );
}
