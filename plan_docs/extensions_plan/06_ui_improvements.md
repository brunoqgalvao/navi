# UI Improvements - Dashboard

## Changes Implemented

### Dashboard Layout
- Refactored the main container to use a centered layout with `max-w-4xl`.
- Added `bg-gray-50/50` for a subtle background texture.
- Improved spacing and vertical rhythm.

### Header & Branding
- Updated "Claude Code" header to `text-3xl font-bold`.
- Added a subtle rotation animation to the logo on load/hover.
- Centered the branding elements for a cleaner focus.

### "Create New Project" Button
- Redesigned as a pill-shaped button (`rounded-full`).
- Added a plus icon that rotates on hover.
- Added shadow and hover lift effects.

### Project & Chat Cards
- **Structure**: Switched to a cleaner list/grid hybrid layout.
- **Styling**:
    - `bg-white` with `border-gray-100`.
    - `rounded-xl` corners.
    - `shadow-sm` by default, `shadow-md` on hover.
    - Added colored icon containers (Blue for projects, Emerald for chats).
- **Interactions**:
    - Subtle translate-y effect on hover.
    - Arrow icon moves on hover.

### Typography
- Standardized headers to `font-bold` for better hierarchy.
- Updated "Start a conversation" and Modal headers to match the new style.
