const hoverSoundSrc = '/assets/sounds/hover.mp3';
const rainSoundSrc = '/assets/sounds/rain.mp3';
const glitchSoundSources = ['/assets/sounds/glitch.mp3', hoverSoundSrc] as const;
const SOUND_PREF_KEY = 'portfolio:sound-enabled';

export interface AudioUiOptions {
  setLabelText: (label: HTMLElement, text: string) => void;
}

export interface AudioUiController {
  playTransitionGlitchSound: () => void;
  isSoundEnabled: () => boolean;
  isAudioUnlocked: () => boolean;
}

function getStoredSoundPreference(): boolean {
  try {
    return window.localStorage.getItem(SOUND_PREF_KEY) === '1';
  } catch {
    return false;
  }
}

function persistSoundPreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(SOUND_PREF_KEY, enabled ? '1' : '0');
  } catch {}
}

function playOneShotSound(sources: readonly string[], volume: number, playbackRate = 1): void {
  if (!sources.length) return;

  const playFromIndex = (sourceIndex: number): void => {
    if (sourceIndex >= sources.length) return;

    const source = sources[sourceIndex];
    const audio = new Audio(source);
    audio.volume = volume;
    audio.playbackRate = playbackRate;
    audio.preload = 'auto';

    audio.addEventListener(
      'error',
      () => {
        playFromIndex(sourceIndex + 1);
      },
      { once: true }
    );

    audio.play().catch(() => {
      playFromIndex(sourceIndex + 1);
    });
  };

  playFromIndex(0);
}

export function initAudioUi(options: AudioUiOptions): AudioUiController {
  const { setLabelText } = options;

  let isSoundOn = getStoredSoundPreference();
  let isAudioUnlocked = false;
  let rainLoopAudio: HTMLAudioElement | null = null;

  const ensureRainLoopAudio = (): HTMLAudioElement => {
    if (rainLoopAudio) return rainLoopAudio;

    rainLoopAudio = new Audio(rainSoundSrc);
    rainLoopAudio.loop = true;
    rainLoopAudio.volume = 0.22;
    rainLoopAudio.preload = 'auto';

    return rainLoopAudio;
  };

  const startRainLoop = (): void => {
    if (!isSoundOn || !isAudioUnlocked) return;
    const rainAudio = ensureRainLoopAudio();
    rainAudio.play().catch(() => {});
  };

  const stopRainLoop = (): void => {
    if (!rainLoopAudio) return;
    rainLoopAudio.pause();
    rainLoopAudio.currentTime = 0;
  };

  const playTransitionGlitchSound = (): void => {
    if (!isSoundOn || !isAudioUnlocked) return;
    playOneShotSound(glitchSoundSources, 0.5, 1.2);
  };

  const unlockAudio = (): void => {
    if (isAudioUnlocked) return;
    const unlockProbe = new Audio(hoverSoundSrc);
    unlockProbe.volume = 0;
    unlockProbe
      .play()
      .then(() => {
        unlockProbe.pause();
        unlockProbe.currentTime = 0;
        isAudioUnlocked = true;
        if (isSoundOn) startRainLoop();
        window.removeEventListener('pointerdown', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
      })
      .catch(() => {});
  };

  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  const playHoverSound = (): void => {
    if (!isSoundOn || !isAudioUnlocked) return;
    playOneShotSound([hoverSoundSrc], 0.5);
  };

  const hoverTargets = document.querySelectorAll<HTMLElement>('.js-audio-hover');
  hoverTargets.forEach((target) => {
    target.addEventListener('mouseenter', playHoverSound);
  });

  const soundToggleBtn = document.querySelector<HTMLElement>('#sound-toggle-btn');
  if (soundToggleBtn) {
    setLabelText(soundToggleBtn, isSoundOn ? 'Sound: On' : 'Sound: Off');

    soundToggleBtn.addEventListener('click', () => {
      unlockAudio();
      isSoundOn = !isSoundOn;
      persistSoundPreference(isSoundOn);
      setLabelText(soundToggleBtn, isSoundOn ? 'Sound: On' : 'Sound: Off');
      if (isSoundOn) {
        startRainLoop();
      } else {
        stopRainLoop();
      }
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopRainLoop();
    } else if (isSoundOn) {
      startRainLoop();
    }
  });

  window.addEventListener('pagehide', stopRainLoop);

  return {
    playTransitionGlitchSound,
    isSoundEnabled: () => isSoundOn,
    isAudioUnlocked: () => isAudioUnlocked
  };
}
