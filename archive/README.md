# Engineering Portfolio Site

## Adding content

### New project
Add an html file to src/projects that will be injected into the layout.html template file in the build-projects.js script.
The html file must have a metadata json script element (see examples).
A folder with the same slug as the html source file will be created in the dist (now docs) projects folder and an index file will be generated in that project folder.
Archived files are not built, but if their corresponding project has already been added to the dist, it will remain there.

### Feature a project on the homepage
Add its `slug` to `data/featured.json`.

### New gallery image
Add an entry to `data/gallery.json` with an `id`, `src` path, `caption`,
`project_id`, and `tags`.

### New simulation
Add an entry to `data/simulations.json` with a `project_id` linking it back.

### New note
Add an entry to `data/notes.json` and create the corresponding HTML file.
