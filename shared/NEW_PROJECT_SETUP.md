# New Project Setup Checklist

Stack: Vite + React + TypeScript, deployed to GitHub Pages via peaceiris action.

## 1. vite.config.ts — set base path (REQUIRED)

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/your-repo-name/',   // <-- must match the GitHub repo name exactly
  plugins: [react()],
})
```

## 2. .github/workflows/deploy.yaml

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci

      - run: npm run build

      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

## 3. After first push to main

- Wait for the GitHub Action to complete (~1-2 min)
- Go to repo Settings → Pages
- Set source: "Deploy from a branch", branch: `gh-pages`, folder: `/ (root)`
- Site will be live at `https://sakhalteam.github.io/your-repo-name/`

## 4. Shared files

Copy any needed components/styles from:
`sakhalteam/sakhalteam.github.io` → `shared/components/` or `shared/styles/`
