const PAGE_GLITCH_STORAGE_KEY = 'page-glitch-enter';
const PAGE_GLITCH_LEAVE_MS = 240;
const PAGE_GLITCH_ENTER_MS = 620;

let isPageTransitioning = false;

function ensurePageGlitchOverlay(): void {
  if (document.querySelector('.page-glitch-overlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'page-glitch-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  document.body.appendChild(overlay);
}

function clearPageTransitionState(): void {
  document.documentElement.removeAttribute('data-transitioning');
  document.body.classList.remove('is-page-transitioning', 'is-page-entering', 'is-distorting-page');
}

function runPageEnterGlitch(): void {
  if (sessionStorage.getItem(PAGE_GLITCH_STORAGE_KEY) !== '1') return;
  sessionStorage.removeItem(PAGE_GLITCH_STORAGE_KEY);

  ensurePageGlitchOverlay();
  document.documentElement.setAttribute('data-transitioning', '1');
  document.body.classList.add('is-page-entering', 'is-distorting-page');

  window.setTimeout(() => {
    document.body.classList.remove('is-page-entering', 'is-distorting-page');
    document.documentElement.removeAttribute('data-transitioning');
  }, PAGE_GLITCH_ENTER_MS);
}

function startPageGlitchNavigation(nextUrl: string, playTransitionSound: () => void): void {
  if (isPageTransitioning) return;
  isPageTransitioning = true;

  ensurePageGlitchOverlay();
  document.documentElement.setAttribute('data-transitioning', '1');
  document.body.classList.add('is-page-transitioning', 'is-distorting-page');
  playTransitionSound();

  window.setTimeout(() => {
    sessionStorage.setItem(PAGE_GLITCH_STORAGE_KEY, '1');
    window.location.assign(nextUrl);
  }, PAGE_GLITCH_LEAVE_MS);
}

function normalizeTransitionPathname(pathname: string): string {
  const normalized = pathname.endsWith('/') ? pathname : `${pathname}/`;
  return normalized.replace(/index\.html\/$/i, '/');
}

function shouldHandlePageGlitchNavigation(url: URL, anchor: HTMLAnchorElement): boolean {
  if (anchor.dataset.noTransition === '1' || anchor.classList.contains('ignore-transition')) {
    return false;
  }
  if (anchor.target && anchor.target !== '_self') {
    return false;
  }
  if (anchor.hasAttribute('download')) {
    return false;
  }
  if (url.origin !== window.location.origin) {
    return false;
  }

  const isSamePathAndQuery =
    normalizeTransitionPathname(url.pathname) === normalizeTransitionPathname(window.location.pathname) &&
    url.search === window.location.search;

  if (isSamePathAndQuery) {
    return false;
  }

  return true;
}

export function initPageGlitchTransitions(playTransitionSound: () => void): void {
  ensurePageGlitchOverlay();
  runPageEnterGlitch();

  window.addEventListener('pageshow', () => {
    if (!isPageTransitioning && !document.body.classList.contains('is-page-entering')) {
      clearPageTransitionState();
    }
  });

  document.addEventListener(
    'click',
    (event) => {
      if (!(event instanceof MouseEvent)) return;
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;

      const url = new URL(anchor.href, window.location.href);
      if (!shouldHandlePageGlitchNavigation(url, anchor)) return;

      event.preventDefault();
      startPageGlitchNavigation(url.href, playTransitionSound);
    },
    { capture: true }
  );
}
