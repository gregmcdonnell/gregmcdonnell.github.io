import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
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
		// Load Prism (syntax highlighting) on this page.
		code: z.boolean().default(false),
	}),
});

export const collections = { projects };
