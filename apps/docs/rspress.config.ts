import { defineConfig } from '@rspress/core';
import path from 'path';
import mermaidPlugin from 'rspress-plugin-mermaid';

export default defineConfig({
  root: 'src',
  llms: true,
  title: 'Rabbithole Docs',
  description: 'Decentralized encrypted file storage on the Internet Computer',
  logo: '/logo.svg',
  logoText: 'Rabbithole',
  icon: '/favicon.ico',
  globalStyles: path.resolve(__dirname, 'src/styles/custom.css'),
  lang: 'en',
  markdown: {
    defaultWrapCode: true,
  },
  locales: [
    {
      lang: 'en',
      label: 'English',
      title: 'Rabbithole Docs',
      description: 'Decentralized encrypted file storage on the Internet Computer',
    },
    {
      lang: 'ru',
      label: 'Русский',
      title: 'Документация Rabbithole',
      description: 'Децентрализованное зашифрованное файловое хранилище на Internet Computer',
    },
  ],
  themeConfig: {
    editLink: {
      docRepoBaseUrl:
        'https://github.com/rabbithole-app/v2/tree/main/apps/docs/src',
    },
    lastUpdated: true,
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com/rabbithole-app/v2',
      },
      {
        icon: 'x',
        mode: 'link',
        content: 'https://x.com/rabbithole_ic',
      },
    ],
    locales: [
      {
        label: 'English',
        lang: 'en',
        outlineTitle: 'On This Page',
        prevPageText: 'Previous',
        nextPageText: 'Next',
        searchPlaceholderText: 'Search docs...',
      },
      {
        label: 'Русский',
        lang: 'ru',
        outlineTitle: 'На этой странице',
        prevPageText: 'Назад',
        nextPageText: 'Далее',
        searchPlaceholderText: 'Поиск...',
      },
    ],
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugins: [mermaidPlugin() as any],
});
