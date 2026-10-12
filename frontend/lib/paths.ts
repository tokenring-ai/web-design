import { workspaceFileUrl } from "@tokenring-ai/one-frontend/lib/workspaceFileUrl.ts";

/** React-free route helpers and constants shared by the dashboard definition and the views. */

export const WEB_DESIGN_ROOT = "/web-design";

export const FLOW_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
/** Design file names may be nested ("assets/logo.png"); each segment follows the classic rules. */
export const FILE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*(\/[a-zA-Z0-9][a-zA-Z0-9._-]*)*$/;

/**
 * Fallback working-directory-relative path for `/api/fs` preview URLs while the
 * configuration RPC loads. Matches the service default `webDesignDirectory`.
 */
export const DEFAULT_WEB_DESIGN_SERVE_DIRECTORY = "web-design";
/** Fallback filesystem provider used in preview URLs while the configuration RPC loads. */
export const DEFAULT_WEB_DESIGN_FS_PROVIDER = "posix";

export const DEFAULT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Design</title>
  <style>
    body {
      margin: 0;
      padding: 24px;
      font-family: system-ui, -apple-system, sans-serif;
      background: #ffffff;
      color: #1a1a1a;
    }
    h1 { color: #7c3aed; margin-bottom: 8px; }
    p { color: #6b7280; line-height: 1.6; }
  </style>
</head>
<body>
  <h1>Hello, Design!</h1>
  <p>Start editing the code on the left, or launch an agent below to build something amazing.</p>
</body>
</html>`;

export function designPath(flowName: string, designName: string): string {
  return `${WEB_DESIGN_ROOT}/${encodeURIComponent(flowName)}/${designName.split("/").map(encodeURIComponent).join("/")}`;
}

/** Stable key for one design file, used for drafts, documents and panel instances. */
export function designKey(flowName: string, designName: string): string {
  return `${flowName}/${designName}`;
}

/**
 * The design name named by the URL. React-router splits `/:designName*` into
 * `:designName` plus a splat, so nested names ("assets/logo.png") arrive in two
 * pieces and are joined back together here.
 */
export function designNameFromRouteParams(params: Readonly<Record<string, string | undefined>>): string | undefined {
  const head = params.designName;
  if (!head) return undefined;
  const rest = params["*"];
  return rest ? `${head}/${rest}` : head;
}

/** Last path segment of a (possibly nested) design name, for tab titles. */
export function designBasename(designName: string): string {
  return designName.split("/").pop() || designName;
}

export function copyFileName(fileName: string): string {
  const extensionIndex = fileName.lastIndexOf(".");
  return extensionIndex > 0 ? `${fileName.slice(0, extensionIndex)}-copy${fileName.slice(extensionIndex)}` : `${fileName}-copy.html`;
}

export function editorLanguage(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "css") return "css";
  if (extension === "js" || extension === "mjs" || extension === "jsx") return "javascript";
  if (extension === "ts" || extension === "tsx") return "typescript";
  if (extension === "json" || extension === "map") return "json";
  if (extension === "svg" || extension === "xml") return "xml";
  if (extension === "md") return "markdown";
  if (extension === "yaml" || extension === "yml") return "yaml";
  return "html";
}

/** URL of one design file as served by the filesystem HTTP resource. */
export function previewPath(fsProvider: string, serveDirectory: string, flowName: string, fileName: string): string {
  return workspaceFileUrl(fsProvider, `${serveDirectory.replace(/\/+$/, "")}/${flowName}/${fileName}`);
}

/** URL of a flow's directory, used as the `<base href>` of sandboxed previews. */
export function previewFlowPath(fsProvider: string, serveDirectory: string, flowName: string): string {
  return workspaceFileUrl(fsProvider, `${serveDirectory.replace(/\/+$/, "")}/${flowName}/`);
}
