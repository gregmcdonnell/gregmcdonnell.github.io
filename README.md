# gregmcdonnell.github.io

Personal engineering and physics portfolio: projects, interactive simulations, a gallery and notes.
Built with [Astro](https://astro.build) and deployed to GitHub Pages with GitHub Actions.

Live site: https://gregmcdonnell.github.io

## Commands

Run from the repo root. Requires Node 22.23.4 or newer.

| Command           | Action                                          |
| :---------------- | :---------------------------------------------- |
| `npm install`     | Install dependencies                            |
| `npm run dev`     | Dev server at `localhost:4321`                  |
| `npm run build`   | Build the site into `dist/`                     |
| `npm run preview` | Serve `dist/` locally, as GitHub Pages would    |

## Project structure

```text
src/
  pages/        Routes (file path = URL): home, projects, simulations, gallery, notes
  layouts/      Base.astro (page shell), ProjectLayout.astro
  components/   Header, Footer, ProjectCard, SimCard, TagFilter
  content/      Site content, validated by the schemas in src/content.config.ts
    projects/     One Markdown file per project write-up
    simulations/  One JSON file per simulation (metadata only)
    gallery.json  Gallery images and captions
  scripts/      Client-side scripts bundled by Astro
  styles/       global.css
public/         Copied to the site as-is: simulations, images, favicons
archive/        Previous hand-built site, kept for reference. Not part of the build.
```

## Adding content

**A project.** Create `src/content/projects/<slug>.md`:

```md
---
title: My Project
date: 2026-06
description: One-line summary.
tags: [simulation, physics]
image: /assets/images/my-project/cover.png
simulation: my-sim        # optional: folder in public/simulations/, adds an "Open simulation" button
featured: true            # optional: show on the home page
---

Write the article in Markdown. Math uses KaTeX: `$x^2$` inline, `$$ ... $$` for display
(escape literal dollar signs as `\$`). Fenced code blocks are highlighted at build time.
```

The page appears at `/projects/<slug>` and on the projects index automatically.

**A simulation.**
1. Put the sim in `public/simulations/<name>/` with an `index.html` and a `thumbnail.png`.
2. Add `src/content/simulations/<name>.json` with `title`, `date`, and optionally `description`,
   `tags`, `project` (a project slug), `featured`, `draft`.

**A gallery image.** Put the file under `public/assets/images/` and add an entry to
`src/content/gallery.json` with `src`, and a `project` or `simulation` slug to link it.

A missing required field or a reference to a project/simulation that doesn't exist fails the
build with an error that names the file.

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds the site and publishes `dist/`
to GitHub Pages. `dist/` is not committed.

One-time setup: repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
