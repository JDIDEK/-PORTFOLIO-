import * as THREE from 'three';
import barba from '@barba/core';
import './transition.css';
import aboutCssHref from './about.css?url';

// --------------------------------------------------------
// 1. SETUP THREE.JS (Mode Plein Écran)
// --------------------------------------------------------
const canvas = document.querySelector<HTMLCanvasElement>('#webgl-canvas')!;
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const isTouchDevice =
  window.matchMedia('(hover: none), (pointer: coarse)').matches ||
  'ontouchstart' in window;

const renderer = new THREE.WebGLRenderer({ 
  canvas: canvas,
  antialias: false,
  alpha: true,
  powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouchDevice ? 1.5 : 2));

function configureVideoPlayback(video: HTMLVideoElement, fallbackSources: string[] = []): void {
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', 'true');
  video.setAttribute('autoplay', '');

  const declaredSrc = video.getAttribute('src');
  const sources = [declaredSrc, ...fallbackSources].filter((src): src is string => Boolean(src));
  const tried = new Set<string>();
  let sourceIndex = 0;
  const tryPlay = (): void => {
    video.play().catch(() => {});
  };

  const loadAndPlay = (src: string): void => {
    if (video.getAttribute('src') !== src) {
      video.src = src;
      video.load();
    }
    tryPlay();
  };

  const tryNextSource = (): void => {
    while (sourceIndex < sources.length) {
      const next = sources[sourceIndex++];
      if (tried.has(next)) continue;
      tried.add(next);
      loadAndPlay(next);
      return;
    }
  };

  video.addEventListener('error', tryNextSource);
  video.addEventListener('stalled', () => {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      tryNextSource();
    }
  });
  video.addEventListener('canplay', tryPlay);

  tryNextSource();
}

// --------------------------------------------------------
// 2. CHARGEMENT DES TEXTURES ET VIDÉOS
// --------------------------------------------------------
const textureLoader = new THREE.TextureLoader();

const tMetalNormal = textureLoader.load('/assets/webgl/texture/tMetalNormal.webp');
const tMetalRoughness = textureLoader.load('/assets/webgl/texture/tMetalRoughness.webp');
tMetalNormal.wrapS = THREE.RepeatWrapping; tMetalNormal.wrapT = THREE.RepeatWrapping;
tMetalRoughness.wrapS = THREE.RepeatWrapping; tMetalRoughness.wrapT = THREE.RepeatWrapping;

const rainVideoEl = document.querySelector<HTMLVideoElement>('#rain-video')!;
configureVideoPlayback(rainVideoEl, ['/assets/webgl/texture/tNormal-Rain812d.mp4']);
const tNormalRain = new THREE.VideoTexture(rainVideoEl);
tNormalRain.wrapS = THREE.RepeatWrapping; tNormalRain.wrapT = THREE.RepeatWrapping;

const bgVideoEl1 = document.querySelector<HTMLVideoElement>('#bg-video-1')!;
configureVideoPlayback(bgVideoEl1, [
  '/assets/webgl/texture/tNormal-Rain812d.mp4',
  '/assets/webgl/texture/tNormal-Rain.mp4'
]);
const tVideo1 = new THREE.VideoTexture(bgVideoEl1);
tVideo1.wrapS = THREE.MirroredRepeatWrapping; tVideo1.wrapT = THREE.MirroredRepeatWrapping;

const resumeAllVideos = (): void => {
  rainVideoEl.play().catch(() => {});
  bgVideoEl1.play().catch(() => {});
};

window.addEventListener('pointerdown', resumeAllVideos, { passive: true });
window.addEventListener('touchstart', resumeAllVideos, { passive: true });
window.addEventListener('keydown', resumeAllVideos);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) resumeAllVideos();
});

// --------------------------------------------------------
// 3. LE MASQUE INTERACTIF (L'ESSUIE-GLACE)
// --------------------------------------------------------
const maskCanvas = document.createElement('canvas');
maskCanvas.width = window.innerWidth;
maskCanvas.height = window.innerHeight;
const maskCtx = maskCanvas.getContext('2d')!;

maskCtx.fillStyle = 'black';
maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
const tFluid = new THREE.CanvasTexture(maskCanvas);

