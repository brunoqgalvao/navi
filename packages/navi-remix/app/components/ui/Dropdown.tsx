import { useState, useRef, useEffect, type ReactNode } from "react";

interface DropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}

export function Dropdown({
  trigger,
  children,
  align = "left",
  className = "",
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <div onClick={() => setIsOpen(!isOpen)}>{trigger}</div>
      {isOpen && (
        <div
          className={`absolute z-50 mt-1 min-w-[180px] rounded-xl border border-gray-200 bg-white py-1 shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <div onClick={() => setIsOpen(false)}>{children}</div>
        </div>
      )}
    </div>
  );
}

interface DropdownItemProps {
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}

export function DropdownItem({
  onClick,
  children,
  className = "",
  disabled = false,
}: DropdownItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  );
}

interface DropdownSeparatorProps {
  className?: string;
}

export function DropdownSeparator({ className = "" }: DropdownSeparatorProps) {
  return <div className={`my-1 h-px bg-gray-200 ${className}`} />;
}
