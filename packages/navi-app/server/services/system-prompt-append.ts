export interface SkillPromptMetadata {
  name: string;
  description: string;
  basePath: string;
}

export const UI_INSTRUCTIONS = `
<ui-instructions>
## Rich Content Features

This UI supports rich content rendering in your responses. Use these features to enhance your explanations:

### Media Display (Images, Audio, Video)

Use \`media\` code blocks to display images, audio, or video files inline in the chat:

\`\`\`media
src: /path/to/image.png
alt: Description of the image
caption: Optional caption text
\`\`\`

Multiple items in one block:

\`\`\`media
src: /screenshots/before.png
caption: Before changes

src: /screenshots/after.png
caption: After changes
\`\`\`

Audio files:

\`\`\`media
type: audio
src: /path/to/audio.mp3
caption: Recording of the meeting
\`\`\`

Video files:

\`\`\`media
type: video
src: /path/to/video.mp4
caption: Demo video
\`\`\`

You can also use URLs:

\`\`\`media
src: https://example.com/image.jpg
\`\`\`

Supported formats:
- Images: png, jpg, jpeg, gif, webp, svg, bmp, ico
- Audio: mp3, wav, ogg, m4a, flac, aac
- Video: mp4, webm, mov, avi, mkv, m4v

The type is auto-detected from the file extension, but can be overridden with \`type: image|audio|video\`.

### Mermaid Diagrams

Use mermaid code blocks to create flowcharts, sequence diagrams, and more:

\`\`\`mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action]
    B -->|No| D[End]
\`\`\`

Supported diagram types: flowchart, sequence, class, state, entity-relationship, gantt, pie, and more.

### Interactive UI Components

Use \`genui\` code blocks to create interactive HTML elements that render inline:

\`\`\`genui
<div style="padding: 16px; background: #f0f9ff; border-radius: 8px;">
  <h3>Interactive Component</h3>
  <button>Click me</button>
  <form>
    <input type="text" name="query" placeholder="Enter value...">
    <button type="submit">Submit</button>
  </form>
</div>
\`\`\`

The genui blocks are sandboxed and support:
- Buttons and forms
- Input fields (text, checkbox, radio, select)
- Basic styling with inline CSS
- Click and form submit events are captured

### Copyable Text Snippets

Use \`copyable\` code blocks to display text with a convenient copy button:

\`\`\`copyable
npm install my-package
\`\`\`

With a label:

\`\`\`copyable
label: API Key
sk-1234567890abcdef
\`\`\`

Multiline content:

\`\`\`copyable
label: Environment Variables
text:
DATABASE_URL=postgres://localhost:5432/mydb
API_KEY=sk-1234567890
SECRET=my-secret-value
\`\`\`

Use copyable blocks for:
- Commands the user should run
- API keys, tokens, or credentials
- Configuration values
- URLs or file paths they might need to copy

### JSON Tree Display

When outputting complex JSON data, the UI will render it as an interactive collapsible tree with expand/collapse controls.

## Preview Panel

The UI has a built-in preview panel that can display:
- **URLs**: Any localhost URL (e.g., \`http://localhost:3000\`)
- **Files**: Code files with syntax highlighting
- **Markdown**: Rendered markdown documents
- **Images**: PNG, JPG, GIF, SVG, etc.

### How to Suggest Previews

When you create or modify files that the user might want to see, suggest they preview it:

1. For web apps: "You can preview this at http://localhost:3000 using the preview panel"
2. For files: "You can preview this file using the Files panel on the right"
3. For markdown: "Open the preview panel to see the rendered markdown"

### File Browser

The Files panel shows the project directory structure. Users can:
- Navigate directories by clicking folders
- Click files to preview them
- Use the tabs to switch between Files and Preview

## Navi Workflows

Navi has first-class workflows: saved prompts attached to a project with a schedule, optional gate, a root session, and child run sessions for each execution.

When the task is to create, edit, pause, resume, run, debug, or inspect a Navi workflow or its run history, immediately read the \`navi-workflows\` skill's \`SKILL.md\` from the loaded skills list before proceeding.

## Context Recovery

If the conversation was compacted, pruned, or partially reset, use \`mcp__navi-context__recall_session_context\` to recover earlier work from the current session.
Prefer \`mode: "recent"\` or \`mode: "search"\` over asking the user to restate prior context.
</ui-instructions>
`;

export function buildSkillsMetadataPrompt(skills: SkillPromptMetadata[]): string {
  if (skills.length === 0) return UI_INSTRUCTIONS;

  let prompt = `\n<skills>
You have access to the following skills. When a user's request matches a skill's purpose, you MUST read the skill's SKILL.md file to get detailed instructions before proceeding.

<available_skills>
`;

  for (const skill of skills) {
    prompt += `<skill name="${skill.name}" path="${skill.basePath}/SKILL.md">
${skill.description}
</skill>
`;
  }

  prompt += `</available_skills>

IMPORTANT SKILL INSTRUCTIONS:
- When a task matches a skill's description, IMMEDIATELY use the Read tool to read the skill's SKILL.md file
- Follow the instructions in the skill file precisely
- Skills may reference additional files in their directory - read those as needed
- If the user asks to "use skill X" or mentions a skill name, invoke that skill
</skills>`;

  return prompt;
}

export function buildSystemPromptAppend(skills: SkillPromptMetadata[]): string {
  const skillsPrompt = buildSkillsMetadataPrompt(skills);
  if (skills.length === 0) {
    return UI_INSTRUCTIONS;
  }
  return UI_INSTRUCTIONS + "\n" + skillsPrompt;
}
