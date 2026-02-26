# Migration Guide — sakhaltai.github.io sub-pages → sakhalteam org repos

Each sub-page from the personal site becomes its own repo under the sakhalteam org.
Final URLs: `sakhalteam.github.io/bird-bingo/`, `sakhalteam.github.io/rocky-care/`, etc.

---

## Pages to migrate

| Page           | New repo name  | New URL                                   | Needs data file?        | Needs public assets?        |
|----------------|----------------|-------------------------------------------|-------------------------|-----------------------------|
| BirdBingo      | `bird-bingo`   | sakhalteam.github.io/bird-bingo/          | `src/birds-data.ts`     | `public/birds/` (img+audio) |
| RockyCare      | `rocky-care`   | sakhalteam.github.io/rocky-care/          | none                    | `public/rocky/meds/`        |
| OscarCare      | `oscar-care`   | sakhalteam.github.io/oscar-care/          | none                    | none (check OscarCare.tsx)  |
| Teaching       | `teaching`     | sakhalteam.github.io/teaching/            | none                    | none (check Teaching.tsx)   |
| JapaneseArticles | `jp-reading` | sakhalteam.github.io/jp-reading/          | `src/content/japanese/` | none                        |

---

## Shared files all pages need

All pages depend on these — they live in `shared/styles/index.css` in this repo:
- CSS variables: `--bg`, `--card`, `--border`, `--text`, `--muted`, `--bg-elev`
- Utility classes: `.btn`, `.btn.primary`, `.wrap`, `.brand`, `.shadow-card`
- BirdBingo also uses `.card-3d-*` classes (already in index.css)

---

## Steps — do this ONCE per page

### A. On GitHub (browser)
1. Go to github.com/sakhalteam
2. Click "New repository"
3. Name it exactly as in the table above (e.g. `bird-bingo`)
4. Set to Public, no README, no .gitignore
5. Click "Create repository"

### B. On your PC (terminal — do NOT open VS Code yet)
```
cd C:/Users/sakha/Code/sakhalteam
git clone https://github.com/sakhalteam/bird-bingo.git
```

### C. Open in VS Code
- Open VS Code → File → Open Folder → select `C:/Users/sakha/Code/sakhalteam/bird-bingo`
- This should be a **new VS Code window** (not the sakhalteam.github.io window)
- Start Claude Code in that window

### D. Prompt Claude Code (paste the relevant prompt from the section below)

---

## Migration prompts — one per page

### BIRD BINGO

```
I'm migrating the BirdBingo page from my personal site (sakhaltai.github.io)
into its own standalone Vite + React + TS project.

Target URL: https://sakhalteam.github.io/bird-bingo/
Repo: sakhalteam/bird-bingo

Please scaffold a complete Vite + React + TS project with:

1. vite.config.ts — use this smart base-path config:
   import { defineConfig } from 'vite'
   import react from '@vitejs/plugin-react'
   const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] || ''
   const isCI = !!process.env.GITHUB_ACTIONS
   const isUserSite = /\.github\.io$/.test(repo)
   export default defineConfig({
     plugins: [react()],
     base: isCI ? (isUserSite ? '/' : `/${repo}/`) : '/',
   })

2. .github/workflows/deploy.yaml — standard peaceiris deploy:
   (same as C:/Users/sakha/Code/sakhalteam/sakhalteam.github.io/.github/workflows/deploy.yaml)

3. Tailwind CSS — install and configure (same as sakhaltai.github.io:
   devDeps: tailwindcss, postcss, autoprefixer
   postcss.config.js + tailwind.config.ts pointing at src/**)

4. src/index.css — copy exactly from:
   C:/Users/sakha/Code/sakhalteam/sakhalteam.github.io/shared/styles/index.css

5. src/birds-data.ts — copy exactly from:
   C:/Users/sakha/Code/sakhaltai.github.io/src/birds-data.ts

6. src/App.tsx — copy the BirdBingo page component from:
   C:/Users/sakha/Code/sakhaltai.github.io/src/pages/BirdBingo.tsx
   Make it the root of this app (no routing needed — it's the whole page).
   Update the import path: import { birds } from './birds-data'

7. src/main.tsx — standard Vite entry, wraps App in React root.
   No BrowserRouter needed (no routing).

8. public/birds/ — copy the entire folder from:
   C:/Users/sakha/Code/sakhaltai.github.io/public/birds/

After setup, push to main and I'll configure GitHub Pages to use the gh-pages branch.
```

---

### ROCKY CARE

