# Experimental Generative UI Components

This directory contains experimental components for rendering sandboxed generative UI content in Claude Code UI.

## Components

### GenerativeUI.svelte

The main component for rendering HTML content in a sandboxed iframe.

**Props:**
- `html: string` - The HTML content to render
- `id?: string` - Optional unique identifier for the component

**Events:**
- `interaction` - Emitted when user interacts with the content (clicks, form submissions, etc.)
- `error` - Emitted when there's an error rendering the content

**Features:**
- Sandboxed iframe with `allow-scripts allow-forms` (no `allow-same-origin`)
- XSS protection by sanitizing HTML content
- Auto-resize based on content height
- PostMessage communication for interaction capture
- Safe URL validation for links

### GenerativeUIRenderer.svelte

Helper component for rendering multiple generative UI blocks within a container.

**Props:**
- `element: HTMLElement` - The container element to scan for generative UI blocks

## Security Features

### Sandboxing
- Uses iframe with restrictive sandbox settings
- No access to parent page origin
- Limited to scripts and form submission only

### XSS Protection
- Removes `<script>` tags from HTML content
- Strips `javascript:` URLs
- Removes inline event handlers (`onclick`, `onload`, etc.)
- Validates and sanitizes link URLs

### Content Isolation
- All content runs in isolated iframe context
- No direct DOM access to parent page
- Controlled communication via postMessage

## Usage in AssistantMessage

The generative UI system is integrated into the markdown rendering pipeline:

1. **Detection**: Scans for `\`\`\`genui` code blocks in markdown
2. **Extraction**: Extracts HTML content and creates placeholders
3. **Processing**: Renders markdown with placeholders
4. **Injection**: Replaces placeholders with Svelte components
5. **Interaction**: Captures and handles user interactions

## Interaction Protocol

The system captures the following interaction types:

- `click` - Button clicks, link clicks, etc.
- `form_submit` - Form submissions with form data
- `input_change` - Input field changes (checkboxes, selects, etc.)

All interactions include:
- `type`: The interaction type
- `target`: Information about the target element
- `data`: Associated data (form values, input states, etc.)

## Example Usage

```markdown
Here's an interactive form:

\`\`\`genui
<form>
  <input type="text" name="username" placeholder="Username">
  <button type="submit">Submit</button>
</form>
\`\`\`
```

This would render as a sandboxed form that captures submission events and sends them to the parent component for handling.

## Limitations

- No access to external APIs from within the sandbox
- No persistent state across component re-renders
- Limited to HTML/CSS/vanilla JavaScript (no external libraries)
- Auto-resize may not work perfectly for all content types

## Future Enhancements

- Support for component state persistence
- More sophisticated interaction handling
- Enhanced security scanning
- Performance optimizations for large content
- Better error handling and debugging tools