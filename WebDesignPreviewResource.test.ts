import { describe, expect, test } from "bun:test";
import type { BunRouter } from "@tokenring-ai/web-host/types";
import WebDesignPreviewResource, { WEB_DESIGN_PREVIEW_PREFIX } from "./WebDesignPreviewResource.ts";
import WebDesignService from "./WebDesignService.ts";

describe("WebDesignPreviewResource", () => {
  test("hosts the configured design directory with sandboxed, uncached responses", () => {
    const service = new WebDesignService({ agentDefaults: { webDesignDirectory: "/tmp/web-designs" } });
    let registration: Parameters<BunRouter["static"]> | undefined;
    const router = {
      static(...args: Parameters<BunRouter["static"]>) {
        registration = args;
      },
    } as BunRouter;

    new WebDesignPreviewResource(service).register(router);

    expect(registration).toEqual([
      WEB_DESIGN_PREVIEW_PREFIX,
      "/tmp/web-designs",
      {
        headers: {
          "Cache-Control": "no-store",
          "Content-Security-Policy": "sandbox allow-scripts",
          "X-Content-Type-Options": "nosniff",
        },
      },
    ]);
  });
});
