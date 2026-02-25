import barba from '@barba/core';
import { initSharedExperience, type SharedExperience } from './entry/shared';
import {
  ensurePageGlitchOverlay,
  resetPageGlitchTransitionState,
  runPageEnterGlitch,
  runPageLeaveGlitch
} from './features/page-transition';
import './styles/pages/about.css';
import './styles/pages/home.css';

type PageId = 'home' | 'about' | 'works';
type PageCleanup = () => void;

interface PageEntryModule {
  initPage: (shared: SharedExperience) => void | PageCleanup;
}

type EntryLoader = () => Promise<PageEntryModule>;

const entryLoaders: Record<PageId, EntryLoader> = {
  home: () => import('./entry/home'),
  about: () => import('./entry/about'),
  works: () => import('./entry/works')
};

const pagePathnames: Record<PageId, string> = {
  home: '/',
  about: '/about/',
  works: '/works/'
};

const transientBodyClasses = ['is-page-transitioning', 'is-page-entering', 'is-distorting-page'] as const;

function toPageId(rawPageId: string | null | undefined): PageId {
  return rawPageId === 'about' || rawPageId === 'works' ? rawPageId : 'home';
}

function normalizePathname(pathname: string): string {
  const withTrailingSlash = pathname.endsWith('/') ? pathname : `${pathname}/`;
  return withTrailingSlash.replace(/index\.html\/$/i, '/');
}

function syncPersistentUi(pageId: PageId): void {
  document.documentElement.dataset.pageId = pageId;

  const activePathname = pagePathnames[pageId];
  const navLinks = document.querySelectorAll<HTMLAnchorElement>('.side-nav a[href]');
  navLinks.forEach((link) => {
    const linkPathname = normalizePathname(new URL(link.href, window.location.href).pathname);
    const isActive = linkPathname === activePathname;

    link.classList.toggle('active', isActive);
    if (isActive) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });

  const homeOnlyElements = document.querySelectorAll<HTMLElement>('.js-home-only');
  homeOnlyElements.forEach((element) => {
    element.hidden = pageId !== 'home';
  });
}

function syncBodyClass(nextHtml?: string): void {
  if (!nextHtml) return;

  const nextDocument = new DOMParser().parseFromString(nextHtml, 'text/html');
  const nextBodyClassName = nextDocument.body.className.trim();
  const classesToPreserve = transientBodyClasses.filter((className) =>
    document.body.classList.contains(className)
  );

  document.body.className = nextBodyClassName;
  document.body.setAttribute('data-barba', 'wrapper');

  classesToPreserve.forEach((className) => {
    document.body.classList.add(className);
  });
}

const shared = initSharedExperience();
let currentPageCleanup: PageCleanup | null = null;

const unmountCurrentPage = (): void => {
  if (!currentPageCleanup) return;
  currentPageCleanup();
  currentPageCleanup = null;
};

const mountPage = async (pageId: PageId): Promise<void> => {
  unmountCurrentPage();

  const pageModule = await entryLoaders[pageId]();
  const cleanup = pageModule.initPage(shared);
  currentPageCleanup = typeof cleanup === 'function' ? cleanup : null;
};

ensurePageGlitchOverlay();
window.addEventListener('pageshow', () => {
  resetPageGlitchTransitionState();
});

barba.init({
  preventRunning: true,
  prevent: ({ el }: { el: HTMLElement }) =>
    el.dataset.noTransition === '1' || el.classList.contains('ignore-transition'),
  transitions: [
    {
      once: async (data: any) => {
        const pageId = toPageId(data?.next?.namespace ?? document.documentElement.dataset.pageId);
        syncBodyClass(data?.next?.html);
        syncPersistentUi(pageId);
        await mountPage(pageId);
        resetPageGlitchTransitionState();
      },
      leave: async () => {
        unmountCurrentPage();
        await runPageLeaveGlitch(shared.audio.playTransitionGlitchSound);
      },
      beforeEnter: (data: any) => {
        const nextPageId = toPageId(data?.next?.namespace);
        syncBodyClass(data?.next?.html);
        syncPersistentUi(nextPageId);
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      },
      enter: async (data: any) => {
        const nextPageId = toPageId(data?.next?.namespace);
        await mountPage(nextPageId);
        await runPageEnterGlitch();
      },
      after: () => {
        resetPageGlitchTransitionState();
      }
    }
  ]
});
