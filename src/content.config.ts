import { defineCollection, reference } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';

const projects = defineCollection({
	// Every .md file in src/content/projects becomes one entry; its id is the file name.
	loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
	schema: z.object({
		title: z.string(),
		// "2025-06" in frontmatter is parsed into a real Date.
		date: z.coerce.date(),
		description: z.string().default(''),
		tags: z.array(z.string()).default([]),
		// Path under /public, used for thumbnails.
		image: z.string().optional(),
		// Slug of a folder in public/simulations/, adds the "Open Interactive Simulation" button.
		simulation: z.string().optional(),
		draft: z.boolean().default(false),
		// Shown in the "Featured" list on the home page.
		featured: z.boolean().default(false),
	}),
});

const simulations = defineCollection({
	// One JSON file per simulation. The sim itself lives in public/simulations/<path>/.
	loader: glob({ pattern: '**/*.json', base: './src/content/simulations' }),
	schema: z.object({
		title: z.string(),
		date: z.coerce.date(),
		description: z.string().default(''),
		tags: z.array(z.string()).default([]),
		// Folder under public/simulations/ (defaults to the entry id; differs for sub-sims).
		path: z.string().optional(),
		// The write-up for this sim. Validated at build time: must be an existing project id.
		project: reference('projects').optional(),
		// Draft sims stay reachable by URL but are left out of listings.
		draft: z.boolean().default(false),
		// Shown in the "Featured" list on the home page.
		featured: z.boolean().default(false),
	}),
});

const gallery = defineCollection({
	// A single JSON array; each object's `id` becomes the entry id.
	loader: file('./src/content/gallery.json'),
	schema: z.object({
		// Path under /public.
		src: z.string(),
		caption: z.string().default(''),
		// What the image belongs to. Its title, link and tags are used by the gallery.
		project: reference('projects').optional(),
		simulation: reference('simulations').optional(),
		// Extra tags, on top of the ones inherited from the project/simulation.
		tags: z.array(z.string()).default([]),
	}),
});

export const collections = { projects, simulations, gallery };
