-----

# Snippetor

**A lightweight VS Code extension to save and share your knowledge about source code.**

[](https://www.google.com/search?q=https://marketplace.visualstudio.com/items%3FitemName%3Dyour-publisher-name.snippetor)
[](https://opensource.org/licenses/MIT)

## 🚀 What is Snippetor?

Snippetor is a powerful and privacy-first VS Code extension that allows you to capture and share **Software Architecture Snippets**. Think of it as a way to leave breadcrumbs of your knowledge and design decisions directly within your codebase.

Instead of writing long, disconnected documents, a snippet is a sequence of notes tied to specific files and line numbers. This makes it easy to:

  * **Document internal logic** and complex architecture.
  * **Onboard new team members** by guiding them through the codebase.
  * **Share technical understanding** with colleagues.
  * **Create a personal knowledge base** for future reference.

### 📋 What is a Snippet?

A snippet is a collection of one or more items, each consisting of:

  * **`filename`**: The file where the note is located.
  * **`line number`**: The specific line of code.
  * **`note`**: Your comment or explanation.

Together, these items describe the flow, design decisions, or internal logic of a piece of code. This structured format helps document key insights in a clear and contextual way.

## 📁 Where is Your Data Stored?

Your data is always yours. Snippetor is designed with a **privacy-first** philosophy, which means no data is ever sent to a remote server.

Snippet files (`*.snippet.json`) are **plain files in your project** — save them wherever
makes sense for your workflow, right alongside your code. There's no separate storage folder
or config to manage: browse and organize them with VS Code's own Explorer, and use whatever
sharing/backup method you already use for the rest of the project, such as:

  * A **Git repository** (recommended for teams\!)
  * A **Google Drive** or **Dropbox** synced folder

## 🛠 Features

  * **Snippet files live in your project:** No custom storage folder, no config — just `*.snippet.json` files wherever you save them.
  * **Opens straight into the sidebar:** Double-click a `.snippet.json` file and it loads directly into the Working Snippet panel — no JSON tab to wade through.
  * **Jump to the exact line:** Every snippet item links back to a real file and line number in your project.
  * **Lightweight and privacy-first:** No telemetry, no remote servers, no usage data collected.
  * **Visual UML diagrams:** Create and edit class, package, component, state, and sequence diagrams in a native editor tab (`.umlsync` files).

## Local run:
```
code --extensionDevelopmentPath="$PWD" --new-window
```

-----

## 🤖 AI-Driven Diagram Editing — Claude Code Skills

Snippetor ships installable [Claude Code](https://claude.com/product/claude-code)
skills (one per diagram kind: class, package, component, state, sequence) that
teach an AI agent the `.umlsync` JSON format directly — no server, no process
to spawn. Run **"UML: Install Diagram Skills for Claude Code"** from the
Command Palette to copy them into your workspace's `.claude/skills/`, then ask
your agent to create or edit a diagram the same way you'd ask it to edit any
other source file. See [Readme.uml_skills.md](Readme.uml_skills.md) for the
full design (this replaced an earlier MCP-server-based approach — see
[Readme.mcp.md](Readme.mcp.md) for why).

  * **Nothing to run:** the skills are plain markdown, read once into the
    agent's context — no child process, no build step, no MCP client config.
  * **Same privacy-first model as the rest of the extension:** the agent only
    reads and writes files in your workspace — nothing is sent to a remote
    server.

-----

## 💻 How to Build from Source

Make sure you have **Node.js** installed, then clone the repo and install dependencies:

```bash
git clone https://github.com/your-username/snippetor.git
cd snippetor
npm install
```

### Build targets

| Command | Description |
|---|---|
| `npm run compile` | Full build — Working Snippet webview, UML editor webview, and the TypeScript extension bundle |
| `npm run build:snippet-view` | Copies `media/snippetView.html` (a self-contained file, no separate JS/CSS to assemble) to `out/extension/media/` |
| `npm run build:umlsync` | Rebuilds the UML diagram editor webview (copies the `umlsync` vendor bundle + assembles `umlEditor.html`) |
| `npm run build:bundle` | Compiles the TypeScript extension bundle |

### Test targets

| Command | Description |
|---|---|
| `npm run test-host` | Runs unit tests with Vitest (no VS Code instance required) |
| `npm run test:vscode` | Runs integration tests inside a real VS Code instance |

## 🗺️ Future Plans

We have exciting plans for Snippetor to make it even more powerful. Stay tuned for:

  * **🌐 Public snippet sharing:** An **opt-in** feature to share your knowledge with the open-source community.
  * **💡 Team folders and collaboration tools:** Enhanced features for seamless team workflows.

## 🤝 Contributing

We welcome your feedback and contributions\! Whether you want to fix a bug, add a new feature, or improve the documentation, your help is appreciated.

Feel free to:

  * **Open an issue** for bug reports or feature suggestions.
  * **Submit a pull request** with your changes.

## 📃 License

This project is licensed under the **MIT License**. You are free to use, modify, and distribute this software for both personal and commercial projects.
