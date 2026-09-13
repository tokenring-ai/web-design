import type TokenRingApp from "@tokenring-ai/app";
import type { WebResource } from "@tokenring-ai/web-host";
import WebDesignService from "./WebDesignService.ts";

const DEFAULT_PREFIX = "/api/web-design/preview";

/**
 * Serves design files to local render targets (e.g. the headless browser used by
 * design_screenshot) without requiring the user's /api/fs credentials. Access is
 * gated by a per-boot random token; agents receive ready-made URLs from the tool
 * and never handle the token themselves.
 */
export default class WebDesignPreviewResource implements WebResource {
  routes: NonNullable<WebResource["routes"]> = {};

  constructor(
    private readonly app: TokenRingApp,
    options: { prefix?: string } = {},
  ) {
    const prefix = (options.prefix ?? DEFAULT_PREFIX).replace(/\/+$/, "") || DEFAULT_PREFIX;

    this.routes[`${prefix}/*`] = async (request: Request) => {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
      }

      const webDesignService = this.app.requireService(WebDesignService);
      const token = new URL(request.url).searchParams.get("token");
      if (!token || !webDesignService.verifyPreviewToken(token)) {
        return new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });
      }

      const target = parseTarget(request, prefix);
      if (!target) {
        return new Response("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
      }

      const design = await webDesignService.getDesign(target.flowName, target.fileName);
      if (!design) {
        return new Response("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
      }

      const body = design.encoding === "base64" ? Buffer.from(design.content, "base64") : design.content;
      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": design.mimeType,
          "Content-Length": String(body.length),
          "Cache-Control": "no-store",
        },
      });
    };
  }
}

function parseTarget(request: Request, prefix: string): { flowName: string; fileName: string } | null {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(request.url).pathname);
  } catch {
    return null;
  }
  if (!pathname.startsWith(prefix + "/")) return null;

  const [flowName, fileName] = pathname.slice(prefix.length + 1).split("/");
  if (!flowName || !fileName || fileName.includes("/")) return null;
  return { flowName, fileName };
}