```
I'm migrating the RockyCare page from my personal site (sakhaltai.github.io)
into its own standalone Vite + React + TS project.

Target URL: https://sakhalteam.github.io/rocky-care/
Repo: sakhalteam/rocky-care

Please scaffold a complete Vite + React + TS project with:

1. vite.config.ts — smart base-path config:
   import { defineConfig } from 'vite'
   import react from '@vitejs/plugin-react'
   const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] || ''
   const isCI = !!process.env.GITHUB_ACTIONS
   const isUserSite = /\.github\.io$/.test(repo)
   export default defineConfig({
     plugins: [react()],
     base: isCI ? (isUserSite ? '/' : `/${repo}/`) : '/',
   })

2. .github/workflows/deploy.yaml — standard peaceiris deploy

3. Tailwind CSS — install and configure
   (devDeps: tailwindcss, postcss, autoprefixer
    postcss.config.js + tailwind.config.ts pointing at src/**)

4. src/index.css — copy exactly from:
   C:/Users/sakha/Code/sakhalteam/sakhalteam.github.io/shared/styles/index.css

5. src/App.tsx — copy the RockyCare page component from:
   C:/Users/sakha/Code/sakhaltai.github.io/src/pages/RockyCare.tsx
   Make it the root of this app (no routing needed).

6. src/main.tsx — standard Vite entry, no BrowserRouter.

7. public/rocky/ — copy the entire folder from:
   C:/Users/sakha/Code/sakhaltai.github.io/public/rocky/

After setup, push to main and I'll configure GitHub Pages to use the gh-pages branch.
```

---

### OSCAR CARE

```
I'm migrating the OscarCare page from my personal site (sakhaltai.github.io)
into its own standalone Vite + React + TS project.

Target URL: https://sakhalteam.github.io/oscar-care/
Repo: sakhalteam/oscar-care

Please scaffold a complete Vite + React + TS project with:

1. vite.config.ts — smart base-path config (same as bird-bingo above)
2. .github/workflows/deploy.yaml — standard peaceiris deploy
3. Tailwind CSS — install and configure
4. src/index.css — copy from: C:/Users/sakha/Code/sakhalteam/sakhalteam.github.io/shared/styles/index.css
5. src/App.tsx — copy from: C:/Users/sakha/Code/sakhaltai.github.io/src/pages/OscarCare.tsx
   Make it the root of this app (no routing needed).
6. src/main.tsx — standard Vite entry, no BrowserRouter.
7. Copy any public/ assets used by OscarCare.tsx from:
   C:/Users/sakha/Code/sakhaltai.github.io/public/
```

---

### TEACHING

```
I'm migrating the Teaching page from my personal site (sakhaltai.github.io)
into its own standalone Vite + React + TS project.

Target URL: https://sakhalteam.github.io/teaching/
Repo: sakhalteam/teaching

Please scaffold a complete Vite + React + TS project with:

1. vite.config.ts — smart base-path config (same as bird-bingo above)
2. .github/workflows/deploy.yaml — standard peaceiris deploy
3. Tailwind CSS — install and configure
4. src/index.css — copy from: C:/Users/sakha/Code/sakhalteam/sakhalteam.github.io/shared/styles/index.css
5. src/App.tsx — copy from: C:/Users/sakha/Code/sakhaltai.github.io/src/pages/Teaching.tsx
   Make it the root of this app (no routing needed).
6. src/main.tsx — standard Vite entry, no BrowserRouter.
```

---

### JAPANESE ARTICLES

```
I'm migrating the JapaneseArticles page from my personal site (sakhaltai.github.io)
into its own standalone Vite + React + TS project.

Target URL: https://sakhalteam.github.io/jp-reading/
Repo: sakhalteam/jp-reading

Please scaffold a complete Vite + React + TS project with:

1. vite.config.ts — smart base-path config (same as bird-bingo above)
2. .github/workflows/deploy.yaml — standard peaceiris deploy
3. Tailwind CSS — install and configure
4. src/index.css — copy from: C:/Users/sakha/Code/sakhalteam/sakhalteam.github.io/shared/styles/index.css
5. src/App.tsx — copy from: C:/Users/sakha/Code/sakhaltai.github.io/src/pages/JapaneseArticles.tsx
   Make it the root of this app. The page has internal article routing — Claude Code
   will need to adapt this since there's no React Router in a standalone app.
6. src/content/ — copy the entire folder from:
   C:/Users/sakha/Code/sakhaltai.github.io/src/content/
7. Any other data files imported by JapaneseArticles.tsx
8. src/main.tsx — standard Vite entry.
   Note: JapaneseArticles uses URL params for article IDs. Claude Code should
   either add react-router-dom or handle state locally.
```

---

## After each page is deployed

1. Go to that repo on GitHub → Settings → Pages
2. Source: "Deploy from a branch", branch: `gh-pages`, folder: `/ (root)`
3. Save — site goes live within 1-2 minutes

## What to do with sakhaltai.github.io

Once each page is live on sakhalteam.github.io, you can either:
- Remove those pages from the personal site and link to the new URLs
- Or leave them as-is (they don't conflict — different domain)