const mouse = new THREE.Vector2(window.innerWidth * 0.5, window.innerHeight * 0.55);
const setPointer = (x: number, y: number): void => {
  mouse.x = x;
  mouse.y = y;
};

window.addEventListener('pointermove', (event) => {
  setPointer(event.clientX, event.clientY);
}, { passive: true });

window.addEventListener('touchstart', (event) => {
  const touch = event.touches[0];
  if (!touch) return;
  setPointer(touch.clientX, touch.clientY);
}, { passive: true });

window.addEventListener('touchmove', (event) => {
  const touch = event.touches[0];
  if (!touch) return;
  setPointer(touch.clientX, touch.clientY);
}, { passive: true });

// --------------------------------------------------------
// 4. LE SHADER MATERIAL
// --------------------------------------------------------
const uniforms = {
  uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  uVideoSize: { value: new THREE.Vector2(1920, 1080) }, 
  tVideo1: { value: tVideo1 },
  tNormalRain: { value: tNormalRain },
  tMetalNormal: { value: tMetalNormal },
  tMetalRoughness: { value: tMetalRoughness },
  tFluid: { value: tFluid },
  uEnableCamera: { value: 0.0 }, 
  uBloom: { value: 0.5 },
  uMobileCropByHeight: { value: 0.0 }
};

const updateMobileCropByHeight = (): void => {
  uniforms.uMobileCropByHeight.value =
    isTouchDevice && window.innerHeight >= window.innerWidth ? 1.0 : 0.0;
};
updateMobileCropByHeight();

const syncVideoSizeUniform = (): void => {
  const videoWidth = bgVideoEl1.videoWidth || 1920;
  const videoHeight = bgVideoEl1.videoHeight || 1080;
  uniforms.uVideoSize.value.set(videoWidth, videoHeight);
};
bgVideoEl1.addEventListener('loadedmetadata', syncVideoSizeUniform);
syncVideoSizeUniform();

