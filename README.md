# @tokenring-ai/web-design

Browser-ready web design flows backed by files on disk.

## Overview

The `@tokenring-ai/web-design` package provides a simple two-level file store for browser-ready mockups:

- A **Flow** is a named collection of related pages and assets (e.g. an onboarding flow or checkout flow).
- A flow may contain HTML, CSS, JavaScript, images, fonts, and other browser assets.

Files in a flow are hosted via the workspace filesystem HTTP endpoint at `/api/fs/posix/<webDesignDirectory>/<flow>/<file>`, so pages can link sibling files with ordinary relative URLs. Text files can be viewed and edited directly in the Web Design app; arbitrary files can be uploaded as flow assets. Previews load in a sandboxed iframe in the Web Design app.

## Key Features

- **Multi-file Flows**: HTML, CSS, JavaScript, images, fonts, and other files are stored as `<webDesignDirectory>/<flow>/<file>`
- **Hosted Previews**: Flow files are served via the workspace filesystem HTTP endpoint so pages and assets are hosted together under one URL prefix
- **Sandboxed Live Previews**: HTML renders in the app exactly as authored, inside a sandboxed iframe (scripts run in an opaque origin); device-width presets cover mobile/tablet/desktop
- **Visual Feedback Loop**: `design_screenshot` renders a saved design in a headless browser and returns the image plus console errors to the agent
- **Version History**: Every overwrite snapshots the previous content under `<flow>/.history/` (up to 50 versions), browsable and restorable in the app
- **Element Annotations**: Click any element in the preview to leave a comment that is written into the HTML source as a comment anchored to that element, with click-to-locate in the editor
- **Explicit Attachments**: Designs are attached to agent chat only when the user attaches them (paperclip in the editor header or per file row)
- **Configurable Directory**: One workspace-relative root directory for all design flows
- **CRUD via RPC**: List, create, retrieve, update, and delete flows and designs from the frontend
- **CRUD via Tools**: Agents can list, read, write, and delete flows and designs while doing frontend work
- **Live List Updates**: `streamFlows` / `streamDesigns` poll the directory so the frontend list stays current
- **Auto-vivified Flows**: Writing a design to a flow that doesn't exist yet creates the flow automatically
- **Web Design Agents**: Ships `web-design` and `web-design-visual` agent types plus `/design` and `/design-visual` commands for UI mockup work

## Installation

```bash
bun add @tokenring-ai/web-design
```

## Chat Commands

| Command          | Description                                            |
|------------------|--------------------------------------------------------|
| `/design`        | Design HTML UI mockups organized into flows            |
| `/design-visual` | Same, with mandatory screenshot-based visual self-review |

The `/design` command starts a web design run that writes HTML mockups into design flows. The agent will:

- Create or reuse a flow under the web design directory
- Plan screens and states with todos
- Write linked HTML/CSS/JS files via `design_write`
- Iterate until the flow is complete

The `/design-visual` command routes to the `web-design-visual` agent type, which additionally captures every
screen with `design_screenshot` at desktop and mobile widths after writing it, reviews the image and console
output, and iterates until each screen is clean.

When run on a matching web-design agent, work continues in the foreground on that agent. When run from another
agent type, a background web-design agent is started.

## Tools

The package registers eight tools with the `ChatService`:

| Tool            | Display Name                 | Description                                      |
|-----------------|------------------------------|--------------------------------------------------|
| `flow_list`     | `Web Design/list flows`      | List the design flows (collections of related designs) in the web design directory |
| `flow_create`   | `Web Design/create flow`     | Create a new, empty design flow (a named collection of related designs) |
| `flow_delete`   | `Web Design/delete flow`     | Delete a design flow and all of the designs it contains |
| `design_list`   | `Web Design/list designs`    | List the HTML, CSS, JavaScript, and asset files within a design flow |
| `design_read`   | `Web Design/read design`     | Read a text file or base64-encoded binary asset within a design flow |
| `design_write`  | `Web Design/write design`    | Create or overwrite a text file within a design flow. Files in the same flow are hosted together, so HTML can link to sibling CSS and JavaScript files with relative URLs. The flow is created automatically if it doesn't already exist. |
| `design_delete` | `Web Design/delete design`   | Delete a file from a design flow |
| `design_screenshot` | `Web Design/screenshot design` | Capture a screenshot of a saved design in a headless browser and return it as an image with console errors |

### Tool Input Parameters

#### `flow_list`

No input parameters.

#### `flow_create`

| Parameter | Type     | Description             |
|-----------|----------|-------------------------|
| `name`    | `string` | Name of the flow to create |

#### `flow_delete`

| Parameter | Type     | Description             |
|-----------|----------|-------------------------|
| `name`    | `string` | Name of the flow to delete |

#### `design_list`

