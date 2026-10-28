// @ts-check
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// https://astro.build/config
export default defineConfig({
	site: 'https://gregmcdonnell.github.io',
	markdown: {
		// $...$ and $$...$$ in Markdown are rendered to HTML with KaTeX at build time.
		processor: unified({
			remarkPlugins: [remarkMath],
			rehypePlugins: [rehypeKatex],
		}),
		shikiConfig: {
			themes: {
				light: 'github-light',
				dark: 'github-dark',
			},
		},
	},
	// Astro compresses html by default, can remove this later
	// Non-compressed is only used to inspect build files
	compressHTML: false,
});