const material = new THREE.ShaderMaterial({
  uniforms: uniforms,
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform vec2 uResolution;
    uniform vec2 uVideoSize;
    uniform sampler2D tVideo1;
    uniform sampler2D tNormalRain;
    uniform sampler2D tMetalNormal;
    uniform sampler2D tMetalRoughness;
    uniform sampler2D tFluid;
    uniform float uEnableCamera;
    uniform float uBloom;
    uniform float uMobileCropByHeight;
    varying vec2 vUv;

    vec2 optimizationTextureUv(vec2 _uv, float pa, float ta) {
        vec2 ratio = vec2(min(pa/ta, 1.0), (min((1.0/pa)/(1.0/ta), 1.0)));
        return vec2(((_uv.x-0.5)*ratio.x+0.5), ((_uv.y-0.5)*ratio.y+0.5));
    }

    vec2 optimizationTextureUvMobile(vec2 _uv, float pa, float ta) {
        float ratioX = min(pa/ta, 1.0);
        return vec2(((_uv.x-0.5)*ratioX+0.5), _uv.y);
    }

    void main(void) {
        vec4 c = vec4(1.0);
        float aspect = uResolution.x / uResolution.y;
        vec2 offsetNormalRainUv = vec2(0.1);
        vec2 normalRainUv = vUv;
        
        vec2 normalRainUvCover = optimizationTextureUv(normalRainUv, aspect, uVideoSize.x/uVideoSize.y);
        vec2 normalRainUvMobile = optimizationTextureUvMobile(normalRainUv, aspect, uVideoSize.x/uVideoSize.y);
        normalRainUv = mix(normalRainUvCover, normalRainUvMobile, uMobileCropByHeight);
        
        vec4 normalRain = texture2D(tNormalRain, normalRainUv);
        normalRain.r = texture2D(tNormalRain, normalRainUv).r;
        normalRain.g = texture2D(tNormalRain, normalRainUv).g;
        normalRain.b = texture2D(tNormalRain, normalRainUv+offsetNormalRainUv).b;
        
        float diffuse = clamp(dot(normalRain.rgb, vec3(1.0, 0.5, 0.75)), 0.0, 1.0);
        float nPower = 2.0;
        
        vec3 normalMetal = texture2D(tMetalNormal, vUv).rgb;
        normalMetal.r = pow(normalMetal.r*2.0, nPower);
        normalMetal.g = pow(normalMetal.g*2.0, nPower);
        normalMetal.b = pow(normalMetal.b*2.0, nPower);
        
        float rouPower = 2.0;
        vec2 roughnessUv = vUv;
        roughnessUv = mix(roughnessUv, roughnessUv*normalMetal.xy, 0.5);
        vec4 cRoughness = texture2D(tMetalRoughness, roughnessUv);
        cRoughness.r = pow(cRoughness.r*2.0, rouPower);
        cRoughness.g = pow(cRoughness.g*2.0, rouPower);
        cRoughness.b = pow(cRoughness.b*2.0, rouPower);
        
        float vignette = smoothstep(0.75, -0.5, distance(vUv, vec2(0.5)));
        
        vec4 fluid = texture2D(tFluid, vUv);
        float thresholdFluid = pow(fluid.x, 2.0);
        thresholdFluid = clamp(thresholdFluid, 0.0, 1.0);
        
        vec2 uv = vUv;
        uv.x = mix(uv.x, 1.0-uv.x, uEnableCamera);
        vec2 optimizedUvCover = optimizationTextureUv(uv, aspect, uVideoSize.x/uVideoSize.y);
        vec2 optimizedUvMobile = optimizationTextureUvMobile(uv, aspect, uVideoSize.x/uVideoSize.y);
        uv = mix(optimizedUvCover, optimizedUvMobile, uMobileCropByHeight);
        
        vec2 uv1 = uv;
        uv1 = uv1 * normalMetal.xy;
        uv1 = uv1 * normalRain.xy * 2.75;
        vec2 uv2 = uv;
        float thresholdUv = 0.8;
        
        vec4 cVideo = texture2D(tVideo1, uv1*(1.0-thresholdUv) + mix(uv1, uv2, thresholdFluid)*thresholdUv);
        
        c = cVideo;
        c.rgb = mix(c.rgb, cRoughness.rgb, 0.5);
        c.rgb = mix(c.rgb*vignette*0.5, c.rgb, vignette);
        c = mix(c, c*diffuse, 0.25);
        c.rgb = mix(c.rgb, mix(c.rgb*1.0, c.rgb*1.25, uBloom), thresholdFluid);
        c.rgb = mix(c.rgb, c.rgb*0.5, uBloom);
        
        gl_FragColor = c;
    }
  `
});

const geometry = new THREE.PlaneGeometry(2, 2);
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// --------------------------------------------------------
// 5. BOUCLE D'ANIMATION
// --------------------------------------------------------
let brushSize = isTouchDevice
  ? Math.max(90, Math.min(window.innerWidth, window.innerHeight) * 0.18)
  : 150;

function raf() {
  maskCtx.fillStyle = 'rgba(0, 0, 0, 0.03)'; 
  maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

  const gradient = maskCtx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, brushSize);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.5)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  
  maskCtx.beginPath();
  maskCtx.arc(mouse.x, mouse.y, brushSize, 0, Math.PI * 2);
  maskCtx.fillStyle = gradient;
  maskCtx.fill();

  tFluid.needsUpdate = true;
  renderer.render(scene, camera); 
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

// --------------------------------------------------------
// 6. HELPERS UI + AUDIO
// --------------------------------------------------------
function setGlitchLabelText(label: HTMLElement, text: string): void {
  label.setAttribute('aria-label', text);
  label.textContent = '';

  for (const char of text) {
    const span = document.createElement('span');
    span.className = 't';
    span.textContent = char === ' ' ? '\u00A0' : char;
    label.appendChild(span);
  }
}

const refreshGlitchLabels = (): void => {
  const glitchLabels = document.querySelectorAll<HTMLElement>('.label-fx');
  glitchLabels.forEach((label) => {
    const text = (label.textContent ?? '').trim();
    setGlitchLabelText(label, text);
  });
};

refreshGlitchLabels();

const hoverSoundSrc = '/assets/sounds/hover.mp3';
let isSoundOn = false;
let isAudioUnlocked = false;

const unlockAudio = (): void => {
  if (isAudioUnlocked) return;
  const unlockProbe = new Audio(hoverSoundSrc);
  unlockProbe.volume = 0;
  unlockProbe.play()
    .then(() => {
      unlockProbe.pause();
      unlockProbe.currentTime = 0;
      isAudioUnlocked = true;
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    })
    .catch(() => {});
};

window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

const playHoverSound = (): void => {
  if (!isSoundOn || !isAudioUnlocked) return;
  const hoverSound = new Audio(hoverSoundSrc);
  hoverSound.volume = 0.5;
  hoverSound.play().catch(() => {});
};

document.addEventListener('mouseover', (event) => {
  const target = event.target as HTMLElement | null;
  if (!target) return;
  const hoverEl = target.closest('.js-audio-hover');
  if (!hoverEl) return;

  const related = event.relatedTarget as Node | null;
  if (related && hoverEl.contains(related)) return;

  playHoverSound();
});

document.addEventListener('click', (event) => {
  const target = event.target as HTMLElement | null;
  if (!target) return;
  const soundToggleBtn = target.closest('#sound-toggle-btn') as HTMLElement | null;
  if (!soundToggleBtn) return;

  unlockAudio();
  isSoundOn = !isSoundOn;
  setGlitchLabelText(soundToggleBtn, isSoundOn ? 'Sound: On' : 'Sound: Off');
});

// --------------------------------------------------------
// 7. REDIMENSIONNEMENT
// --------------------------------------------------------
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouchDevice ? 1.5 : 2));
  uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
  updateMobileCropByHeight();
  maskCanvas.width = window.innerWidth;
  maskCanvas.height = window.innerHeight;
  brushSize = isTouchDevice
    ? Math.max(90, Math.min(window.innerWidth, window.innerHeight) * 0.18)
    : 150;

  if (mouse.x > window.innerWidth || mouse.y > window.innerHeight || mouse.x < 0 || mouse.y < 0) {
    setPointer(window.innerWidth * 0.5, window.innerHeight * 0.55);
  }
});

// --------------------------------------------------------
// 8. LOGIQUE PAGE HOME
// --------------------------------------------------------
type Cleanup = () => void;

const initHomeTerminal = (): Cleanup => {
  const terminalModal = document.getElementById('terminal-modal');
  const closeTermBtn = document.getElementById('close-terminal');
  const termInput = document.getElementById('terminal-input') as HTMLInputElement | null;
  const termHistory = document.getElementById('terminal-history');
  const termBody = document.getElementById('terminal-body');
  const termHeader = document.querySelector('.terminal-header') as HTMLElement | null;
  const termWindow = document.querySelector('.terminal-window') as HTMLElement | null;

  if (!terminalModal || !closeTermBtn || !termInput || !termHistory || !termBody || !termHeader || !termWindow) {
    return () => {};
  }

  const cmdHistory: string[] = [];
  let historyIndex = -1;
  const terminalIntervals: number[] = [];

  const closeModal = (): void => {
    terminalModal.classList.remove('active');
    terminalIntervals.forEach((intervalId) => clearInterval(intervalId));
    terminalIntervals.length = 0;
  };

  const onOpenClick = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('#open-terminal')) return;
    terminalModal.classList.add('active');
    window.setTimeout(() => termInput.focus(), 100);
  };

  const onCloseClick = (): void => {
    closeModal();
  };

  const onBodyClick = (): void => {
    termInput.focus();
  };

  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  const onMouseDownHeader = (event: MouseEvent): void => {
    if ((event.target as HTMLElement).id === 'close-terminal') return;
    isDragging = true;
    const rect = termWindow.getBoundingClientRect();
    dragOffsetX = event.clientX - rect.left;
    dragOffsetY = event.clientY - rect.top;
    termWindow.style.transform = 'none';
    termWindow.style.left = `${rect.left}px`;
    termWindow.style.top = `${rect.top}px`;
  };

  const onMouseMove = (event: MouseEvent): void => {
    if (!isDragging) return;
    termWindow.style.left = `${event.clientX - dragOffsetX}px`;
    termWindow.style.top = `${event.clientY - dragOffsetY}px`;
  };

  const onMouseUp = (): void => {
    isDragging = false;
  };

  const printLog = (html: string): void => {
    const p = document.createElement('div');
    p.innerHTML = html;
    termHistory.appendChild(p);
    termBody.scrollTop = termBody.scrollHeight;
  };

  const executeCommand = (cmdText: string): void => {
    printLog(`<div class="cmd-echo"><span class="term-user">root@josselin</span>:<span class="term-path">~</span># ${cmdText}</div>`);
    const args = cmdText.split(/\s+/).filter(Boolean);
    const cmd = args[0];
    const extraArgs = args.slice(1);

    switch (cmd) {
      case 'clear':
        termHistory.innerHTML = '';
        break;
      case 'whoami':
        printLog('root');
        break;
      case 'cd':
        if (extraArgs.length === 0) {
          printLog('');
          break;
        }
        {
          const target = extraArgs[0].replace(/\/$/, '');
          if (['about', 'works'].includes(target)) {
            printLog(`Navigating to <span class="t-blue">${target}</span>...`);
            window.setTimeout(() => {
              closeModal();
              barba.go(`/${target}.html`);
            }, 800);
          } else {
            printLog(`<span class="t-err">bash: cd: ${target}: No such file or directory</span>`);
          }
        }
        break;
      default:
        printLog(`<span class="t-err">bash: ${cmd}: command not found</span>`);
    }
  };

  const onInputKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Tab') {
      event.preventDefault();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (historyIndex > 0) {
        historyIndex--;
        termInput.value = cmdHistory[historyIndex];
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (historyIndex < cmdHistory.length - 1) {
        historyIndex++;
        termInput.value = cmdHistory[historyIndex];
      } else {
        historyIndex = cmdHistory.length;
        termInput.value = '';
      }
      return;
    }

    if (event.key !== 'Enter') return;

    const cmdText = termInput.value.trim();
    if (cmdText) {
      cmdHistory.push(cmdText);
      historyIndex = cmdHistory.length;
      executeCommand(cmdText);
    } else {
      printLog('<div class="cmd-echo"><span class="term-user">root@josselin</span>:<span class="term-path">~</span>#</div>');
    }
    termInput.value = '';
  };

  document.addEventListener('click', onOpenClick);
  closeTermBtn.addEventListener('click', onCloseClick);
  termBody.addEventListener('click', onBodyClick);
  termHeader.addEventListener('mousedown', onMouseDownHeader);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  termInput.addEventListener('keydown', onInputKeyDown);

  return () => {
    closeModal();
    document.removeEventListener('click', onOpenClick);
    closeTermBtn.removeEventListener('click', onCloseClick);
    termBody.removeEventListener('click', onBodyClick);
    termHeader.removeEventListener('mousedown', onMouseDownHeader);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    termInput.removeEventListener('keydown', onInputKeyDown);
  };
};

