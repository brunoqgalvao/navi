import { describe, expect, it } from "bun:test";
import { linkifyUrls, renderMarkdownWithLinks } from "./formatting";

describe("linkifyUrls", () => {
  it("keeps sentence punctuation outside the preview link", () => {
    const html = "<p>It is running at localhost:3000.</p>";
    const output = linkifyUrls(html);

    expect(output).toContain('data-url="http://localhost:3000"');
    expect(output).toContain('>localhost:3000</a>.');
    expect(output).not.toContain('>localhost:3000.</a>');
  });

  it("keeps unmatched closing punctuation outside the preview link", () => {
    const html = "<p>(http://127.0.0.1:4040).</p>";
    const output = linkifyUrls(html);

    expect(output).toContain('(<a href="#" class="preview-link" data-url="http://127.0.0.1:4040">http://127.0.0.1:4040</a>).');
  });

  it("avoids double-encoding query params in data-url", () => {
    const html = "<p>http://127.0.0.1:4040/path?x=1&amp;y=2</p>";
    const output = linkifyUrls(html);

    expect(output).toContain('data-url="http://127.0.0.1:4040/path?x=1&amp;y=2"');
    expect(output).not.toContain("&amp;amp;");
  });

  it("does not linkify inside existing anchors or code blocks", () => {
    const html = '<p><code>localhost:3000</code> <a href="http://localhost:3001">http://localhost:3001</a> localhost:3002</p>';
    const output = linkifyUrls(html);

    expect((output.match(/class="preview-link"/g) || []).length).toBe(1);
    expect(output).toContain("<code>localhost:3000</code>");
    expect(output).toContain('<a href="http://localhost:3001">http://localhost:3001</a>');
    expect(output).toContain('data-url="http://localhost:3002"');
  });
});

describe("renderMarkdownWithLinks", () => {
  it("does not split URL paths into file links", () => {
    const markedLike = {
      parse: (content: string) => `<p>${content}</p>`,
    };

    const output = renderMarkdownWithLinks(
      "http://localhost:3000/index.html",
      markedLike,
      "/tmp/project",
      new Map()
    );

    expect(output).toContain('data-url="http://localhost:3000/index.html"');
    expect(output).not.toContain('class="file-link');
  });
});
