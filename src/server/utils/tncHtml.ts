import { renderMarkdown } from "../../../docs/render.ts";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

interface TncPageOptions {
  theme?: "light" | "dark";
  title?: string;
}

export function generateTncHtml(options: TncPageOptions = {}): string {
  const {
    theme = "light",
    title = "Terms & Conditions - Smart Duck Trading Bot",
  } = options;

  const latestTncPath = getLatestTncFile();

  const tncContent = renderMarkdown(latestTncPath, {
    theme,
    maxWidth: "900px",
    fontSize: "16px",
  });

  const isDark = theme === "dark";
  const bgColor = isDark ? "#0f172a" : "#f8fafc";
  const textColor = isDark ? "#e2e8f0" : "#334155";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
            background-color: ${bgColor};
            color: ${textColor};
            line-height: 1.6;
            min-height: 100vh;
            padding: 2rem 1rem;
        }
        
        .container {
            max-width: 1000px;
            margin: 0 auto;
        }
        
        .header {
            text-align: center;
            margin-bottom: 2rem;
        }
        
        .header h1 {
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 0.5rem;
            color: ${isDark ? "#f1f5f9" : "#1e293b"};
        }
        
        .header p {
            font-size: 1.125rem;
            color: ${isDark ? "#94a3b8" : "#64748b"};
        }
        
        .tnc-content {
            margin-bottom: 3rem;
        }
        
        .version-info {
            text-align: center;
            margin-top: 2rem;
            padding-top: 2rem;
            border-top: 1px solid ${isDark ? "#334155" : "#e2e8f0"};
            font-size: 0.875rem;
            color: ${isDark ? "#64748b" : "#94a3b8"};
        }
        
        @media (max-width: 640px) {
            body {
                padding: 1rem 0.5rem;
            }
            
            .header h1 {
                font-size: 2rem;
            }
        }
        
        .scroll-indicator {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 4px;
            background-color: ${isDark ? "#1e293b" : "#e2e8f0"};
            z-index: 100;
        }
        
        .scroll-progress {
            height: 100%;
            background: linear-gradient(90deg, #22c55e, #3b82f6);
            width: 0%;
            transition: width 0.1s ease;
        }
    </style>
</head>
<body>
    <div class="scroll-indicator">
        <div class="scroll-progress" id="scrollProgress"></div>
    </div>
    
    <div class="container">
        <div class="header">
            <h1>Terms & Conditions</h1>
            <p>Smart Duck Trading Bot Terms of Service</p>
        </div>
        
        <div class="tnc-content">
            ${tncContent}
        </div>
        
        <div class="version-info">
            Document Version: ${latestTncPath} • Last Updated: ${getCurrentDate()}
        </div>
    </div>

    <script>
        function updateScrollProgress() {
            const scrollTop = window.pageYOffset;
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            const scrollPercent = (scrollTop / docHeight) * 100;
            document.getElementById('scrollProgress').style.width = scrollPercent + '%';
        }
        
        window.addEventListener('scroll', updateScrollProgress);
    </script>
</body>
</html>`;
}

function getLatestTncFile(): string {
  try {
    const tncDir = join(__dirname, "../../../docs/tnc");
    const files = readdirSync(tncDir)
      .filter((file) => file.endsWith(".md"))
      .map((file) => {
        const match = file.match(/^(\d+)\.md$/);
        return match ? { file, version: parseInt(match[1]) } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b!.version - a!.version);

    if (files.length === 0) {
      throw new Error("No TNC files found");
    }

    return `tnc/${files[0]!.file.replace(".md", "")}`;
  } catch (error) {
    // Fallback to known file
    return "tnc/1";
  }
}

function getCurrentDate(): string {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Usage example:
// const html = generateTncHtml({
//   theme: 'light'
// });
