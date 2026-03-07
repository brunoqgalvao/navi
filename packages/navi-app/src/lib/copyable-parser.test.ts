import { beforeEach, describe, expect, it } from "bun:test";
import { parseCopyableContent, resetCopyableCounter } from "./copyable-parser";

describe("parseCopyableContent", () => {
  beforeEach(() => {
    resetCopyableCounter();
  });

  it("keeps bare copyable lines that contain colons", () => {
    const result = parseCopyableContent(`
Run this in your terminal:

\`\`\`copyable
http://localhost:3011/api/models
\`\`\`
`);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.text).toBe("http://localhost:3011/api/models");
    expect(result.processedContent).toContain("<!--COPYABLE:");
  });

  it("keeps labeled copyable blocks with colon-heavy commands", () => {
    const result = parseCopyableContent(`
\`\`\`copyable
label: Command
PATH=/usr/local/bin:/usr/bin:/bin claude mcp add local http://127.0.0.1:3011/mcp
\`\`\`
`);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      label: "Command",
      text: "PATH=/usr/local/bin:/usr/bin:/bin claude mcp add local http://127.0.0.1:3011/mcp",
    });
  });

  it("supports CRLF fenced copyable blocks", () => {
    const result = parseCopyableContent("```copyable\r\nnpm config set registry http://localhost:4873\r\n```");

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.text).toBe("npm config set registry http://localhost:4873");
  });
});
