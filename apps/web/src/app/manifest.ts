import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'OpenCanvas',
    short_name: 'OpenCanvas',
    description: 'Open-source visual creation platform',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#6d5dfc',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
