import { readFileSync } from "fs";
import { join } from "path";

interface RenderOptions {
  theme?: "light" | "dark";
  maxWidth?: string;
  fontSize?: string;
}

export function renderMarkdown(
  relativePath: string,
  options: RenderOptions = {}
): string {
  const { theme = "light", maxWidth = "800px", fontSize = "16px" } = options;

  try {
    const fullPath = join(
      __dirname,
      relativePath.endsWith(".md") ? relativePath : `${relativePath}.md`
    );
    const markdownContent = readFileSync(fullPath, "utf-8");

    const htmlContent = parseMarkdown(markdownContent);

    return `
      <div style="
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
        max-width: ${maxWidth};
        margin: 0 auto;
        padding: 2rem;
        line-height: 1.6;
        color: ${theme === "dark" ? "#e4e4e7" : "#374151"};
        background-color: ${theme === "dark" ? "#1f2937" : "#ffffff"};
        border-radius: 12px;
        box-shadow: ${
          theme === "dark"
            ? "0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)"
            : "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)"
        };
        font-size: ${fontSize};
      ">
        ${htmlContent}
      </div>
    `;
  } catch (error) {
    return `
      <div style="
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        max-width: ${maxWidth};
        margin: 0 auto;
        padding: 2rem;
        background-color: #fef2f2;
        border: 1px solid #fecaca;
        border-radius: 8px;
        color: #991b1b;
      ">
        <h3 style="margin: 0 0 1rem 0;">Error Loading Document</h3>
        <p>Could not load the markdown file: ${relativePath}</p>
        <p style="font-size: 14px; color: #dc2626;">${
          error instanceof Error ? error.message : "Unknown error"
        }</p>
      </div>
    `;
  }
}

function parseMarkdown(markdown: string): string {
  let html = markdown;

  html = html.replace(
    /^# (.*$)/gm,
    '<h1 style="font-size: 2.25rem; font-weight: 700; margin: 2rem 0 1rem 0; color: inherit;">$1</h1>'
  );
  html = html.replace(
    /^## (.*$)/gm,
    '<h2 style="font-size: 1.875rem; font-weight: 600; margin: 1.5rem 0 1rem 0; color: inherit;">$1</h2>'
  );
  html = html.replace(
    /^### (.*$)/gm,
    '<h3 style="font-size: 1.5rem; font-weight: 600; margin: 1.25rem 0 0.75rem 0; color: inherit;">$1</h3>'
  );
  html = html.replace(
    /^#### (.*$)/gm,
    '<h4 style="font-size: 1.25rem; font-weight: 600; margin: 1rem 0 0.5rem 0; color: inherit;">$1</h4>'
  );

  html = html.replace(
    /\*\*(.*?)\*\*/g,
    '<strong style="font-weight: 600;">$1</strong>'
  );
  html = html.replace(/\*(.*?)\*/g, '<em style="font-style: italic;">$1</em>');
  html = html.replace(/_(.*?)_/g, '<em style="font-style: italic;">$1</em>');

  html = html.replace(
    /```([\s\S]*?)```/g,
    `
    <pre style="
      background-color: #f3f4f6;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 1rem;
      overflow-x: auto;
      margin: 1rem 0;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 14px;
      line-height: 1.4;
    "><code>$1</code></pre>
  `
  );

  html = html.replace(
    /`([^`]+)`/g,
    `
    <code style="
      background-color: #f3f4f6;
      padding: 0.125rem 0.25rem;
      border-radius: 4px;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 0.875em;
    ">$1</code>
  `
  );

  html = html.replace(
    /^---$/gm,
    `
    <hr style="
      border: none;
      height: 1px;
      background-color: #e5e7eb;
      margin: 2rem 0;
    ">
  `
  );

  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    `
    <a href="$2" style="
      color: #3b82f6;
      text-decoration: underline;
      text-decoration-color: #3b82f6;
      text-underline-offset: 2px;
    ">$1</a>
  `
  );

  html = html.replace(
    /^- (.+)$/gm,
    `
    <li style="
      margin: 0.5rem 0;
      padding-left: 0.5rem;
    ">$1</li>
  `
  );

  html = html.replace(/(<li[^>]*>.*?<\/li>\s*)+/gs, (match) => {
    return `
      <ul style="
        margin: 1rem 0;
        padding-left: 1.5rem;
        list-style-type: disc;
      ">
        ${match}
      </ul>
    `;
  });

  html = html.replace(
    /^\d+\. (.+)$/gm,
    `
    <li style="
      margin: 0.5rem 0;
      padding-left: 0.5rem;
    ">$1</li>
  `
  );

  html = html.replace(/(<li[^>]*>.*?<\/li>\s*)+/gs, (match) => {
    if (match.includes("<ul")) return match;

    return `
      <ol style="
        margin: 1rem 0;
        padding-left: 1.5rem;
        list-style-type: decimal;
      ">
        ${match}
      </ol>
    `;
  });

  html = html.replace(
    /^> (.+)$/gm,
    `
    <blockquote style="
      border-left: 4px solid #3b82f6;
      padding-left: 1rem;
      margin: 1rem 0;
      font-style: italic;
      color: #6b7280;
    ">$1</blockquote>
  `
  );

  const lines = html.split("\n");
  const paragraphs: string[] = [];
  let currentParagraph = "";

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith("<") && trimmedLine.endsWith(">")) {
      if (currentParagraph.trim()) {
        paragraphs.push(
          `<p style="margin: 1rem 0;">${currentParagraph.trim()}</p>`
        );
        currentParagraph = "";
      }
      paragraphs.push(line);
      continue;
    }

    if (trimmedLine === "") {
      if (currentParagraph.trim()) {
        paragraphs.push(
          `<p style="margin: 1rem 0;">${currentParagraph.trim()}</p>`
        );
        currentParagraph = "";
      }
    } else {
      currentParagraph += (currentParagraph ? " " : "") + trimmedLine;
    }
  }

  if (currentParagraph.trim()) {
    paragraphs.push(
      `<p style="margin: 1rem 0;">${currentParagraph.trim()}</p>`
    );
  }

  return paragraphs.join("\n");
}

export function renderDocumentAsHTML(
  relativePath: string,
  options?: RenderOptions
): string {
  return renderMarkdown(relativePath, options);
}

export function renderWithPreset(
  relativePath: string,
  preset: "default" | "dark" | "compact" | "wide" = "default"
): string {
  const presets = {
    default: { theme: "light" as const, maxWidth: "800px", fontSize: "16px" },
    dark: { theme: "dark" as const, maxWidth: "800px", fontSize: "16px" },
    compact: { theme: "light" as const, maxWidth: "600px", fontSize: "14px" },
    wide: { theme: "light" as const, maxWidth: "1200px", fontSize: "16px" },
  };

  return renderMarkdown(relativePath, presets[preset]);
}
