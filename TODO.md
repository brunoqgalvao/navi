# Navi App TODO

## UI Improvements

### Header / Navigation
- [x] Add "Open in..." dropdown menu at the top (similar to Cursor)
  - Finder - open project folder
  - Cursor - open in Cursor IDE
  - Terminal - open terminal at project path
  - VS Code - open in VS Code
  - Copy path - copy project path to clipboard

### Chat View
- [x] Add scroll-to-bottom button when user is not at the end of the conversation
  - Show floating button when scrolled up
  - Hide when at bottom
  - Smooth scroll animation on click

### Chat Input
- [x] Auto-expand textarea on multiline input
  - Grow height as user types multiple lines
  - Max height capped at 4-5 lines
  - Shrink back when content is deleted

### Image Preview
- [x] Close image preview modal with ESC key
  - Add keyboard event listener for Escape key
  - Should close any opened preview image

### Empty State
- [x] Improve empty chat state (currently shows "Continue the conversation..." which is weird for new chats)
  - Better messaging for new vs resumed conversations
  - Maybe show suggestions or quick actions
  - More engaging visual design

## Skills

### Navi Skill
- [x] Add ability to send chat messages (not just create chats)
  - Send messages to existing conversations
  - Support for programmatic chat interactions
  - Endpoint: POST /api/sessions/{id}/messages with { "message": "..." }

## Future Ideas
- [ ] ...
