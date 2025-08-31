import env from "../../env";
import { generateTncHtml } from "./utils/tncHtml.ts";
import { bot } from "../telegram";
import { db } from "../../db";
import { readFileSync } from "fs";
import { join } from "path";
import { isProd } from "../../env";

let staticFileHandler: ((req: Request) => Response | null) | null = null;
let apiHandler: any = null;

if (isProd) {
  console.log("🔄 Production mode detected - loading client handlers...");
  try {
    const prodModule = await import("../client/prod.ts");
    staticFileHandler = prodModule.createStaticFileHandler();
    apiHandler = prodModule.apiHandler;
    console.log("✅ Client handlers loaded successfully");
  } catch (error) {
    console.warn("⚠️  Failed to load production client handlers:", error);
    console.warn("📝 Make sure to build the client first with: cd src/client && bun run build");
  }
}

// Ensure migartions
const migrationPath = join(process.cwd(), "data", "migrations", "up.sql");
const migrationSQL = readFileSync(migrationPath, "utf-8");
const statements = migrationSQL
  .split(";")
  .map((stmt) => stmt.trim())
  .filter((stmt) => stmt.length > 0);
for (const statement of statements) {
  db.run(statement);
}

// Start TG bot
bot.start();

const port = parseInt(env.PORT);

// Server
export default {
  port,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "ok",
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    if (url.pathname === "/tnc") {
      const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light";
      const html = generateTncHtml({
        title: "Terms & Conditions - Smart Duck Trading Bot",
        theme,
      });

      return new Response(html, {
        headers: { "Content-Type": "text/html" },
        status: 200,
      });
    }

    if (url.pathname.startsWith("/api")) {
      if (url.pathname === "/api/ping") {
        return new Response(JSON.stringify({ message: "pong" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }

      if (isProd && apiHandler && url.pathname.startsWith("/api/v1")) {
        return apiHandler.fetch(req);
      }
    }

    if (isProd && staticFileHandler) {
      const staticResponse = staticFileHandler(req);
      if (staticResponse) {
        return staticResponse;
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};

console.log(`🚀 Server running on port ${port}`);
