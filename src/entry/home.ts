import { initSharedExperience } from './shared';
import { initInteractiveTerminal } from '../features/terminal';

const { audio } = initSharedExperience();

initInteractiveTerminal({
  canPlayCrashTypingSound: () => audio.isSoundEnabled() && audio.isAudioUnlocked()
});
