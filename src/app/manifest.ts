import type { MetadataRoute } from 'next'
 
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Dungeons & Dicas',
    short_name: 'dndicas',
    description: 'Dungeons & Dicas: Um catálogo em português, para mestres e jogadores encontrarem rapidamente as informações que precisam',
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#2b7fff',
    icons: [
      {
        src: '/dndicas-192.webp',
        sizes: '192x192',
        type: 'image/webp',
      },
      {
        src: '/dndicas-512.webp',
        sizes: '512x512',
        type: 'image/webp',
      },
    ],
  }
}