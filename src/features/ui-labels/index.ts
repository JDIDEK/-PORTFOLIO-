export function setGlitchLabelText(label: HTMLElement, text: string): void {
  label.setAttribute('aria-label', text);
  label.textContent = '';

  for (const char of text) {
    const span = document.createElement('span');
    span.className = 't';
    span.textContent = char === ' ' ? '\u00A0' : char;
    label.appendChild(span);
  }
}

export function initGlitchLabels(): void {
  const glitchLabels = document.querySelectorAll<HTMLElement>('.label-fx');

  glitchLabels.forEach((label) => {
    const text = (label.textContent ?? '').trim();
    setGlitchLabelText(label, text);
  });
}
