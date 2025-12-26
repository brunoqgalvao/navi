import type { ContentBlock } from "~/lib/claude";

interface UserMessageProps {
  content: ContentBlock[] | string;
  timestamp?: Date;
}

export function UserMessage({ content, timestamp }: UserMessageProps) {
  const renderContent = () => {
    if (typeof content === "string") {
      return <p className="whitespace-pre-wrap">{content}</p>;
    }

    return content.map((block, i) => {
      if (block.type === "text") {
        return (
          <p key={i} className="whitespace-pre-wrap">
            {block.text}
          </p>
        );
      }
      if (block.type === "image") {
        return (
          <img
            key={i}
            src={`data:${block.source.media_type};base64,${block.source.data}`}
            alt="User uploaded"
            className="max-w-sm rounded-lg mt-2"
          />
        );
      }
      return null;
    });
  };

  return (
    <div className="flex justify-end mb-4">
      <div className="max-w-[80%] bg-blue-600 text-white rounded-lg px-4 py-2">
        {renderContent()}
        {timestamp && (
          <p className="text-xs text-blue-200 mt-1 text-right">
            {timestamp.toLocaleTimeString()}
          </p>
        )}
      </div>
    </div>
  );
}
