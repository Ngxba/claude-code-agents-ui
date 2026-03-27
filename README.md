<div align="center">

# Claude Code Agent UI

**Visualize, manage, and orchestrate your Claude Code ecosystem — all in one place.**

Stop editing scattered `.claude` files.  
Start building agents, workflows, and tools visually.

[Quick Start](#quick-start) · [Features](#features) · [Why agents-ui?](#why-agents-ui) · [Contributing](CONTRIBUTING.md)

</div>

---

## ⚡ Quick Start

```bash
git clone https://github.com/Ngxba/claude-code-agents-ui.git
cd claude-code-agents-ui
bun install
bun run dev
```

Open **http://localhost:3000** — agents-ui will automatically load your `~/.claude` setup.

> **Prerequisites:** [Bun](https://bun.sh) (recommended) or Node.js 18+

---

## ✨ Features

### 💬 ClaudeCode Chat UI
Chat with your agents in a clean, real-time interface.

- Automatically detects all Claude session folders dynamically  
- Instant feedback loop for prompts  
- Great for testing behaviors quickly  
- No need to jump back to CLI  

![Claude Code Chat](docs/images/chat-view.png)

---

### 🤖 Agent Management
Design and manage agents without touching markdown.

- Create, edit, and organize agents visually  
- Configure models, instructions, and memory  
- Use templates or build from scratch  

![Agent View](docs/images/agent-main-view.png)
![Agent Editor](docs/images/agent-editor.png)

---

### ⚡ Command Builder
Create reusable slash commands with structure and safety.

- Argument hints for better UX  
- Allowed-tools configuration  
- Organized folder structure  

---

### 🔗 Relationship Graph
See how everything connects — instantly.

- Visual map of agents, commands, and skills  
- Identify dependencies and gaps  
- Understand your system at a glance  

![Relationship Graph](docs/images/graph.png)

---

### 🧪 Agent Studio
Iterate faster with live testing.

- Send messages and inspect execution  
- Debug agent behavior in real time  
- Refine prompts without context switching  

![Agent Studio](docs/images/studio.png)

---

### 🔄 Workflow Builder
Build multi-step AI pipelines visually.

- Chain agents into workflows  
- Control execution order  
- Inspect intermediate results  

![Workflow Builder](docs/images/workflows-view.png)

---

### 🧠 Skill Management
Extend your agents with reusable capabilities.

- Import skills from GitHub  
- Create and manage custom skills  
- Keep everything centralized  

---

### 🌍 Explore & Templates
Kickstart faster with community resources.

- Discover agent templates  
- Browse extensions  
- Import and experiment instantly  

![Explore](docs/images/explore.png)

---

## 🚀 Why agents-ui?

### If you're already using Claude Code
Managing agents via scattered markdown files works… until it doesn’t.

agents-ui gives you:
- A **single visual control layer**
- Faster iteration cycles
- Better visibility into your system

---

### If you're new to Claude Code
The CLI can feel overwhelming.

agents-ui helps you:
- Learn visually instead of guessing configs  
- Start with templates instead of blank files  
- Build confidence before going deeper  

---

## 🧱 Tech Stack

- Nuxt 3 + Vue 3  
- Nuxt UI + Tailwind CSS  
- VueFlow (graph visualization)  
- Bun  

---

## ⚙️ Environment Variables

| Variable     | Description                          | Default     |
| ------------ | ------------------------------------ | ----------- |
| `CLAUDE_DIR` | Path to your Claude config directory | `~/.claude` |

---

## 🤝 Contributing

We welcome contributions!  
See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and guidelines.

---

## 📄 License

[MIT](LICENSE)
