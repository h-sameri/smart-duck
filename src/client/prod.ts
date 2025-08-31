import hono from "./api";
import path from "path";
import { existsSync, statSync } from "fs";
import { getMimeType } from "./utils";

export function createStaticFileHandler() {
  return (req: Request) => {
    const url = new URL(req.url);
    const pathname = url.pathname;

    if (pathname.startsWith("/api")) {
      return null;
    }

    if (pathname === "/") {
      const indexPath = path.join(import.meta.dir, "dist", "index.html");
      if (!existsSync(indexPath)) {
        console.warn("Static files not found. Please build the client first with: bun run build");
        return new Response("Static files not built. Please run: bun run build", { status: 503 });
      }
      const file = Bun.file(indexPath);
      return new Response(file, {
        headers: {
          "Content-Type": "text/html",
          "Cache-Control": "no-cache",
        },
      });
    }

    const filePath = path.join(import.meta.dir, "dist", pathname);

    if (existsSync(filePath)) {
      const stats = statSync(filePath);
      if (stats.isDirectory()) {
        const indexPath = path.join(import.meta.dir, "dist", "index.html");
        if (!existsSync(indexPath)) {
          return new Response("Static files not built. Please run: bun run build", { status: 503 });
        }
        const file = Bun.file(indexPath);
        return new Response(file, {
          headers: {
            "Content-Type": "text/html",
            "Cache-Control": "no-cache",
          },
        });
      }
      
      const file = Bun.file(filePath);
      const mimeType = getMimeType(filePath);

      return new Response(file, {
        headers: {
          "Content-Type": mimeType,
          "Cache-Control":
            pathname === "/" || pathname.endsWith(".html")
              ? "no-cache"
              : "public, max-age=31536000",
        },
      });
    }

    const hasFileExtension = /\.[a-zA-Z0-9]+$/.test(pathname);
    if (hasFileExtension) {
      const fileName = path.basename(pathname);
      const rootFilePath = path.join(import.meta.dir, "dist", fileName);
      
      if (existsSync(rootFilePath)) {
        const file = Bun.file(rootFilePath);
        const mimeType = getMimeType(rootFilePath);
        
        return new Response(file, {
          headers: {
            "Content-Type": mimeType,
            "Cache-Control": "public, max-age=31536000",
          },
        });
      }
      
      return new Response("Not Found", { status: 404 });
    }

    const indexPath = path.join(import.meta.dir, "dist", "index.html");
    if (!existsSync(indexPath)) {
      return new Response("Static files not built. Please run: bun run build", { status: 503 });
    }
    const file = Bun.file(indexPath);
    return new Response(file, {
      headers: {
        "Content-Type": "text/html",
        "Cache-Control": "no-cache",
      },
    });
  };
}

export { hono as apiHandler };
