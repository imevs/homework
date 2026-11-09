# E-Klase Multi-Profile Playwright Homework Scraper (TypeScript)

Automated Playwright homework scraper in **TypeScript** that:
1. Opens [e-klase.lv](https://www.e-klase.lv) and signs in via `auth.e-klase.lv`.
2. Loops through and scrapes homework for **all requested student profiles**:
   - **4.c, Rīgas 40. vidusskola**
   - **1.a, Rīgas 40. vidusskola**
   - **4.c, Aizgādņu biedrība ASSOR**
   - **1.a, Aizgādņu biedrība ASSOR**
3. **Excludes today's homework**: only collects homework for upcoming days of the current week (strictly after today).
4. **Organizes attached files by homework day**: downloads into `attachments/<YYYY-MM-DD_dayName>/`.
5. **Skips re-downloading**: checks if files already exist on disk before making network requests.
6. **Combines homework by class**: unifies school entries into two cohesive classes (**4.c** and **1.a**) with school tags (`Rīgas 40. vsk.` / `ASSOR`).
7. Generates:
   - **[homework.html](file:///Users/vm/Documents/Projects/eclasse/homework.html)**: Ultra-compact, responsive dashboard with multi-column grid, class tabs (`4.c`, `1.a`, `Visas`), progress tracking, and direct local file links (no save prompts).
   - **[homework.md](file:///Users/vm/Documents/Projects/eclasse/homework.md)**: Markdown checklist grouped by class.
   - **[homework.json](file:///Users/vm/Documents/Projects/eclasse/homework.json)**: Full structured JSON data with both combined classes and per-profile records.

---

## 🏗️ Architecture & Modules

The codebase is structured into modular TypeScript components under `src/`:

```
src/
├── types.ts          # Interfaces (TargetProfile, Lesson, DayEntry, ScrapeReport, etc.)
├── config.ts         # Configuration & environment variable loading (.env)
├── utils.ts          # Helper utilities (formatBytes, escapeHtml, linkify, etc.)
├── combiner.ts       # Combines homework across profiles by class (4.c / 1.a)
├── scraper.ts        # Playwright scraper core (auth, diary navigation, attachments)
├── reports/
│   ├── markdown.ts   # Markdown checklist generator
│   ├── html.ts       # Compact interactive HTML dashboard generator
│   └── console.ts    # Terminal summary formatter
└── index.ts          # Main CLI entry point & orchestrator
```

---

## 🚀 Running the Scraper

```bash
# Run scraper with Node (native TypeScript support in Node 24)
npm start

# Or with visible browser window
npm run scrape:headed

# Regenerate reports locally from existing data without scraping:
npm run report

# Run TypeScript type check
npm run typecheck

# Build to dist/ (optional)
npm run build
```

---

## ⚙️ Environment Variables & Config Files

### 1. Default `.env` File
Create a `.env` file from the provided template:
```bash
cp .env.example .env
```
Edit `.env` with your credentials:
```env
EKLASE_USER=270816-28019
EKLASE_PASSWORD=V64satiek
HEADLESS=true
```
The scraper automatically loads `.env` on launch.

---

### 2. Passing a Custom Env / Config File

You can specify a custom config file in any of the following ways:

#### A. CLI argument (`--env-file` or `--config`):
```bash
npm start -- --env-file=my-credentials.env
# or
node src/index.ts --config=path/to/custom.env
```

#### B. Environment variable (`ENV_FILE` or `CONFIG_FILE`):
```bash
ENV_FILE=my-credentials.env npm start
```

#### C. Node's native `--env-file` flag (Node 20.6+ & Node 24):
```bash
node --env-file=my-credentials.env src/index.ts
```

---

### Supported Variables

| Variable | Default | Description |
|---|---|---|
| `EKLASE_USER` | `270816-28019` | Username / personas kods |
| `EKLASE_PASSWORD` | `V64satiek` | Password |
| `HEADLESS` | `true` | Set to `false` to display the browser window |

---

## 🌐 GitHub Pages Deployment (Automated at 14:00 Daily)

The workflow [.github/workflows/deploy-pages.yml](file:///Users/vm/Documents/Projects/eclasse/.github/workflows/deploy-pages.yml) runs every day at **14:00 Latvian time** (`12:00 UTC`), scrapes the latest homework, and publishes the dashboard with all attachments directly to GitHub Pages.

### Setup Instructions

1. **Add Repository Secrets**:
   Go to your GitHub repository -> **Settings** -> **Secrets and variables** -> **Actions** -> **New repository secret**:
   - `EKLASE_USER`: Your E-Klase username / personas kods
   - `EKLASE_PASSWORD`: Your E-Klase password

2. **Enable GitHub Pages**:
   Go to **Settings** -> **Pages**:
   - Under **Build and deployment** -> **Source**, select **GitHub Actions**.

3. **Schedule & Manual Triggers**:
   - The action automatically executes every day at **14:00 Latvian time** (cron `0 12 * * *`).
   - You can also manually trigger the deployment anytime by visiting the **Actions** tab -> **Deploy E-Klase Homework to GitHub Pages** -> **Run workflow**.

---

## 📁 Output Files & Structure

- [src/index.ts](file:///Users/vm/Documents/Projects/eclasse/src/index.ts) — Main TypeScript entry point.
- [homework.html](file:///Users/vm/Documents/Projects/eclasse/homework.html) — Compact interactive HTML dashboard.
- [homework.md](file:///Users/vm/Documents/Projects/eclasse/homework.md) — Markdown checklist with local file links.
- [homework.json](file:///Users/vm/Documents/Projects/eclasse/homework.json) — Structured JSON data.
- **`attachments/<YYYY-MM-DD_dayName>/`** — Downloaded attachments organized into folders relevant to the day of the homework:
  - `attachments/2026-11-10_otrdiena/`
  - `attachments/2026-11-11_trešdiena/`
  - `attachments/2026-11-12_ceturtdiena/`
