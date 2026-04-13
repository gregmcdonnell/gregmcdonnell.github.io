const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const SRC_DIR = path.join(ROOT_DIR, 'src');
// const ARTICLES_DIR = path.join(ROOT, 'articles');
const TEMPLATE_DIR = path.join(SRC_DIR, 'templates');
const PAGES_DIR = path.join(TEMPLATE_DIR, 'pages');
const LAYOUT_PATH = path.join(TEMPLATE_DIR, 'layout.html');
const PROJECTS_SRC = path.join(SRC_DIR, 'projects');
const PROJECTS_DIST = path.join(DIST_DIR, 'projects');

function extractTemplate(fileContent) {
  const match = fileContent.match(
    /<script type="application\/json" id="metadata">([\s\S]*?)<\/script>(.*)/s
  );

  if (!match) return null;
  return match;
}

function buildProjects() {
  const projectFiles = fs.readdirSync(PROJECTS_SRC);

  const projects = [];

  const template = fs.readFileSync(LAYOUT_PATH, 'utf-8');

  projectFiles.forEach(filename => {

    const filePath = path.join(PROJECTS_SRC, filename);

    if (!fs.existsSync(filePath)) return;
    console.log(filePath);

    const srcHtml = fs.readFileSync(filePath, 'utf-8');
    const match = extractTemplate(srcHtml);
    try {
      metadata = JSON.parse(match[1]);
    } catch (err) {
      console.error('Invalid JSON in metadata');
    }
    const content = match[2];

    const projectSlug = filename.replace('.html', '');
    const projectURL = `/projects/${projectSlug}`;

    if (!metadata) {
      console.warn(`Skipping ${filename}: no metadata`);
      return;
    }

    projects.push({
      ...metadata,
      url: projectURL,
      slug: projectSlug
    });

    const projectDistPath = path.join(PROJECTS_DIST, projectSlug);
    const outputPath = path.join(projectDistPath, 'index.html');
    fs.mkdirSync(projectDistPath, { recursive: true });
    let distHtml = template.replace('{{title}}', 'Greg McDonnell — Engineering & Simulation')
    .replace('{{head}}', '')
    .replace('{{content}}', content)
    .replace('{{style}}', '');
    fs.writeFileSync(outputPath, distHtml);

  });

  // Sort by date (newest first)
  projects.sort((a, b) => new Date(b.date) - new Date(a.date));

  const outputPath = path.join(PROJECTS_DIST, 'manifest.json');
  fs.writeFileSync(outputPath, JSON.stringify(projects, null, 2));

  console.log('project pages and manifest successfully generated');
}

buildProjects();