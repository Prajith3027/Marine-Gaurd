import React, { useEffect, useState } from "react";
import { BASE_URL, tokenStore } from "../../services/http";

interface AuthImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src?: string | null;
  fallback?: React.ReactNode;
}

interface AuthVideoProps extends Omit<React.VideoHTMLAttributes<HTMLVideoElement>, "src"> {
  src?: string | null;
  fallback?: React.ReactNode;
}

export function AuthImage({ src, fallback, alt = "Evidence", className, ...props }: AuthImageProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!src) {
      setBlobUrl(null);
      return;
    }
    let active = true;
    let createdUrl: string | null = null;
    const token = tokenStore.get();
    const fullUrl = src.startsWith("http") ? src : `${BASE_URL}${src}`;

    fetch(fullUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load authorized image");
        return res.blob();
      })
      .then((blob) => {
        if (!active) return;
        createdUrl = URL.createObjectURL(blob);
        setBlobUrl(createdUrl);
        setError(false);
      })
      .catch(() => {
        if (active) setError(true);
      });

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [src]);

  if (error || !src) {
    return <>{fallback ?? null}</>;
  }

  if (!blobUrl) {
    return <div className={`animate-pulse bg-slate-200 dark:bg-slate-800 ${className || "w-full h-full"}`} />;
  }

  return <img src={blobUrl} alt={alt} className={className} {...props} />;
}

export function AuthVideo({ src, fallback, className, ...props }: AuthVideoProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!src) {
      setBlobUrl(null);
      return;
    }
    let active = true;
    let createdUrl: string | null = null;
    const token = tokenStore.get();
    const fullUrl = src.startsWith("http") ? src : `${BASE_URL}${src}`;

    fetch(fullUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load authorized video");
        return res.blob();
      })
      .then((blob) => {
        if (!active) return;
        createdUrl = URL.createObjectURL(blob);
        setBlobUrl(createdUrl);
        setError(false);
      })
      .catch(() => {
        if (active) setError(true);
      });

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [src]);

  if (error || !src) {
    return <>{fallback ?? null}</>;
  }

  if (!blobUrl) {
    return <div className={`animate-pulse bg-slate-200 dark:bg-slate-800 ${className || "w-full h-full"}`} />;
  }

  return <video src={blobUrl} controls className={className} {...props} />;
}

/** Open authorized media safely in a new browser tab without token-bearing URL parameters */
export async function openAuthMedia(src: string): Promise<void> {
  const token = tokenStore.get();
  const fullUrl = src.startsWith("http") ? src : `${BASE_URL}${src}`;
  const res = await fetch(fullUrl, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.ok) {
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, "_blank");
  } else {
    alert("Unable to load authorized evidence media.");
  }
}