| Parameter  | Type     | Description                              |
|------------|----------|------------------------------------------|
| `flowName` | `string` | Name of the flow to list designs from    |

#### `design_read`

| Parameter  | Type     | Description                                                                    |
|------------|----------|--------------------------------------------------------------------------------|
| `flowName` | `string` | Name of the flow the design belongs to                                         |
| `name`     | `string` | File name to read, including its extension (for example index.html or styles.css) |

#### `design_write`

| Parameter  | Type     | Description                                                                                            |
|------------|----------|--------------------------------------------------------------------------------------------------------|
| `flowName` | `string` | Name of the flow this design belongs to; created automatically if it doesn't exist                     |
| `name`     | `string` | File name to create or update, including its extension (for example index.html, styles.css, or app.js) |
| `content`  | `string` | Full text content, or base64 data when encoding is base64                                              |
| `encoding` | `string` | How content is encoded (`"utf8"` or `"base64"`, default `"utf8"`)                                      |

The tool writes through `updateDesign` (create or overwrite). Its result returns the saved file metadata
(`flowName`, `name`, `size`, `updatedAt`) but not the `content` field. Each overwrite snapshots the previous
content into the flow's history (tagged with source `agent`).

#### `design_delete`

| Parameter  | Type     | Description                              |
|------------|----------|------------------------------------------|
| `flowName` | `string` | Name of the flow the design belongs to   |
| `name`     | `string` | File name to delete, including its extension |

#### `design_screenshot`

| Parameter  | Type      | Description                                                                              |
|------------|-----------|------------------------------------------------------------------------------------------|
| `flowName` | `string`  | Name of the flow the design belongs to                                                    |
| `name`     | `string`  | Design file name to capture (for example index.html)                                      |
| `width`    | `integer` | Optional viewport width in CSS pixels (e.g. `375` for mobile, `1280` for desktop)         |
| `height`   | `integer` | Optional viewport height in CSS pixels                                                    |

The tool navigates a browser session to the token-gated preview URL for the saved design, resizes when
`width`/`height` are provided, and captures a PNG. The result carries the image as a `sendToLLM` attachment
plus the viewport size and any console errors/warnings the page produced since navigation. Requires the
`@tokenring-ai/browser` plugin (installed by default); headless capture in Docker uses the `chromium` package
with the browser plugin's `chrome` backend.

### Config-Defined Tool

The package also provides a config-defined tool (registered via agent config, not exported from `tools.ts`):

| Tool         | Display Name          | Description                                                                   |
|--------------|-----------------------|-------------------------------------------------------------------------------|
| `ui-expert`  | `Web Design/UI Expert`| Use this tool to implement frontend UI components. It has specialized knowledge about the users front-end design preferences, and can more effectively implement design systems, generate style guides, and build user-centered interfaces. |

This tool accepts the following input arguments: `task_summary`, `instructions`, `relevant_surface_area`,
`ui_ux_requirements`, `constraints`, `known_issues_and_risks`, `non_goals`, and `completion_criteria`. It
is available to agents of the `web-design` agent type.

## Configuration

Configure the web design plugin in your application config:

```yaml
webDesign:
  webDesignDirectory: ./.tokenring/web-design
  agentTypes:
    - web-design
    - web-design-visual
```

### Configuration Options

| Field                 | Type       | Required | Default                                  | Description                                    |
|-----------------------|------------|----------|------------------------------------------|------------------------------------------------|
| `webDesignDirectory`  | `string`   | No       | `"web-design"`                           | Directory where design flows are stored        |
| `fsProvider`          | `string`   | No       | `"posix"`                                | Filesystem provider used in `/api/fs` preview URLs for design files |
| `previewBaseUrl`      | `string`   | No       | _(running web host URL)_                 | Base URL agents use to open hosted design previews (used by `design_screenshot`) |
| `agentTypes`          | `string[]` | No       | `["web-design", "web-design-visual"]`    | The available agent types that can be used for web design |

The `webDesignDirectory` path is resolved relative to the application workspace directory.

### Schema Metadata

The `WebDesignServiceConfigSchema` includes `.meta()` annotations for configuration UI integration:

- **Top-level**: label `"Web Design"`, description `"Figma-style design flows and designs, backed by files on disk"`
- **`webDesignDirectory`**: description `"Directory where design flows are stored"`
- **`agentTypes`**: description `"The available agent types that can be used for web design"`

### Agent Types

The plugin ships two agent types via `config/agents/`:

