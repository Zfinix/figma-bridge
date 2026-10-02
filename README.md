# figma-bridge

An MCP server and Figma plugin that give your agent full read and write access to
the Figma desktop app through the Plugin API.

Figma's own MCP server is built for reading designs into code. figma-bridge goes
the other way too: the agent can walk the node tree, run arbitrary Plugin API
code, create and edit frames and text, set fills, strokes, effects, and images,
import library components, follow and change your selection, export nodes, and
take screenshots of the canvas to check its work.

Everything runs on your machine. The plugin only talks to `localhost`.

## How it works

```text
agent  --stdio-->  server/index.ts  --ws-->  relay (127.0.0.1:4395)  <--ws--  Figma plugin
                   (one per session)         (one shared daemon)              (runs in Figma)
```

- `server/index.ts` is the MCP server your agent starts over stdio. It forwards
  each tool call to the relay.
- `server/relay.ts` is a small daemon on `ws://127.0.0.1:4395`. The MCP server
  starts it on first use if it is not running. Several agent sessions can share
  it, and it keeps running after they exit.
- `plugin/` is the Figma plugin. It connects out to the relay, runs each call
  against the Plugin API, and sends the result back. It reconnects on its own if
  the relay restarts.

## Requirements

- [Bun](https://bun.sh) 1.1 or newer. The server has no dependencies to install.
- The Figma desktop app. Development plugins cannot be imported in the browser.
- Edit access to the file you want the agent to work on.

## Setup

### 1. Get the code

```sh
git clone https://github.com/Zfinix/figma-bridge.git
cd figma-bridge
```

The built plugin is committed in `plugin/dist/`, so you do not need to build it.

### 2. Import the plugin into Figma

1. Open the Figma desktop app and open any design file.
2. Go to **Plugins > Development > Import plugin from manifest...**.
3. Pick `plugin/manifest.json` from this repo.

You only do this once. Figma remembers the plugin under **Plugins > Development**.

### 3. Add the MCP server to your agent

Use the absolute path to `server/index.ts` in the snippets below.

**Claude Code**

```sh
claude mcp add figma-bridge -s user -- bun /absolute/path/to/figma-bridge/server/index.ts
```

**Aster**

Install it as a plugin, straight from GitHub:

```sh
aster plugins add Zfinix/figma-bridge
```

Or add it to `aster.yaml` by hand:

```yaml
mcp:
  servers:
    figma-bridge:
      command: bun
      args: ["/absolute/path/to/figma-bridge/server/index.ts"]
```

**Cursor, Claude Desktop, and other hosts that read `mcpServers` JSON**

```json
{
  "mcpServers": {
    "figma-bridge": {
      "command": "bun",
      "args": ["/absolute/path/to/figma-bridge/server/index.ts"]
    }
  }
}
```

Cursor reads this from `~/.cursor/mcp.json`. Claude Desktop reads it from
`~/Library/Application Support/Claude/claude_desktop_config.json`. If the host
cannot find `bun`, use its full path from `which bun`.

Restart the host after adding the server.

### 4. Connect

1. In Figma, open the file you want to work on.
2. Run **Plugins > Development > figma-bridge**. A small strip appears with a
   green dot when it is connected to the relay and the time of the last call.
   Drag it into a corner and leave it open while the agent works. A visible
   window also keeps Figma from showing its "Running figma-bridge" pill.
3. Ask your agent something like "take a screenshot of the current Figma page".

If the relay is not running yet, the plugin keeps retrying and connects as soon as
the agent makes its first call, which starts the relay.

### 5. Check it works

Without Figma:

```sh
bun server/smoke.ts
```

You should see the server name and the list of tools. The last line says Figma is
not connected, which is expected when the plugin is not running. With the plugin
open, the same command returns `2` for `execute 1+1`.

## Tools

| Tool | What it does |
| --- | --- |
| `execute` | Run any Plugin API code. `figma` is in scope and the last expression is returned as JSON. |
| `get_tree` | The node tree under a node (default: the document): ids, names, types, layout, text, and sizes, capped by `max_depth`. |
| `get_node` | Full detail for one node: fills, strokes, effects, text style, constraints, transform, children. |
| `get_layout` | A 2D ASCII map of one frame with px rulers, the columns its children share, and overflow, overlap, and near-miss alignment issues. Read it before and after moving nodes. |
| `get_screenshot` | Render the canvas or one node to an image. This is how the agent sees its work. |
| `notify` | Show a toast in Figma so you see what the agent did. |
| `create_frame` | Create a frame, with optional auto layout (`layoutMode`, `itemSpacing`, padding). |
| `create_text` | Create a text node. Fonts other than Inter Regular must be loaded first with `execute`. |
| `set_properties` | Set any writable node properties in one call, such as `cornerRadius` or `opacity`. |
| `set_fills` / `set_strokes` / `set_effects` | Replace a node's paints or effects. |
| `set_image_fill` | Fill a node with an image from a URL or base64 data. |
| `clone_node` | Duplicate a node, optionally into another parent and position. |
| `delete_node` | Remove a node. |
| `import_component` | Place a team library component by its key. |
| `get_selection` | What you have selected in Figma right now. |
| `set_selection` | Select nodes and scroll the viewport to them. |
| `export_node` | Export a node as PNG, JPG, SVG, or PDF. |

## Troubleshooting

**"Figma is not connected"**. The plugin is not running. Open the file in the
Figma desktop app and run **Plugins > Development > figma-bridge**.

**"Relay connection lost"**. The plugin window was closed or the relay restarted.
Run the plugin again and retry.

**"Could not start the figma-bridge relay on 127.0.0.1:4395"**. Something else is
using port 4395, or `bun` is not on the PATH the host uses. Check with
`lsof -i :4395`, or start the relay by hand to see its log:

```sh
bun server/relay.ts
```

**The agent is using an old version after you pulled changes**. The relay keeps
running between sessions. Stop it and the next tool call starts a fresh one:

```sh
lsof -ti :4395 | xargs kill
```

**The plugin connects, then drops**. Only one plugin window can hold the
connection. Opening the plugin in a second file or tab replaces the first one.

**`create_text` fails with a font error**. Load the font first, for example with
`execute`: `await figma.loadFontAsync({ family: "Roboto", style: "Bold" })`.

**The host shows no figma-bridge tools**. The host could not start `bun`. Put the
full path to `bun` in `command` and restart the host.

## Developing the plugin

The plugin source is TypeScript in `plugin/src/`. Figma runs the bundled output
in `plugin/dist/`.

```sh
cd plugin
bun install
bun run build       # bundle src/code.ts and src/ui.ts into dist/
bun run typecheck   # tsc against @figma/plugin-typings
```

After a build, close and rerun the plugin in Figma to load the new code. Run
**Import plugin from manifest** again only if you change `manifest.json`.

To test the server without Figma, run `bun server/fake-plugin.ts` in one terminal.
It connects to the relay as a stand-in plugin.

## Security

`execute` runs whatever Plugin API code the agent sends, with the same access to
the open file that you have. The relay listens on `127.0.0.1` only, and the
plugin's manifest allows network access to `localhost:4395` and nothing else.
Close the plugin window to cut the agent off.

## License

MIT
