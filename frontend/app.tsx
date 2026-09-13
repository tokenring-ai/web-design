import type { PluginAppDefinition } from "@tokenring-ai/one-frontend/plugins/types.ts";
import manifest from "./manifest.ts";
import WebDesignApp from "./WebDesignApp.tsx";

/**
 * The web-design app contributed to the TokenRing One frontend by this
 * plugin. Discovered by `frontend/src/plugins/registry.ts`.
 */
export default {
  ...manifest,
  // Splat parameter: design file names may be nested inside a flow ("assets/logo.png").
  // The extra paths cover the app root and bare-flow URLs, which the splat form does not match.
  routePath: "/web-design/:flowName?/:designName*",
  extraRoutePaths: ["/web-design", "/web-design/:flowName?"],
  component: WebDesignApp,
} satisfies PluginAppDefinition;
