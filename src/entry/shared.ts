import '../styles/transition.css';
import { initAudioUi, type AudioUiController } from '../features/audio';
import { initLoadingScreen } from '../features/loading-screen';
import { initGlitchLabels, setGlitchLabelText } from '../features/ui-labels';
import { initWebglBackground } from '../features/webgl';

export interface SharedExperience {
  audio: AudioUiController;
}

export function initSharedExperience(): SharedExperience {
  const loading = initLoadingScreen();

  initGlitchLabels();

  const audio = initAudioUi({
    setLabelText: setGlitchLabelText
  });

  initWebglBackground({
    loading
  });

  return {
    audio
  };
}
