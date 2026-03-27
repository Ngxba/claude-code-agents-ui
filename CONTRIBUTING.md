# Contributing to claude-code-agents-ui

Originally created by [@davidrodriguezpozo](https://github.com/davidrodriguezpozo).  
This project is a fork of [agents-ui](https://github.com/davidrodriguezpozo/agents-ui).This project is now maintained and improved with contributions from the community.

Thank you for your interest in contributing to **claude-code-agents-ui**! We’re excited to have you here. This guide will help you get up and running quickly.

---

## 🚀 Development Setup

1. **Clone the repository**
```bash
   git clone https://github.com/Ngxba/claude-code-agents-ui.git
   cd claude-code-agents-ui
```

2. **Install dependencies**

   ```bash
   bun install
   ```

3. **Start the development server**

   ```bash
   bun run dev
   ```

4. **Open the app**

   ```
   http://localhost:3000
   ```

---

## 🛠️ Making Changes

1. Fork the repository and create a new branch from `main`
2. Implement your changes
3. Test your changes locally:

   ```bash
   bun run dev
   ```
4. Run type checks:

   ```bash
   bun run typecheck
   ```
5. Submit a pull request with a clear description of your changes

---

## 💡 What Can You Work On?

* Browse the [issues](https://github.com/Ngxba/claude-code-agents-ui/issues) and look for labels like `good first issue`
* Have a new idea? Open an issue first so we can discuss it before implementation

---

## 🎨 Code Style Guidelines

To keep the codebase consistent and maintainable:

* Use **Vue 3 Composition API** with `<script setup>`
* Write all new code in **TypeScript**
* Use **Tailwind CSS** for styling (prefer **Nuxt UI components** when applicable)
* Extract reusable logic into **composables** (`app/composables/`)

---

## ❓ Need Help?

If you have any questions or need guidance:

* Open an issue
* Start a discussion

We’re happy to support you—contributions of all sizes are welcome!
