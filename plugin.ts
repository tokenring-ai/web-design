import type { TokenRingPlugin } from "@tokenring-ai/app";
import { ChatService } from "@tokenring-ai/chat";
import { AgentLifecycleService } from "@tokenring-ai/lifecycle";
import { RpcService } from "@tokenring-ai/rpc";
import { StaticResource, WebHostService } from "@tokenring-ai/web-host";
import { z } from "zod";
import config from "./config/index.ts";
import addSelectedDesign from "./hooks/addSelectedDesign.ts";
import packageJSON from "./package.json" with { type: "json" };
import webDesignRPC from "./rpc/webDesign.ts";
import { WebDesignServiceConfigSchema } from "./schema.ts";
import tools from "./tools.ts";
import WebDesignService from "./WebDesignService.ts";

const packageConfigSchema = z.object({
  webDesign: WebDesignServiceConfigSchema,
});

export default {
  name: packageJSON.name,
  displayName: "Web Design",
  version: packageJSON.version,
  description: packageJSON.description,
  install(app) {
    app.addService(new WebDesignService(app));

    app.waitForService(AgentLifecycleService, lifecycleService => lifecycleService.addHooks(addSelectedDesign));
    app.waitForService(ChatService, chatService => chatService.addTools(tools));
    app.waitForService(RpcService, rpcService => {
      rpcService.registerEndpoint(webDesignRPC);
    });
  },
  reconfigure(app, config) {
    const webDesignService = app.requireService(WebDesignService);
    webDesignService.reconfigure(config.webDesign);

    //TODO this should be hoisted in to WebDesignService.reconfigure() and reconciled against an object tracking the web design directory
    app.requireService(WebHostService).registerResource(
      "Web Design Previews",
      new StaticResource({
        root: webDesignService.getWebDesignDirectory(),
        prefix: "/web-design-preview",
        headers: {
          "Cache-Control": "no-store",
          "Content-Security-Policy": "sandbox allow-scripts",
          "X-Content-Type-Options": "nosniff",
        },
      }),
    );
  },
  config,
  configSchema: packageConfigSchema,
} satisfies TokenRingPlugin<typeof packageConfigSchema>;
