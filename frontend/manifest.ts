import type { PluginAppManifest } from "@tokenring-ai/one-frontend/plugins/types.ts";
import { Frame } from "lucide-react";

/**
 * Metadata for the web-design app shipped by this plugin. The frontend merges
 * this into its app registry and derives the SPA server routes from it.
 */
export default {
  id: "web-design",
  path: "/web-design",
  label: "Web Design",
  shortLabel: "WD",
  description: "Build UI mockups and design flows with agents",
  group: "Build",
  icon: Frame,
  iconClass: "text-purple-500",
  gradient: "from-purple-500 to-violet-600",
} satisfies PluginAppManifest;
