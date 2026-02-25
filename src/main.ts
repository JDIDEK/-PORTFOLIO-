type PageId = 'home' | 'about' | 'works';

type EntryLoader = () => Promise<unknown>;

const entryLoaders: Record<PageId, EntryLoader> = {
  home: () => import('./entry/home'),
  about: () => import('./entry/about'),
  works: () => import('./entry/works')
};

const rawPageId = document.documentElement.dataset.pageId;
const pageId: PageId = rawPageId === 'about' || rawPageId === 'works' ? rawPageId : 'home';

void entryLoaders[pageId]();
