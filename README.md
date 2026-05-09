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

By default, the extension creates your snippet data in a local folder:

`~/.vscode/archsnippets/`

You have full control over your storage location and can use shared folders for collaboration, such as:

  * A **Google Drive** or **Dropbox** folder
  * A **synced Git repository** (recommended for teams\!)

This flexibility allows you to choose your own backend and storage method, making collaboration seamless and secure without relying on any external service.

## 🛠 Features

  * **Auto-creates and manages local snippet spaces:** Get started instantly without any configuration.
  * **Supports organizing snippets into folders:** Keep your knowledge base tidy and easy to navigate.
  * **Lightweight and privacy-first:** No telemetry, no remote servers, no usage data collected.
  * **Shareable data:** Easily share snippet folders with your team.

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
| `npm run compile` | Full build — compiles TypeScript and assembles the webview HTML |
| `npm run build:explorer` | Rebuilds only the explorer webview HTML from `media/js/` and `media/css/` |
| `npm run build:bundle` | Compiles the TypeScript extension bundle |
| `npm run compile:test` | Compiles the test TypeScript and builds the test page |

### Test targets

| Command | Description |
|---|---|
| `npm run test-host` | Runs unit tests with Vitest (no VS Code instance required) |
| `npm run test:vscode` | Runs integration tests inside a real VS Code instance |

> **Note:** `build:explorer` must be re-run whenever you change files under `media/js/` or `media/css/`, as the extension loads the assembled file from `out/extension/media/explorerView.html`.

## 🗺️ Future Plans

We have exciting plans for Snippetor to make it even more powerful. Stay tuned for:

  * **🔧 UML diagram support:** Add visual diagrams to your snippets to make complex sequences more understandable.
  * **🌐 Public snippet sharing:** An **opt-in** feature to share your knowledge with the open-source community.
  * **💡 Team folders and collaboration tools:** Enhanced features for seamless team workflows.

## 🤝 Contributing

We welcome your feedback and contributions\! Whether you want to fix a bug, add a new feature, or improve the documentation, your help is appreciated.

Feel free to:

  * **Open an issue** for bug reports or feature suggestions.
  * **Submit a pull request** with your changes.

## 📃 License

This project is licensed under the **MIT License**. You are free to use, modify, and distribute this software for both personal and commercial projects.
