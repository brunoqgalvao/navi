import { useState, useCallback, useEffect } from "react";
import { API_BASE } from "~/lib/api";

interface MediaItem {
  type: "image" | "audio" | "video";
  src: string;
  alt?: string;
  caption?: string;
}

interface MediaDisplayProps {
  items: MediaItem[];
  layout?: "grid" | "column" | "single";
  basePath?: string;
}

function resolveMediaSrc(src: string, basePath: string): string {
  if (
    src.startsWith("http://") ||
    src.startsWith("https://") ||
    src.startsWith("data:")
  ) {
    return src;
  }
  let fullPath = src;
  if (!src.startsWith("/") && basePath) {
    fullPath = `${basePath}/${src}`;
  }
  return `${API_BASE}/fs/read?path=${encodeURIComponent(fullPath)}&raw=true`;
}

export function MediaDisplay({
  items,
  layout = "grid",
  basePath = "",
}: MediaDisplayProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const imageItems = items.filter((i) => i.type === "image");
  const audioItems = items.filter((i) => i.type === "audio");
  const videoItems = items.filter((i) => i.type === "video");

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
  };

  const nextImage = useCallback(() => {
    setLightboxIndex((i) => (i + 1) % imageItems.length);
  }, [imageItems.length]);

  const prevImage = useCallback(() => {
    setLightboxIndex((i) => (i - 1 + imageItems.length) % imageItems.length);
  }, [imageItems.length]);

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (!lightboxOpen) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowRight") nextImage();
      if (e.key === "ArrowLeft") prevImage();
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [lightboxOpen, nextImage, prevImage]);

  const gridCols =
    imageItems.length === 1
      ? "grid-cols-1"
      : imageItems.length === 2
        ? "grid-cols-2"
        : imageItems.length === 3
          ? "grid-cols-3"
          : "grid-cols-2 md:grid-cols-3";

  return (
    <div className="media-display space-y-3">
      {imageItems.length > 0 && (
        <div
          className={
            layout === "grid"
              ? `grid ${gridCols} gap-2`
              : layout === "column"
                ? "flex flex-col gap-2"
                : ""
          }
        >
          {imageItems.map((item, idx) => (
            <button
              key={idx}
              type="button"
              className="relative overflow-hidden rounded-lg bg-gray-100 hover:opacity-90 transition-opacity cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-blue-500"
              onClick={() => openLightbox(idx)}
            >
              <img
                src={resolveMediaSrc(item.src, basePath)}
                alt={item.alt || "Image"}
                className="w-full h-auto max-h-64 object-cover"
                loading="lazy"
              />
              {item.caption && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-2 py-1 truncate">
                  {item.caption}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {audioItems.length > 0 && (
        <div className="space-y-2">
          {audioItems.map((item, idx) => (
            <div
              key={idx}
              className="bg-gray-50 rounded-lg p-3 border border-gray-200"
            >
              {item.caption && (
                <div className="text-sm text-gray-600 mb-2">{item.caption}</div>
              )}
              <audio controls className="w-full" preload="metadata">
                <source src={resolveMediaSrc(item.src, basePath)} />
                Your browser does not support the audio element.
              </audio>
            </div>
          ))}
        </div>
      )}

      {videoItems.length > 0 && (
        <div className="space-y-2">
          {videoItems.map((item, idx) => (
            <div
              key={idx}
              className="bg-gray-50 rounded-lg overflow-hidden border border-gray-200"
            >
              {item.caption && (
                <div className="text-sm text-gray-600 px-3 py-2 border-b border-gray-200">
                  {item.caption}
                </div>
              )}
              <video controls className="w-full max-h-96" preload="metadata">
                <source src={resolveMediaSrc(item.src, basePath)} />
                Your browser does not support the video element.
              </video>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-10"
            onClick={closeLightbox}
            aria-label="Close lightbox"
          >
            <svg
              className="w-8 h-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          {imageItems.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 transition-colors z-10"
                onClick={prevImage}
                aria-label="Previous image"
              >
                <svg
                  className="w-10 h-10"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>

              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 transition-colors z-10"
                onClick={nextImage}
                aria-label="Next image"
              >
                <svg
                  className="w-10 h-10"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </>
          )}

          <img
            src={resolveMediaSrc(imageItems[lightboxIndex]?.src || "", basePath)}
            alt={imageItems[lightboxIndex]?.alt || "Image"}
            className="max-w-[90vw] max-h-[90vh] object-contain"
          />

          {imageItems[lightboxIndex]?.caption && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-lg text-sm">
              {imageItems[lightboxIndex].caption}
            </div>
          )}

          {imageItems.length > 1 && (
            <div className="absolute bottom-4 right-4 bg-black/70 text-white px-3 py-1 rounded-full text-sm">
              {lightboxIndex + 1} / {imageItems.length}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
