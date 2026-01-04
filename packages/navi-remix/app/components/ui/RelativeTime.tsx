import { useState, useEffect } from "react";

interface RelativeTimeProps {
  timestamp: number;
  className?: string;
}

function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (weeks < 4) return `${weeks}w ago`;
  if (months < 12) return `${months}mo ago`;
  return `${years}y ago`;
}

export function RelativeTime({ timestamp, className = "" }: RelativeTimeProps) {
  const [relativeTime, setRelativeTime] = useState(() =>
    getRelativeTime(timestamp)
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setRelativeTime(getRelativeTime(timestamp));
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [timestamp]);

  const date = new Date(timestamp);
  const fullDate = date.toLocaleString();

  return (
    <time
      dateTime={date.toISOString()}
      title={fullDate}
      className={`text-zinc-500 ${className}`}
    >
      {relativeTime}
    </time>
  );
}