| Field          | `web-design`                                                                          | `web-design-visual`                                                                                     |
|----------------|----------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------|
| Display name   | `Web Design Agent`                                                                     | `Visual Web Design Agent`                                                                                 |
| Category       | `Web Design Plugin`                                                                    | `Web Design Plugin`                                                                                       |
| Description    | Design UI mockups and multi-screen flows as linked HTML, CSS, JavaScript, and asset files. | Same, with screenshot-based visual self-review of every screen.                                           |
| Enabled tools  | `flow_*`, `design_*`, `todo`, `file_*`                                                 | `flow_*`, `design_*`, `todo`, `file_*`                                                                    |
| Drives command | `/design`                                                                              | `/design-visual`                                                                                          |

The visual agent's system prompt additionally mandates the review loop: after writing each screen, capture it
with `design_screenshot` at desktop and mobile widths, inspect spacing/contrast/hierarchy, read console errors,
and iterate until clean before finishing.

## Naming

Flow names must start with a letter or number and may contain letters, numbers, hyphens, and underscores
(`^[a-zA-Z0-9][a-zA-Z0-9_-]*$`). File names may additionally contain dots and must start with a letter or
number (`^[a-zA-Z0-9][a-zA-Z0-9._-]*$`); `.` and `..` are rejected. For backward compatibility, a file
name without an extension is stored with `.html`. Binary files are written with `encoding: "base64"` and
read back base64-encoded; text files are stored and read as UTF-8.

## Core Components

### WebDesignService

The central service that manages flows and designs on disk.

```typescript
import { WebDesignService } from "@tokenring-ai/web-design";

const webDesignService = agent.requireService(WebDesignService);
```

**Properties:**

| Property      | Type     | Description                                                      |
|---------------|----------|------------------------------------------------------------------|
| `name`        | `string` | `"WebDesignService"`                                             |
| `description` | `string` | `"Figma-style design flows and designs, backed by files on disk"`|

**Methods:**

| Method | Description |
|--------|-------------|
| `getAgentTypes()` | Return the agent types configured for web design (from `WebDesignServiceConfigSchema.agentTypes`) |
| `getWebDesignDirectoryName()` | Return the configured directory name relative to the workspace (e.g. `web-design`) |
| `getWebDesignDirectory()` | Return the workspace-resolved absolute path of the web design directory |
| `getCurrentDesign(agent)` | Return the agent's currently selected design, or `undefined` |
| `selectDesign(flowName, designName, agent)` | Load a design and set it as the agent's current selection; returns the design or `null` |
| `clearCurrentDesign(agent)` | Clear the agent's currently selected design |
| `listFlows()` | List flow summaries (`name`, `designCount`, `updatedAt`), sorted by name |
| `createFlow(flowName)` | Create a new, empty flow; throws if the name is already in use |
| `deleteFlow(flowName)` | Delete a flow and all of its designs; returns `false` if it didn't exist |
| `listDesigns(flowName)` | List design summaries (`flowName`, `name`, `size`, `mimeType`, `updatedAt`) within a flow, sorted by name |
| `getDesign(flowName, designName)` | Read a design's content, or `null` if it doesn't exist; text files are returned UTF-8, binary files base64 |
| `createDesign(flowName, designName, content, encoding?)` | Create a new design, auto-creating its flow; throws if the name is already in use |
| `updateDesign(flowName, designName, content, encoding?, source?)` | Create or overwrite a design, auto-creating its flow; overwrites first snapshot the previous content into history (source: `"user"` or `"agent"`) |
| `deleteDesign(flowName, designName)` | Delete a design; returns `false` if it didn't exist |
| `listDesignHistory(flowName, designName)` | List history snapshots for a design (newest first) |
| `getDesignVersion(flowName, designName, versionId)` | Read one history snapshot's content, or `null` if missing |
| `getFsProvider()` | Return the filesystem provider used in `/api/fs` preview URLs |
| `getPreviewBaseUrl()` | Return the configured preview base URL, if any |
| `getPreviewToken()` / `verifyPreviewToken(token)` | Per-boot token gating the `/api/web-design/preview` HTTP resource |

`encoding` defaults to `"utf8"` on `createDesign` / `updateDesign`.

### WebDesignState

Agents maintain a `WebDesignState` instance that holds the currently selected design.

```typescript
import { WebDesignState } from "@tokenring-ai/web-design";

const state = agent.getState(WebDesignState);
```

| Property                 | Type                          | Description                                                          |
|--------------------------|-------------------------------|----------------------------------------------------------------------|
| `currentDesign`          | `Design \| undefined`         | The currently selected design                                        |

#### State Inheritance

`WebDesignState` implements `transferStateFromParent`. When a child agent is created, it inherits the
parent's `currentDesign` if the child does not already have one.

#### State Serialization

- `serialize()` — Returns `{ currentDesign? }`
- `deserialize(data)` — Restores all properties from serialized data
- `show()` — Returns a human-readable summary string
  (`Current Design: <flowName>/<designName>`, or `None`)

## Services

`WebDesignService` implements the `TokenRingService` interface and is registered by the plugin during
`install`:

