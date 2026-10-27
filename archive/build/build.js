// const fs = require('fs');
// const path = require('path');

// const DIST_ROOT = path.join('.', 'dist');
// // const ARTICLES_DIR = path.join(ROOT, 'articles');
// const TEMPLATE_DIR = path.join('.', 'templates');
// const PAGES_DIR = path.join(TEMPLATE_DIR, 'pages');
// const LAYOUT_PATH = path.join(TEMPLATE_DIR, 'layout.html');

// function build() {
//     const template = fs.readFileSync(LAYOUT_PATH, 'utf-8');
//     // const folders = fs.readdirSync(ARTICLES_DIR);

//     const templateOutputMap = [
//         ['home.html', 'index.html'],
//         ['gallery.html', 'gallery/index.html']
//     ];
//     templateOutputMap.forEach(m => {
//         const contentPath = path.join(PAGES_DIR, m[0]);
//         const outputPath = path.join(DIST_ROOT, m[1]);

//         const templateContent = fs.readFileSync(contentPath, 'utf-8');

//         // Extract the <style> content (everything between <style> and </style>)
//         const styleRegex = /<style>([\s\S]*?)<\/style>/;
//         const styleMatch = templateContent.match(styleRegex);
//         const styleContent = styleMatch ? styleMatch[0] : ''; // Extracted CSS or empty string if not found

//         // Extract the main HTML content (everything else, excluding <style> blocks)
//         const contentWithoutStyle = templateContent.replace(styleRegex, '').trim();


//         let html = template.replace('{{title}}', 'Greg McDonnell — Engineering & Simulation')
//         .replace('{{head}}', '')
//         .replace('{{content}}', contentWithoutStyle)
//         .replace('{{style}}', styleContent);
//         fs.writeFileSync(outputPath, html);
//     });

//     // const articles = [];

//     // folders.forEach(folder => {
//     //     const articlePath = path.join(ARTICLES_DIR, folder);
//     //     const metadataPath = path.join(articlePath, 'metadata.json');
//     //     const contentPath = path.join(articlePath, 'content.html');
//     //     const outputPath = path.join(articlePath, 'index.html');

//     //     if (!fs.existsSync(metadataPath) || !fs.existsSync(contentPath)) {
//     //         return;
//     //     }

//     //     const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
//     //     const content = fs.readFileSync(contentPath, 'utf-8');

//     //     // Inject into template
//     //     let html = template
//     //         .replace('{{title}}', metadata.title)
//     //         .replace('{{date}}', metadata.date)
//     //         .replace('{{content}}', content);

//     //     fs.writeFileSync(outputPath, html);

//     //     articles.push({
//     //         ...metadata,
//     //         slug: folder
//     //     });
//     // });

//     // // Sort newest first
//     // articles.sort((a, b) => new Date(b.date) - new Date(a.date));

//     // // Write articles.json
//     // fs.writeFileSync(
//     //     path.join(ARTICLES_DIR, 'articles.json'),
//     //     JSON.stringify(articles, null, 2)
//     // );

//     // console.log('✅ Build complete');
// }

// build();