import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://www.feedlight.app',
  integrations: [tailwind()],
  output: 'static',
});
