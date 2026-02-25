export const PAGE_GLITCH_LEAVE_MS = 240;
export const PAGE_GLITCH_ENTER_MS = 620;

let isPageTransitioning = false;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function ensurePageGlitchOverlay(): void {
  if (document.querySelector('.page-glitch-overlay')) return;

  const overlay = document.createElement('div');
  overlay.className = 'page-glitch-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  document.body.appendChild(overlay);
}

export function resetPageGlitchTransitionState(): void {
  isPageTransitioning = false;
  document.documentElement.removeAttribute('data-transitioning');
  document.body.classList.remove('is-page-transitioning', 'is-page-entering', 'is-distorting-page');
}

export async function runPageLeaveGlitch(playTransitionSound: () => void): Promise<void> {
  if (isPageTransitioning) return;
  isPageTransitioning = true;

  ensurePageGlitchOverlay();
  document.documentElement.setAttribute('data-transitioning', '1');
  document.body.classList.remove('is-page-entering');
  document.body.classList.add('is-page-transitioning', 'is-distorting-page');

  playTransitionSound();
  await wait(PAGE_GLITCH_LEAVE_MS);
}

export async function runPageEnterGlitch(): Promise<void> {
  ensurePageGlitchOverlay();
  document.documentElement.setAttribute('data-transitioning', '1');
  document.body.classList.remove('is-page-transitioning');
  document.body.classList.add('is-page-entering', 'is-distorting-page');

  await wait(PAGE_GLITCH_ENTER_MS);
  resetPageGlitchTransitionState();
}