// --------------------------------------------------------
// 9. LOGIQUE PAGE ABOUT
// --------------------------------------------------------
const initAboutPage = (): Cleanup => {
  const tocLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('.about-toc__item'));
  const sectionElements = Array.from(document.querySelectorAll<HTMLElement>('[data-section]'));
  const scrollbarRange = document.querySelector<HTMLInputElement>('#fixed-scrollbar-range');

  if (tocLinks.length === 0 || sectionElements.length === 0) {
    return () => {};
  }

  const cleanups: Cleanup[] = [];
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

    link.addEventListener('click', onClick);
    cleanups.push(() => link.removeEventListener('click', onClick));
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
  cleanups.push(() => observer.disconnect());

  if (tocLinks.length > 0) {
    setActiveToc(tocLinks[0].dataset.target ?? '');
  }

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

    cleanups.push(() => {
      scrollbarRange.removeEventListener('input', scrollToRangePosition);
      scrollbarRange.removeEventListener('change', scrollToRangePosition);
      window.removeEventListener('scroll', setScrollbarValueFromScroll);
      window.removeEventListener('resize', setScrollbarValueFromScroll);
    });
  }

  return () => {
    for (const cleanup of cleanups) cleanup();
  };
};

// --------------------------------------------------------
// 10. ORCHESTRATION PAGES + TRANSITIONS
// --------------------------------------------------------
let currentPageCleanup: Cleanup | null = null;
const rootEl = document.documentElement;
const loadingContainer = document.getElementById('jsLoading');
const loadingCountEl = document.getElementById('jsLoadCount');
const loadingMaxEl = document.getElementById('jsLoadMax');
const loadingProgressEl = document.getElementById('jsLoadProgress') as HTMLElement | null;
let loadingCount = 0;
const loadingMax = Number(loadingMaxEl?.textContent ?? '1');
let aboutStyleLink = document.querySelector<HTMLLinkElement>('link[data-about-style="1"]');
let distortionTurbulence: SVGFETurbulenceElement | null = null;
let distortionDisplacement: SVGFEDisplacementMapElement | null = null;

