const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT_DIR = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'docs');
const SRC_DIR = path.join(ROOT_DIR, 'src');
// const ARTICLES_DIR = path.join(ROOT, 'articles');
const TEMPLATE_DIR = path.join(SRC_DIR, 'templates');
const PAGES_DIR = path.join(TEMPLATE_DIR, 'pages');
const LAYOUT_PATH = path.join(TEMPLATE_DIR, 'layout.html');
const PROJECTS_SRC = path.join(SRC_DIR, 'projects');
const PROJECTS_DIST = path.join(DIST_DIR, 'projects');
const GALLERY_DIST = path.join(DIST_DIR, 'gallery')
const SIMULATION_DIST = path.join(DIST_DIR, 'simulations')

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

    if (!(fs.existsSync(filePath) && fs.statSync(filePath).isFile())) return;
    console.log(`building index for ${filename}`);

    const srcHtml = fs.readFileSync(filePath, 'utf-8');
    const headAndBody = srcHtml.match(
    /<head>([\s\S]*?)<\/head>(.*)/s
    );

    const head = headAndBody[1];
    const match = extractTemplate(head);
    try {
      metadata = JSON.parse(match[1]);
    } catch (err) {
      console.error('Invalid JSON in metadata');
    }
    const content = headAndBody[2];

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
    const title = metadata.title ? metadata.title : "Greg McDonnell - Physics & Engineering"
    let distHtml = template.replace('{{title}}', title)
    .replace('{{head}}', head)
    .replace('{{content}}', content)
    .replace('{{style}}', '');
    fs.writeFileSync(outputPath, distHtml);

  });

  // Sort by date (newest first)
  projects.sort((a, b) => new Date(b.date) - new Date(a.date));

  const outputPath = path.join(PROJECTS_DIST, 'manifest.json');
  // const manifest = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
  fs.writeFileSync(outputPath, JSON.stringify(projects, null, 2));

  console.log('project pages and manifest successfully generated');
  
  buildGallery(projects);
}

function buildGallery(manifest) {
  const imagesDir = path.join(DIST_DIR, 'assets', 'images');


  // Create a map for quick lookup: slug -> tags
  const projectMap = {};
  manifest.forEach(project => {
    projectMap[project.slug] = project;// project.tags || [];
  });

  let gallery = [];
  let idCounter = 1;

  // Read all folders inside images directory
  const projectFolders = fs.readdirSync(imagesDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  projectFolders.forEach(slug => {
    const projectPath = path.join(imagesDir, slug);

    let tags = [];
    if (projectMap[slug])
      tags = projectMap[slug].tags;

    const files = fs.readdirSync(projectPath);

    files.forEach(file => {
      const filePath = path.join(projectPath, file);

      // Only include files (skip subfolders)
      if (!fs.statSync(filePath).isFile()) return;

      gallery.push({
        id: `img-${idCounter++}`,
        src: path.join('/assets', 'images', slug, file),
        project_slug: slug,
        tags: tags,
        caption: ''
      });
    });
  });

  // Write gallery.json
  const outputPath = path.join(GALLERY_DIST, "gallery.json");
  fs.writeFileSync(outputPath, JSON.stringify(gallery, null, 2), "utf-8");

  console.log("gallery.json created successfully!");

  let sims = [];
  const simulationFolders = fs.readdirSync(SIMULATION_DIST, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  simulationFolders.forEach(simSlug => {
    const simPath = path.join(SIMULATION_DIST, simSlug);
    const mainIndex = path.join(simPath, "index.html");
    simsToAdd = []
    if (fs.existsSync(mainIndex)) {
      simsToAdd.push({file: mainIndex, path: simSlug})
    }
    const subFolders = fs.readdirSync(simPath, { withFileTypes: true }).filter(dirent => dirent.isDirectory()).map(dirent => dirent.name);
    subFolders.forEach(sub => {
      const index = path.join(simPath, sub, "index.html");
      if (fs.existsSync(index)) {
        simsToAdd.push({file: index, path: path.join(simSlug, sub)})
      }
    });

    simsToAdd.forEach(fileAndPath => {
      const sim = {
        title: '',
        description: '',
        date: '2022',
        slug: simSlug,
        url: path.join('/simulations', fileAndPath.path),
        project_url: '',
        tags: '',
        software: ''
      };
      if (projectMap[simSlug]) {
        sim.tags = projectMap[simSlug].tags;
        sim.project_url = projectMap[simSlug].url;
      }
      const htmlString = fs.readFileSync(fileAndPath.file, 'utf-8');

      const dom = new JSDOM(htmlString);
      const document = dom.window.document;

      const title = document.querySelector('title');
      if (title) sim.title = title.textContent;
      const descriptionMeta = document.querySelector('meta[name="description"]');
      if (descriptionMeta) sim.description = descriptionMeta.getAttribute('content');
      const dateMeta = document.querySelector('meta[name="date"]');
      if (dateMeta) sim.date = dateMeta.getAttribute('content');

      sims.push(sim);
    });

  });


  sims.sort((a, b) => new Date(b.date) - new Date(a.date));
  const op = path.join(SIMULATION_DIST, "simulations.json");
  fs.writeFileSync(op, JSON.stringify(sims, null, 2), "utf-8");
}


buildProjects();