```typescript
app.addService(new WebDesignService(app));
```

### Lifecycle Methods

| Method | Description |
|--------|-------------|
| `attach(agent)` | Initialize `WebDesignState` on the agent (`agent.initializeState(WebDesignState, {})`) |
| `reconfigure(options)` | Replace the service configuration at runtime |

## Lifecycle Hooks

None. (Designs are attached to agent chat explicitly by the user in the Web Design app; the former
`addSelectedDesign` auto-attach hook was removed.)

## Preview HTTP Resource

The plugin registers a `Web Design Preview` web resource at `/api/web-design/preview/:flow/:file?token=…`
via `WebHostService`. It serves saved design files without the user's `/api/fs` credentials so local render
targets (headless browser captures) can load them. Access is gated by a per-boot random token held by
`WebDesignService`; agents receive ready-made URLs from the `design_screenshot` tool and never handle the
token themselves.

## RPC

The plugin registers a `Web Design RPC` endpoint at `/rpc/web-design`:

| Method                       | Type      | Description                                                                 |
|------------------------------|-----------|-----------------------------------------------------------------------------|
| `getWebDesignConfiguration`  | query     | Get web design configuration (`agentTypes`, `webDesignDirectory`, `serveDirectory`, `fsProvider`, `previewBaseUrl`) |
| `listFlows`                  | query     | List all flows                                                              |
| `streamFlows`                | stream    | Polling stream of flows (3s interval)                                       |
| `createFlow`                 | mutation  | Create a new flow                                                           |
| `deleteFlow`                 | mutation  | Delete a flow and its designs                                               |
| `listDesigns`                | query     | List designs within a flow                                                  |
| `streamDesigns`              | stream    | Polling stream of designs (3s interval)                                     |
| `getDesign`                  | query     | Read a design's content                                                     |
| `createDesign`               | mutation  | Create a new design (`content` defaults to `""`)                            |
| `updateDesign`               | mutation  | Create or overwrite a design (optional `source`: `"user"` or `"agent"`, stored on the auto-created history snapshot) |
| `deleteDesign`               | mutation  | Delete a design                                                            |
| `listDesignHistory`          | query     | List history snapshots for a design (newest first)                          |
| `getDesignVersion`           | query     | Read one history snapshot's content, or `null`                              |
| `getWebDesignState`          | query     | Get an agent's currently selected flow and design                          |
| `updateWebDesignState`       | mutation  | Set an agent's currently selected flow and design                          |

`getWebDesignConfiguration` returns `{ agentTypes: string[] }` from the configured `agentTypes` field
(default `["web-design"]`). The `createDesign` input's `content` defaults to an empty string and both
write methods default `encoding` to `"utf8"`.

### State Management Methods

`getWebDesignState` and `updateWebDesignState` return a discriminated union on `status`:

| Status            | Additional Fields                                                           | Description                                    |
|-------------------|-----------------------------------------------------------------------------|------------------------------------------------|
| `"success"`       | `selectedFlowName: string \| null`, `selectedDesignName: string \| null`    | Agent found and state returned                 |
| `"agentNotFound"` | _(none)_                                                                    | The specified `agentId` does not match an active agent |

`updateWebDesignState` selects a design only when both `selectedFlowName` and `selectedDesignName` are
provided; otherwise it returns the current selection unchanged.

### Streaming Methods

`streamFlows` and `streamDesigns` are polling streams built with `createPollingQueryStream` that re-query
the directory every 3 seconds, yielding updated flow or design lists.

## Dependencies

| Package                    | Purpose                                                    |
|----------------------------|------------------------------------------------------------|
| `@tokenring-ai/agent`      | Agent state management                                     |
| `@tokenring-ai/app`        | Plugin and service interfaces, `TokenRingApp`, config metadata |
| `@tokenring-ai/browser`    | Headless browser sessions for `design_screenshot`          |
| `@tokenring-ai/chat`       | Tool registration with `ChatService`                       |
| `@tokenring-ai/rpc`        | RPC endpoint and polling stream utilities                  |
| `@tokenring-ai/utility`    | Deep clone utility for config merging                      |
| `@tokenring-ai/web-host`   | Preview HTTP resource registration, web host URL           |
| `zod`                      | Schema validation                                          |

## Testing

Tests use `bun test` and are located in `WebDesignService.test.ts`, `tools/screenshotDesign.test.ts`, and
`frontend/lib/designAnnotations.test.ts`:

```bash
bun test
```

The test suite covers flow and design CRUD, flow auto-creation on write, duplicate detection, binary and
text assets, name validation (including path traversal rejection), directory listing behavior, the screenshot
tool (URL construction, viewport resize, console reporting, attachments), and the annotation
comment format (parse, insert, reply, resolve, delete, element round-trip).

## License

MIT License — see LICENSE file for details.
