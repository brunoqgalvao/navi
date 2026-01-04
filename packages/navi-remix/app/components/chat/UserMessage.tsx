import { useState, useMemo } from "react";
import { CopyButton } from "~/components/ui/CopyButton";
import { MediaDisplay } from "./MediaDisplay";

interface MediaItem {
  type: "image" | "audio" | "video";
  src: string;
  alt?: string;
  caption?: string;
}

interface UserMessageProps {
  content: string;
  timestamp?: Date;
  basePath?: string;
  isEditing?: boolean;
  editContent?: string;
  onEdit?: () => void;
  onSaveEdit?: (content: string) => void;
  onCancelEdit?: () => void;
  onEditContentChange?: (content: string) => void;
  onRollback?: () => void;
  onFork?: () => void;
  onPreview?: (path: string) => void;
}

// Parse media from content (images, audio, video)
function parseMediaContent(text: string): { mediaItems: MediaItem[]; textContent: string } {
  const mediaItems: MediaItem[] = [];
  let textContent = text;

  // Image patterns
  const imageExts = ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp"];
  const audioExts = ["mp3", "wav", "ogg", "flac", "aac", "m4a", "wma"];
  const videoExts = ["mp4", "webm", "mov", "avi", "mkv", "m4v", "ogv"];

  // Match file paths and URLs
  const filePattern = /(?:\/[\w./\-_]+\.(?:png|jpg|jpeg|gif|webp|svg|ico|bmp|mp3|wav|ogg|flac|aac|m4a|wma|mp4|webm|mov|avi|mkv|m4v|ogv))/gi;
  const match = text.match(filePattern);

  if (match) {
    for (const path of match) {
      const ext = path.split(".").pop()?.toLowerCase() || "";
      if (imageExts.includes(ext)) {
        mediaItems.push({ type: "image", src: path });
      } else if (audioExts.includes(ext)) {
        mediaItems.push({ type: "audio", src: path });
      } else if (videoExts.includes(ext)) {
        mediaItems.push({ type: "video", src: path });
      }
      textContent = textContent.replace(path, "").trim();
    }
  }

  return { mediaItems, textContent };
}

export function UserMessage({
  content,
  timestamp,
  basePath = "",
  isEditing = false,
  editContent = "",
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onEditContentChange,
  onRollback,
  onFork,
  onPreview,
}: UserMessageProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [localEditContent, setLocalEditContent] = useState(content);

  // Parse content for @ mentions, files, and media
  const parsed = useMemo(() => {
    // Extract [File: path] patterns
    const filePattern = /\[File: ([^\]]+)\]/g;
    const files: { path: string; name: string }[] = [];
    let cleanText = content;
    let fileMatch;

    while ((fileMatch = filePattern.exec(content)) !== null) {
      const path = fileMatch[1];
      const name = path.split("/").pop() || path;
      files.push({ path, name });
      cleanText = cleanText.replace(fileMatch[0], "");
    }

    // Parse media
    const { mediaItems, textContent } = parseMediaContent(cleanText.trim());

    // Parse @ mentions
    const segments: { type: "text" | "mention"; value: string; path?: string }[] = [];
    const mentionPattern = /@([\w./-]+)/g;
    let lastIndex = 0;
    let mentionMatch;

    while ((mentionMatch = mentionPattern.exec(textContent)) !== null) {
      if (mentionMatch.index > lastIndex) {
        segments.push({ type: "text", value: textContent.slice(lastIndex, mentionMatch.index) });
      }
      const mentionValue = mentionMatch[1];
      const matchedFile = files.find(
        (f) =>
          f.name === mentionValue ||
          f.path.endsWith(mentionValue) ||
          f.path.includes(mentionValue)
      );
      segments.push({
        type: "mention",
        value: mentionValue,
        path: matchedFile?.path || (basePath ? `${basePath}/${mentionValue}` : mentionValue),
      });
      lastIndex = mentionPattern.lastIndex;
    }

    if (lastIndex < textContent.length) {
      segments.push({ type: "text", value: textContent.slice(lastIndex) });
    }

    if (segments.length === 0 && textContent) {
      segments.push({ type: "text", value: textContent });
    }

    return { files, segments, mediaItems };
  }, [content, basePath]);

  const handleSaveEdit = () => {
    const contentToSave = onEditContentChange ? editContent : localEditContent;
    onSaveEdit?.(contentToSave);
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (onEditContentChange) {
      onEditContentChange(e.target.value);
    } else {
      setLocalEditContent(e.target.value);
    }
  };

  const currentEditContent = onEditContentChange ? editContent : localEditContent;

  return (
    <div
      className="flex flex-col items-end gap-1 group relative w-full"
      onClick={() => setShowMenu(false)}
    >
      {isEditing ? (
        <div className="bg-gray-50 border border-gray-300 rounded-2xl rounded-tr-sm p-3 max-w-[85%]">
          <textarea
            value={currentEditContent}
            onChange={handleEditChange}
            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-[15px] text-gray-900 focus:border-gray-400 focus:outline-none resize-none min-h-[60px]"
            rows={3}
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={onCancelEdit}
              className="px-3 py-1 text-xs text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              className="px-3 py-1 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-gray-100 text-gray-900 px-4 py-2.5 rounded-xl rounded-tr-sm text-sm leading-relaxed max-w-[85%] w-fit">
          {/* File attachments */}
          {parsed.files.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1">
              {parsed.files.map((file, i) => (
                <button
                  key={i}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPreview?.(file.path);
                  }}
                  className="flex items-center gap-1 px-2 py-1 bg-gray-200 rounded text-xs hover:bg-gray-300 transition-colors"
                >
                  <svg
                    className="w-3 h-3 text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  {file.name}
                </button>
              ))}
            </div>
          )}

          {/* Media items */}
          {parsed.mediaItems.length > 0 && (
            <div className="mb-2">
              <MediaDisplay
                items={parsed.mediaItems}
                layout={parsed.mediaItems.length === 1 ? "single" : "grid"}
                basePath={basePath}
              />
            </div>
          )}

          {/* Text content with mentions */}
          {parsed.segments.length > 0 && (
            <div className="break-words whitespace-pre-wrap">
              {parsed.segments.map((segment, i) =>
                segment.type === "mention" ? (
                  <button
                    key={i}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPreview?.(segment.path || segment.value);
                    }}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-sm font-medium hover:bg-blue-200 transition-colors"
                  >
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    {segment.value}
                  </button>
                ) : (
                  <span key={i}>{segment.value}</span>
                )
              )}
            </div>
          )}
        </div>
      )}

      {/* Hover actions */}
      <div className="absolute -top-8 right-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white border border-gray-200 rounded-lg shadow-sm px-1 py-0.5 z-20">
        <CopyButton text={content} />
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
            title="More actions"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
              />
            </svg>
          </button>
          {showMenu && (
            <div
              className="absolute right-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => {
                  onEdit?.();
                  setShowMenu(false);
                }}
                className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <svg
                  className="w-3.5 h-3.5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
                Edit
              </button>
              <button
                onClick={() => {
                  onRollback?.();
                  setShowMenu(false);
                }}
                className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <svg
                  className="w-3.5 h-3.5 text-amber-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                  />
                </svg>
                Rollback to here
              </button>
              <button
                onClick={() => {
                  onFork?.();
                  setShowMenu(false);
                }}
                className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <svg
                  className="w-3.5 h-3.5 text-blue-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                  />
                </svg>
                Fork from here
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Timestamp on hover */}
      {timestamp && (
        <span className="text-[10px] text-gray-400 mt-0.5 mr-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      )}
    </div>
  );
}