const wait = (ms: number): Promise<void> => new Promise((resolve) => {
  window.setTimeout(resolve, ms);
});

const ensureDistortionFilter = (): void => {
  if (distortionTurbulence && distortionDisplacement) return;

  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.classList.add('page-distortion-defs');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const filter = document.createElementNS(NS, 'filter');
  filter.setAttribute('id', 'page-distort-filter');
  filter.setAttribute('x', '-20%');
  filter.setAttribute('y', '-20%');
  filter.setAttribute('width', '140%');
  filter.setAttribute('height', '140%');
  filter.setAttribute('color-interpolation-filters', 'sRGB');

  const turbulence = document.createElementNS(NS, 'feTurbulence');
  turbulence.setAttribute('type', 'fractalNoise');
  turbulence.setAttribute('baseFrequency', '0.008 0.03');
  turbulence.setAttribute('numOctaves', '1');
  turbulence.setAttribute('seed', '7');
  turbulence.setAttribute('result', 'noise');

  const displacement = document.createElementNS(NS, 'feDisplacementMap');
  displacement.setAttribute('in', 'SourceGraphic');
  displacement.setAttribute('in2', 'noise');
  displacement.setAttribute('scale', '0');
  displacement.setAttribute('xChannelSelector', 'R');
  displacement.setAttribute('yChannelSelector', 'G');

  filter.appendChild(turbulence);
  filter.appendChild(displacement);
  svg.appendChild(filter);
  document.body.appendChild(svg);

  distortionTurbulence = turbulence;
  distortionDisplacement = displacement;
};

