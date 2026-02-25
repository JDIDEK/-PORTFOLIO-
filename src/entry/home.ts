import type { SharedExperience } from './shared';
import { initInteractiveTerminal } from '../features/terminal';

export function initPage(shared: SharedExperience): () => void {
  return initInteractiveTerminal({
    canPlayCrashTypingSound: () => shared.audio.isSoundEnabled() && shared.audio.isAudioUnlocked()
  });
}
