import deepClone from "@tokenring-ai/utility/object/deepClone";
import webDesignAgentConfig from "./agents/web-design.yaml" with { type: "yaml" };
import webDesignVisualAgentConfig from "./agents/web-design-visual.yaml" with { type: "yaml" };
import uiExpertToolConfig from "./tools/ui-expert.yaml" with { type: "yaml" };

export default deepClone(webDesignAgentConfig, webDesignVisualAgentConfig, uiExpertToolConfig) as Record<string, unknown>;
