export type CleanupFn = () => void;

export function initAboutSections(): CleanupFn {
  const tocLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('.about-toc__item'));
  const sectionElements = Array.from(document.querySelectorAll<HTMLElement>('[data-section]'));
  const scrollbarRange = document.querySelector<HTMLInputElement>('#fixed-scrollbar-range');

  if (!tocLinks.length || !sectionElements.length) {
    return () => {};
  }

  const sectionById = new Map<string, HTMLElement>();
  for (const section of sectionElements) {
    const sectionId = section.dataset.section;
    if (sectionId) sectionById.set(sectionId, section);
  }

  const setActiveToc = (sectionId: string): void => {
    for (const link of tocLinks) {
      const isActive = link.dataset.target === sectionId;
      link.classList.toggle('is-active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'true');
      } else {
        link.removeAttribute('aria-current');
      }
    }
  };

  const tocClickHandlers = new Map<HTMLAnchorElement, (event: Event) => void>();
  for (const link of tocLinks) {
    const onClick = (event: Event): void => {
      event.preventDefault();
      const targetId = link.dataset.target;
      if (!targetId) return;
      const section = sectionById.get(targetId);
      if (!section) return;

      section.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start'
      });
      setActiveToc(targetId);
    };

    tocClickHandlers.set(link, onClick);
    link.addEventListener('click', onClick);
  }

  const observer = new IntersectionObserver(
    (entries) => {
      let candidate: string | null = null;
      let maxRatio = 0;

      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        if (entry.intersectionRatio >= maxRatio) {
          maxRatio = entry.intersectionRatio;
          candidate = (entry.target as HTMLElement).dataset.section ?? null;
        }
      }

      if (candidate) setActiveToc(candidate);
    },
    {
      root: null,
      threshold: [0.25, 0.4, 0.6, 0.8],
      rootMargin: '-20% 0px -45% 0px'
    }
  );

  for (const section of sectionElements) {
    observer.observe(section);
  }

  setActiveToc(tocLinks[0].dataset.target ?? '');

  let removeScrollBindings = (): void => {};
  if (scrollbarRange) {
    const setScrollbarValueFromScroll = (): void => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (maxScroll <= 0) {
        scrollbarRange.value = '0';
        scrollbarRange.disabled = true;
        return;
      }
      scrollbarRange.disabled = false;
      const ratio = window.scrollY / maxScroll;
      scrollbarRange.value = String(Math.round(ratio * 1000));
    };

    const scrollToRangePosition = (): void => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (maxScroll <= 0) return;
      const ratio = Number(scrollbarRange.value) / 1000;
      window.scrollTo({
        top: ratio * maxScroll,
        behavior: 'auto'
      });
    };

    scrollbarRange.addEventListener('input', scrollToRangePosition);
    scrollbarRange.addEventListener('change', scrollToRangePosition);
    window.addEventListener('scroll', setScrollbarValueFromScroll, { passive: true });
    window.addEventListener('resize', setScrollbarValueFromScroll);
    setScrollbarValueFromScroll();

    removeScrollBindings = (): void => {
      scrollbarRange.removeEventListener('input', scrollToRangePosition);
      scrollbarRange.removeEventListener('change', scrollToRangePosition);
      window.removeEventListener('scroll', setScrollbarValueFromScroll);
      window.removeEventListener('resize', setScrollbarValueFromScroll);
    };
  }

  return (): void => {
    observer.disconnect();

    for (const [link, handler] of tocClickHandlers) {
      link.removeEventListener('click', handler);
    }

    removeScrollBindings();
  };
}
