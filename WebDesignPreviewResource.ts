import type { BunRouter, WebResource } from "@tokenring-ai/web-host/types";
import type WebDesignService from "./WebDesignService.ts";

export const WEB_DESIGN_PREVIEW_PREFIX = "/web-design-preview";

export default class WebDesignPreviewResource implements WebResource {
  constructor(private readonly webDesignService: WebDesignService) {}

  register(router: BunRouter): void {
    router.static(WEB_DESIGN_PREVIEW_PREFIX, this.webDesignService.getDefaultWebDesignDirectory(), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Security-Policy": "sandbox allow-scripts",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
}
