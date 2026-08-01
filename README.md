# @tokenring-ai/web-design

Browser-ready web design flows backed by files on disk.

## Overview

The `@tokenring-ai/web-design` package provides a simple two-level file store for browser-ready mockups:

- A **Flow** is a named collection of related pages and assets (e.g. an onboarding flow or checkout flow).
- A flow may contain HTML, CSS, JavaScript, images, fonts, and other browser assets.

Files in a flow are hosted together at `/web-design-preview/<flow>/<file>`, so pages can link sibling files with
ordinary relative URLs. Text files can be viewed and edited directly in the Web Design app; arbitrary files can be
uploaded as flow assets.

## Key Features

- **Multi-file Flows**: HTML, CSS, JavaScript, images, fonts, and other files are stored as `<webDesignDirectory>/<flow>/<file>`
- **Hosted Previews**: Flow files are served from `/web-design-preview/<flow>/<file>` with browser sandbox headers
- **Shared or Per-Agent Directory**: One configured root directory by default, with optional per-agent overrides
- **CRUD via RPC**: List, create, retrieve, update, and delete flows and designs from the frontend
- **CRUD via Tools**: Agents can list, read, write, and delete flows and designs while doing frontend work
- **Live List Updates**: `streamFlows` / `streamDesigns` poll the directory so the frontend list stays current
- **Auto-vivified Flows**: Writing a design to a flow that doesn't exist yet creates the flow automatically

## Installation

```bash
bun add @tokenring-ai/web-design
```

## Plugin Configuration

Configure the web design plugin in your application config:

```yaml
webDesign:
  agentDefaults:
    webDesignDirectory: ./.tokenring/web-design
```

### Configuration Schema

```typescript
import { WebDesignServiceConfigSchema } from "@tokenring-ai/web-design";

WebDesignServiceConfigSchema = z.object({
  agentDefaults: z.object({
    webDesignDirectory: z.string(),
  }),
});
```

**Configuration Options:**

| Field                              | Type     | Required | Description                        |
|-------------------------------------|----------|----------|-------------------------------------|
| `agentDefaults.webDesignDirectory`  | `string` | Yes      | Directory where design flows are stored |

Agents may override `webDesignDirectory` via their own `webDesign.webDesignDirectory` agent config slice.

## Naming

Flow names must start with a letter or number and may contain letters, numbers, hyphens, and underscores. File names
may additionally contain dots and should include their extension. For backward compatibility, a file name without an
extension is stored with `.html`.

## Tools

| Tool           | Display Name                  | Description                                            |
|----------------|--------------------------------|----------------------------------------------------------|
| `flow_list`    | `Web Design/list flows`       | List the design flows in the web design directory        |
| `flow_create`  | `Web Design/create flow`      | Create a new, empty design flow                          |
| `flow_delete`  | `Web Design/delete flow`      | Delete a design flow and all of its designs               |
| `design_list`  | `Web Design/list designs`     | List the files within a flow                              |
| `design_read`  | `Web Design/read design`      | Read a text file or base64-encoded asset                  |
| `design_write` | `Web Design/write design`     | Create or overwrite a flow file (auto-creates its flow)   |
| `design_delete`| `Web Design/delete design`    | Delete a flow file                                        |

## Service API

### WebDesignService

```typescript
import { WebDesignService } from "@tokenring-ai/web-design";

const webDesignService = agent.requireService(WebDesignService);
```

| Method | Description |
|--------|-------------|
| `getDefaultWebDesignDirectory()` | Return the application default web design directory |
| `getWebDesignDirectory(agent)` | Return the active agent's web design directory |
| `listFlows(root)` | List flow summaries (`name`, `designCount`, `updatedAt`) |
| `createFlow(root, flowName)` | Create a new, empty flow; throws if the name is already in use |
| `deleteFlow(root, flowName)` | Delete a flow and all of its designs; returns `false` if it didn't exist |
| `listDesigns(root, flowName)` | List design summaries (`flowName`, `name`, `size`, `updatedAt`) within a flow |
| `getDesign(root, flowName, name)` | Read a design's content, or `null` if it doesn't exist |
| `createDesign(root, flowName, name, content)` | Create a new design, auto-creating its flow; throws if the name is already in use |
| `updateDesign(root, flowName, name, content)` | Create or overwrite a design, auto-creating its flow |
| `deleteDesign(root, flowName, name)` | Delete a design; returns `false` if it didn't exist |

## RPC

The plugin registers a `Web Design RPC` endpoint at `/rpc/web-design` with `listFlows`, `streamFlows`, `createFlow`,
`deleteFlow`, `listDesigns`, `streamDesigns`, `getDesign`, `createDesign`, `updateDesign`, and `deleteDesign`
methods, used by the Web Design app in the frontend.

## Related Packages

- `@tokenring-ai/media-library` - Shared storage for agent-generated images, video, and audio
- `@tokenring-ai/research` - Directory-backed deep research projects