const runDistortionPhase = (target: HTMLElement, phase: 'out' | 'in'): Promise<void> => new Promise((resolve) => {
  ensureDistortionFilter();
  if (!distortionTurbulence || !distortionDisplacement) {
    resolve();
    return;
  }

  const duration = phase === 'out' ? 420 : 480;
  const start = performance.now();
  target.classList.add('is-distorting-page');

  const rafStep = (now: number): void => {
    const t = Math.min(1, (now - start) / duration);
    const easeOut = 1 - Math.pow(1 - t, 3);
    const strength = phase === 'out' ? easeOut : 1 - easeOut;

    const freqX = 0.008 + strength * 0.05;
    const freqY = 0.03 + strength * 0.2;
    const scale = Math.round(130 * strength);
    const jitterAmp = 2 + 10 * strength;
    const jitterX = Math.sin((t + 0.15) * 40) * jitterAmp;
    const jitterY = Math.cos((t + 0.11) * 34) * jitterAmp * 0.7;

    distortionTurbulence!.setAttribute('baseFrequency', `${freqX.toFixed(4)} ${freqY.toFixed(4)}`);
    distortionDisplacement!.setAttribute('scale', `${scale}`);

    target.style.filter = 'url(#page-distort-filter)';
    target.style.transform = `translate3d(${jitterX.toFixed(2)}px, ${jitterY.toFixed(2)}px, 0)`;
    target.style.opacity = '1';

    if (t < 1) {
      requestAnimationFrame(rafStep);
      return;
    }

    distortionDisplacement!.setAttribute('scale', '0');
    distortionTurbulence!.setAttribute('baseFrequency', '0.008 0.03');
    target.style.filter = '';
    target.style.transform = '';
    target.style.opacity = '';
    target.classList.remove('is-distorting-page');
    resolve();
  };

  requestAnimationFrame(rafStep);
});

const waitForStylesheet = (linkEl: HTMLLinkElement): Promise<void> => new Promise((resolve) => {
  const sheet = linkEl.sheet as CSSStyleSheet | null;
  if (sheet) {
    resolve();
    return;
  }

  linkEl.addEventListener('load', () => resolve(), { once: true });
  linkEl.addEventListener('error', () => resolve(), { once: true });
});

