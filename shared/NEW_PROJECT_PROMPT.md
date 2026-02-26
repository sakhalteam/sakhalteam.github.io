# Claude Code Prompt — New sakhalteam Project

Paste this (with the blanks filled in) when opening a new project folder in VS Code.

---

I'm setting up a new mini project as part of the sakhalteam GitHub org.

**Project name / repo name:** `[repo-name]` (e.g. `dino-bingo`)
**What it does:** [one sentence description]

**Org context:**
- Org: `sakhalteam` on GitHub
- This project will deploy to: `https://sakhalteam.github.io/[repo-name]/`
- The org homepage repo lives at `C:/Users/sakha/Code/sakhalteam/sakhalteam.github.io/`
- Each project is a separate repo and separate local folder under `C:/Users/sakha/Code/sakhalteam/`

**Stack:** Vite + React + TypeScript

**Please set up the following:**

1. `vite.config.ts` — set `base: '/[repo-name]/'` (required for sub-path GitHub Pages)

2. `.github/workflows/deploy.yaml` — use this exact config:
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

3. Scaffold `src/` with the app structure needed for this project.

**Shared resources** (copy anything relevant into this project's `src/`):
- Components: `C:/Users/sakha/Code/sakhalteam/sakhalteam.github.io/shared/components/`
- Styles: `C:/Users/sakha/Code/sakhalteam/sakhalteam.github.io/shared/styles/`

**After setup, I will:**
- Push to `main` → GitHub Action runs → `gh-pages` branch is created automatically
- Go to repo Settings → Pages → set source to `gh-pages` branch
- Site goes live at `https://sakhalteam.github.io/[repo-name]/`
