import { useEffect, useRef } from 'react';

interface Shortcut {
  key: string;
  mod?: boolean; // Cmd/Ctrl
  shift?: boolean;
  handler: () => void;
  when?: () => boolean; // Only fire if this returns true
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      for (const shortcut of shortcutsRef.current) {
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();
        const modMatch = shortcut.mod ? isMod : !isMod;
        const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
        const whenMatch = shortcut.when ? shortcut.when() : true;

        if (keyMatch && modMatch && shiftMatch && whenMatch) {
          e.preventDefault();
          shortcut.handler();
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
