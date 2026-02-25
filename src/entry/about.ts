import { initAboutSections } from '../features/about-sections';
import type { SharedExperience } from './shared';

export function initPage(_shared: SharedExperience): () => void {
  return initAboutSections();
}