const setAboutStylesEnabled = async (enabled: boolean): Promise<void> => {
  if (!enabled) {
    if (aboutStyleLink) aboutStyleLink.disabled = true;
    return;
  }

  if (!aboutStyleLink) {
    aboutStyleLink = document.createElement('link');
    aboutStyleLink.rel = 'stylesheet';
    aboutStyleLink.href = aboutCssHref;
    aboutStyleLink.dataset.aboutStyle = '1';
    document.head.appendChild(aboutStyleLink);
  }

  aboutStyleLink.disabled = false;
  await waitForStylesheet(aboutStyleLink);
};

const addLoadedCounter = (): void => {
  loadingCount = Math.min(loadingMax, loadingCount + 1);
  if (loadingCountEl) {
    loadingCountEl.textContent = String(loadingCount);
  }
  if (loadingProgressEl) {
    const progress = loadingMax > 0 ? loadingCount / loadingMax : 1;
    loadingProgressEl.style.transform = `scaleX(${progress})`;
  }
};

const setLoadingComplete = (): void => {
  loadingContainer?.setAttribute('data-complete', '1');
};

const removeLoading = (): void => {
  loadingContainer?.remove();
};

const updateActiveMenu = (namespace: string | null): void => {
  const navLinks = document.querySelectorAll<HTMLAnchorElement>('.side-nav a');
  navLinks.forEach((link) => {
    link.classList.remove('active');
    link.removeAttribute('aria-current');
  });

  const activeHref = namespace === 'about' ? '/about.html' : '/index.html';
  const activeLink = Array.from(navLinks).find((link) => {
    const href = link.getAttribute('href');
    if (!href) return false;
    return href === activeHref || (namespace === 'home' && href === '/');
  });

  if (activeLink) {
    activeLink.classList.add('active');
    activeLink.setAttribute('aria-current', 'page');
  }
};

const setupPage = async (namespace: string | null): Promise<void> => {
  await setAboutStylesEnabled(namespace === 'about');
  rootEl.dataset.pageId = namespace ?? 'home';
  refreshGlitchLabels();
  updateActiveMenu(namespace);

  if (currentPageCleanup) {
    currentPageCleanup();
    currentPageCleanup = null;
  }

  if (namespace === 'about') {
    currentPageCleanup = initAboutPage();
    return;
  }

  currentPageCleanup = initHomeTerminal();
};

const getCurrentNamespace = (): string | null => {
  const container = document.querySelector<HTMLElement>('[data-barba="container"]');
  return container?.dataset.barbaNamespace ?? null;
};

if (!rootEl.dataset.loaded) rootEl.dataset.loaded = '0';
if (!rootEl.dataset.pageId) {
  rootEl.dataset.pageId = getCurrentNamespace() ?? 'home';
}

barba.init({
  sync: false,
  debug: false,
  preventRunning: true,
  timeout: 5000,
  transitions: [{
    name: 'shoya-like',
    async once(data: any) {
      window.scrollTo(0, 0);
      rootEl.dataset.loaded = '0';
      await setupPage(data.next.namespace ?? getCurrentNamespace());
      addLoadedCounter();
      setLoadingComplete();
      rootEl.dataset.once = '1';
      await wait(300);
      rootEl.dataset.loaded = '1';
      await wait(100);
      await wait(400);
      removeLoading();
    },
    async beforeLeave() {
      rootEl.dataset.transitioning = '1';
      if (currentPageCleanup) {
        currentPageCleanup();
        currentPageCleanup = null;
      }
      await wait(40);
    },
    async leave() {
      const pageRoot = document.body;
      if (!pageRoot) {
        await wait(120);
        return;
      }
      await runDistortionPhase(pageRoot, 'out');
    },
    async beforeEnter(data: any) {
      const nextNamespace = data.next.namespace ?? 'home';
      rootEl.dataset.pageId = nextNamespace;
      await setAboutStylesEnabled(nextNamespace === 'about');
    },
    async enter() {
      window.scrollTo(0, 0);
      const pageRoot = document.body;
      if (!pageRoot) return;
      await runDistortionPhase(pageRoot, 'in');
    },
    async after(data: any) {
      window.scrollTo(0, 0);
      await setupPage(data.next.namespace ?? getCurrentNamespace());
      await wait(100);
      rootEl.dataset.transitioning = '0';
    }
  }]
});
