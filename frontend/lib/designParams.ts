import type { ViewParams } from "@tokenring-ai/one-frontend/layout/types.ts";
import { designKey } from "./paths.ts";

/**
 * Editors are routed (`/web-design/<flow>/<file...>`), so their file name is the
 * route's splat param. Previews have no URL and use a named param.
 */
export function editorParams(flowName: string, designName: string): ViewParams {
  return { flowName, "*": designName };
}

export function previewParams(flowName: string, designName: string): ViewParams {
  return { flowName, designName };
}

export function editorInstanceKey(params: ViewParams): string {
  return designKey(params.flowName ?? "", params["*"] ?? "");
}

export function previewInstanceKey(params: ViewParams): string {
  return designKey(params.flowName ?? "", params.designName ?? "");
}
