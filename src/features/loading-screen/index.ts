const LOADING_MIN_VISIBLE_MS = 360;
const LOADING_FORCE_FINISH_MS = 4200;
const LOADING_TASKS = [
  'boot',
  'window',
  'texture-metal-normal',
  'texture-metal-roughness',
  'video-rain',
  'video-background'
] as const;

export type LoadingTaskName = (typeof LOADING_TASKS)[number];

export interface LoadingController {
  resolveTask: (taskName: LoadingTaskName) => void;
  watchVideoReady: (video: HTMLVideoElement, taskName: LoadingTaskName) => void;
}

export function initLoadingScreen(): LoadingController {
  const loadingRootEl = document.documentElement;
  const loadingEl = document.querySelector<HTMLElement>('#jsLoading');
  const loadingCountEl = document.querySelector<HTMLElement>('#jsLoadCount');
  const loadingMaxEl = document.querySelector<HTMLElement>('#jsLoadMax');
  const loadingProgressEl = document.querySelector<HTMLElement>('#jsLoadProgress');

  const loadingTasks = new Map<LoadingTaskName, boolean>(
    LOADING_TASKS.map((task) => [task, false] as const)
  );
  const loadingStartedAt = performance.now();
  let isLoadingFinalized = false;
  let isLoadingFinishingScheduled = false;

  const updateLoadingUi = (): void => {
    let resolved = 0;
    for (const value of loadingTasks.values()) {
      if (value) resolved++;
    }

    const total = loadingTasks.size;
    const ratio = total > 0 ? resolved / total : 1;

    if (loadingCountEl) loadingCountEl.textContent = String(resolved);
    if (loadingMaxEl) loadingMaxEl.textContent = String(total);
    if (loadingProgressEl) loadingProgressEl.style.transform = `scaleX(${ratio})`;
  };

  const areAllLoadingTasksResolved = (): boolean => {
    for (const isResolved of loadingTasks.values()) {
      if (!isResolved) return false;
    }
    return true;
  };

  const finishLoading = (force = false): void => {
    if (isLoadingFinalized || isLoadingFinishingScheduled) return;
    if (!force && !areAllLoadingTasksResolved()) return;

    if (force) {
      for (const taskName of loadingTasks.keys()) {
        loadingTasks.set(taskName, true);
      }
      updateLoadingUi();
    }

    const elapsed = performance.now() - loadingStartedAt;
    const waitTime = Math.max(0, LOADING_MIN_VISIBLE_MS - elapsed);
    isLoadingFinishingScheduled = true;

    window.setTimeout(() => {
      if (isLoadingFinalized) return;

      isLoadingFinalized = true;
      isLoadingFinishingScheduled = false;
      loadingEl?.setAttribute('data-complete', '1');
      loadingRootEl.dataset.loaded = '1';
      loadingRootEl.dataset.once = '1';

      window.setTimeout(() => {
        loadingEl?.setAttribute('aria-hidden', 'true');
      }, 420);
    }, waitTime);
  };

  const resolveTask = (taskName: LoadingTaskName): void => {
    if (isLoadingFinalized) return;
    if (!loadingTasks.has(taskName)) return;
    if (loadingTasks.get(taskName)) return;

    loadingTasks.set(taskName, true);
    updateLoadingUi();
    finishLoading();
  };

  const watchVideoReady = (video: HTMLVideoElement, taskName: LoadingTaskName): void => {
    let isResolved = false;
    const markReady = (): void => {
      if (isResolved) return;
      isResolved = true;
      resolveTask(taskName);
    };

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      markReady();
      return;
    }

    video.addEventListener('loadeddata', markReady, { once: true });
    video.addEventListener('canplay', markReady, { once: true });
    video.addEventListener('error', markReady, { once: true });
    window.setTimeout(markReady, 1400);
  };

  loadingRootEl.dataset.loaded = '0';
  updateLoadingUi();

  requestAnimationFrame(() => {
    resolveTask('boot');
  });

  if (document.readyState === 'complete') {
    resolveTask('window');
  } else {
    window.addEventListener(
      'load',
      () => {
        resolveTask('window');
      },
      { once: true }
    );
  }

  window.setTimeout(() => {
    finishLoading(true);
  }, LOADING_FORCE_FINISH_MS);

  return {
    resolveTask,
    watchVideoReady
  };
}
