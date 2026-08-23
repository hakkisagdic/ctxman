import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Ctxman',
  description: 'AI Development Platform with plugin architecture, Git integration, REST API, and watch mode',

  // Base URL for GitHub Pages deployment
  base: '/ctxman/',

  // Clean URLs without .html extension
  cleanUrls: true,

  // Last updated timestamp
  lastUpdated: true,

  // Head tags for SEO and meta
  head: [
    ['meta', { name: 'theme-color', content: '#646cff' }],
    ['meta', { name: 'og:type', content: 'website' }],
    ['meta', { name: 'og:title', content: 'Ctxman - AI Development Platform' }],
    ['meta', { name: 'og:description', content: 'AI Development Platform with plugin architecture, Git integration, REST API, and watch mode. Supporting 14+ programming languages.' }],
    ['meta', { name: 'og:image', content: '/ctxman/og-image.png' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'Ctxman - AI Development Platform' }],
    ['meta', { name: 'twitter:description', content: 'AI Development Platform with plugin architecture, Git integration, REST API, and watch mode.' }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/ctxman/logo.svg' }],
    ['script', { async: '', src: 'https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX' }],
    [
      'script',
      {},
      `window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-XXXXXXXXXX');`
    ]
  ],

  // Internationalization configuration
  locales: {
    root: {
      label: 'English',
      lang: 'en',
      title: 'Ctxman',
      description: 'AI Development Platform with plugin architecture, Git integration, REST API, and watch mode',
      themeConfig: {
        nav: [
          { text: 'Home', link: '/' },
          { text: 'Features', link: '/features' },
          { text: 'Getting Started', link: '/getting-started' },
          { text: 'API Reference', link: '/api-reference' },
          { text: 'Demo', link: '/demo' },
          { text: 'Changelog', link: '/changelog' }
        ],
        sidebar: {
          '/': [
            {
              text: 'Introduction',
              items: [
                { text: 'What is Ctxman?', link: '/' },
                { text: 'Quick Start', link: '/getting-started' },
                { text: 'Features', link: '/features' }
              ]
            },
            {
              text: 'Documentation',
              items: [
                { text: 'Installation', link: '/getting-started#installation' },
                { text: 'CLI Reference', link: '/api-reference#cli-reference' },
                { text: 'REST API', link: '/api-reference#rest-api' },
                { text: 'Configuration', link: '/getting-started#configuration' }
              ]
            },
            {
              text: 'Advanced',
              items: [
                { text: 'Plugin Architecture', link: '/features#plugin-architecture' },
                { text: 'Git Integration', link: '/features#git-integration' },
                { text: 'Watch Mode', link: '/features#watch-mode' }
              ]
            },
            {
              text: 'Resources',
              items: [
                { text: 'Interactive Demo', link: '/demo' },
                { text: 'Changelog', link: '/changelog' },
                { text: 'Contributing', link: 'https://github.com/hakkisagdic/ctxman/blob/main/CONTRIBUTING.md' }
              ]
            }
          ]
        },
        editLink: {
          pattern: 'https://github.com/hakkisagdic/ctxman/edit/main/website/:path',
          text: 'Edit this page on GitHub'
        },
        footer: {
          message: 'Released under the MIT License.',
          copyright: 'Copyright © 2024-present Hakkı Sağdıç'
        },
        docFooter: {
          prev: 'Previous',
          next: 'Next'
        },
        outline: {
          label: 'On this page'
        },
        lastUpdated: {
          text: 'Last updated',
          formatOptions: {
            dateStyle: 'medium',
            timeStyle: 'short'
          }
        }
      }
    },
    tr: {
      label: 'Türkçe',
      lang: 'tr',
      title: 'Ctxman',
      description: 'Plugin mimarisi, Git entegrasyonu, REST API ve izleme modu ile AI Geliştirme Platformu',
      themeConfig: {
        nav: [
          { text: 'Ana Sayfa', link: '/tr/' },
          { text: 'Özellikler', link: '/tr/features' },
          { text: 'Başlangıç', link: '/tr/getting-started' },
          { text: 'API Referansı', link: '/tr/api-reference' },
          { text: 'Demo', link: '/tr/demo' },
          { text: 'Değişiklikler', link: '/tr/changelog' }
        ],
        sidebar: {
          '/tr/': [
            {
              text: 'Giriş',
              items: [
                { text: 'Ctxman Nedir?', link: '/tr/' },
                { text: 'Hızlı Başlangıç', link: '/tr/getting-started' },
                { text: 'Özellikler', link: '/tr/features' }
              ]
            },
            {
              text: 'Dokümantasyon',
              items: [
                { text: 'Kurulum', link: '/tr/getting-started#kurulum' },
                { text: 'CLI Referansı', link: '/tr/api-reference#cli-referansi' },
                { text: 'REST API', link: '/tr/api-reference#rest-api' },
                { text: 'Yapılandırma', link: '/tr/getting-started#yapilandirma' }
              ]
            },
            {
              text: 'Gelişmiş',
              items: [
                { text: 'Plugin Mimarisi', link: '/tr/features#plugin-mimarisi' },
                { text: 'Git Entegrasyonu', link: '/tr/features#git-entegrasyonu' },
                { text: 'İzleme Modu', link: '/tr/features#izleme-modu' }
              ]
            },
            {
              text: 'Kaynaklar',
              items: [
                { text: 'İnteraktif Demo', link: '/tr/demo' },
                { text: 'Değişiklik Günlüğü', link: '/tr/changelog' },
                { text: 'Katkı Rehberi', link: 'https://github.com/hakkisagdic/ctxman/blob/main/CONTRIBUTING-tr.md' }
              ]
            }
          ]
        },
        editLink: {
          pattern: 'https://github.com/hakkisagdic/ctxman/edit/main/website/:path',
          text: 'Bu sayfayı GitHub\'da düzenle'
        },
        footer: {
          message: 'MIT Lisansı altında yayınlanmıştır.',
          copyright: 'Telif Hakkı © 2024-present Hakkı Sağdıç'
        },
        docFooter: {
          prev: 'Önceki',
          next: 'Sonraki'
        },
        outline: {
          label: 'Bu sayfada'
        },
        lastUpdated: {
          text: 'Son güncelleme',
          formatOptions: {
            dateStyle: 'medium',
            timeStyle: 'short'
          }
        }
      }
    }
  },

  // Shared theme configuration
  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'Ctxman',

    // Social links
    socialLinks: [
      { icon: 'github', link: 'https://github.com/hakkisagdic/ctxman' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/ctxman' }
    ],

    // Search
    search: {
      provider: 'local',
      options: {
        translations: {
          button: {
            buttonText: 'Search...',
            buttonAriaLabel: 'Search'
          },
          modal: {
            noResultsText: 'No results for',
            resetButtonTitle: 'Clear search query',
            footer: {
              selectText: 'to select',
              navigateText: 'to navigate'
            }
          }
        }
      }
    },

    // Navigation
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Features', link: '/features' },
      { text: 'Getting Started', link: '/getting-started' },
      { text: 'API Reference', link: '/api-reference' },
      { text: 'Demo', link: '/demo' },
      { text: 'Changelog', link: '/changelog' }
    ],

    // Sidebar
    sidebar: {
      '/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is Ctxman?', link: '/' },
            { text: 'Quick Start', link: '/getting-started' },
            { text: 'Features', link: '/features' }
          ]
        }
      ]
    },

    // Carbon Ads (optional - can be enabled later)
    // carbonAds: {
    //   code: 'your-carbon-code',
    //   placement: 'your-carbon-placement'
    // }
  },

  // Markdown configuration
  markdown: {
    theme: {
      light: 'github-light',
      dark: 'github-dark'
    },
    lineNumbers: false
  },

  // Build options
  build: {
    chunkSizeWarningLimit: 1000
  }
});
