"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export default function ShopUtmLogger() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const payload = {
      path: pathname,
      query: searchParams.toString(),
      referrer: document.referrer || "",
      userAgent: navigator.userAgent || ""
    };
    void fetch("/api/shop/utm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  }, [pathname, searchParams]);

  return null;
}
