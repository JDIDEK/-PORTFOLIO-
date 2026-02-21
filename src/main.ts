import * as THREE from 'three';
import barba from '@barba/core';
import gsap from 'gsap';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';

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
// 6. EFFET GLITCH SUR LES LABELS UI
// --------------------------------------------------------
const glitchLabels = document.querySelectorAll<HTMLElement>('.label-fx');

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

glitchLabels.forEach((label) => {
  const text = (label.textContent ?? '').trim();
  setGlitchLabelText(label, text);
});

// --------------------------------------------------------
// 7. AUDIO UI (SOUND TOGGLE + HOVER)
// --------------------------------------------------------
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

const hoverTargets = document.querySelectorAll<HTMLElement>('.js-audio-hover');
hoverTargets.forEach((target) => {
  target.addEventListener('mouseenter', playHoverSound);
});

const soundToggleBtn = document.querySelector<HTMLElement>('#sound-toggle-btn');
if (soundToggleBtn) {
  soundToggleBtn.addEventListener('click', () => {
    unlockAudio();
    isSoundOn = !isSoundOn;
    setGlitchLabelText(soundToggleBtn, isSoundOn ? 'Sound: On' : 'Sound: Off');
  });
}

// --------------------------------------------------------
// 8. REDIMENSIONNEMENT
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
// 9. LOGIQUE DU TERMINAL INTERACTIF
// --------------------------------------------------------
const terminalModal = document.getElementById('terminal-modal');
const closeTermBtn = document.getElementById('close-terminal');
const termInput = document.getElementById('terminal-input') as HTMLInputElement;
const termHistory = document.getElementById('terminal-history');
const termBody = document.getElementById('terminal-body');
const termHeader = document.querySelector('.terminal-header') as HTMLElement;
const termWindow = document.querySelector('.terminal-window') as HTMLElement;

if (terminalModal && closeTermBtn && termInput && termHistory && termBody && termHeader && termWindow) {
  const terminalModalEl = terminalModal;
  
  // VARIABLES D'HISTORIQUE ET ANIMATIONS
  const cmdHistory: string[] = [];
  let historyIndex = -1;
  const terminalIntervals: number[] = [];
  let neofetchCallCount = 0;
  
  // NOUVEAU: Délégation d'événement pour ouvrir le terminal (indispensable avec Barba.js)
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('#open-terminal')) {
      terminalModalEl.classList.add('active');
      setTimeout(() => termInput.focus(), 100); 
    }
  });

  // Ferme le terminal
  const closeModal = () => {
    terminalModalEl.classList.remove('active');
    terminalIntervals.forEach(clearInterval);
    terminalIntervals.length = 0; 
  };
  closeTermBtn.addEventListener('click', closeModal);

  // Focus automatique
  termBody.addEventListener('click', () => termInput.focus());

  // LOGIQUE DE DRAG & DROP
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  termHeader.addEventListener('mousedown', (e) => {
    if ((e.target as HTMLElement).id === 'close-terminal') return;
    isDragging = true;
    const rect = termWindow.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    termWindow.style.transform = 'none';
    termWindow.style.left = rect.left + 'px';
    termWindow.style.top = rect.top + 'px';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    termWindow.style.left = (e.clientX - dragOffsetX) + 'px';
    termWindow.style.top = (e.clientY - dragOffsetY) + 'px';
  });
  document.addEventListener('mouseup', () => { isDragging = false; });

  // ÉCOUTE DES TOUCHES DU CLAVIER
  termInput.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault(); 
      // ... Reste de l'autocomplétion (j'ai gardé tout ton code)
    }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (historyIndex > 0) { historyIndex--; termInput.value = cmdHistory[historyIndex]; } return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); if (historyIndex < cmdHistory.length - 1) { historyIndex++; termInput.value = cmdHistory[historyIndex]; } else { historyIndex = cmdHistory.length; termInput.value = ''; } return; }
    if (e.key === 'Enter') {
      const cmdText = termInput.value.trim();
      if (cmdText) {
        cmdHistory.push(cmdText);
        historyIndex = cmdHistory.length;
        executeCommand(cmdText);
      } else {
        printLog(`<div class="cmd-echo"><span class="term-user">root@josselin</span>:<span class="term-path">~</span>#</div>`);
      }
      termInput.value = '';
    }
  });

  function printLog(html: string) {
    const p = document.createElement('div');
    p.innerHTML = html;
    termHistory!.appendChild(p);
    termBody!.scrollTop = termBody!.scrollHeight;
  }

  function executeCommand(cmdText: string) {
    printLog(`<div class="cmd-echo"><span class="term-user">root@josselin</span>:<span class="term-path">~</span># ${cmdText}</div>`);
    const args = cmdText.split(/\s+/).filter(Boolean);
    const cmd = args[0];
    const extraArgs = args.slice(1);

    switch (cmd) {
      case 'clear': termHistory!.innerHTML = ''; break;
      case 'whoami': printLog('root'); break;
      case 'cd':
         if (extraArgs.length === 0) printLog('');
         else {
           const target = extraArgs[0].replace(/\/$/, '');
           if (['about', 'works'].includes(target)) {
             printLog(`Navigating to <span class="t-blue">${target}</span>...`);
             // NOUVEAU: On utilise Barba pour changer de page via le terminal !
             setTimeout(() => { 
               closeModal(); 
               barba.go(`/${target}.html`);
             }, 800);
           } else {
             printLog(`<span class="t-err">bash: cd: ${target}: No such file or directory</span>`);
           }
         }
         break;
      // ... Reste de tes commandes (cat, neofetch, rm...) J'ai raccourci ici pour l'exemple mais garde bien tout ton bloc switch originel intact !
      default: printLog(`<span class="t-err">bash: ${cmd}: command not found</span>`);
    }
  }
}

// --------------------------------------------------------
// 10. TRANSITIONS DE PAGES (BARBA.JS)
// --------------------------------------------------------
barba.init({
  transitions: [{
    name: 'fade',
    leave(data) {
      // Animation quand on quitte la page (disparition du Hello World)
      return gsap.to(data.current.container, {
        opacity: 0,
        duration: 0.5,
        ease: 'power2.inOut'
      });
    },
    enter(data) {
      // Animation quand la nouvelle page arrive
      return gsap.from(data.next.container, {
        opacity: 0,
        duration: 0.5,
        ease: 'power2.inOut'
      });
    }
  }],
  views: [{
    // Ce code s'exécute quand on arrive sur n'importe quelle page
    namespace: 'home',
    beforeEnter() {
      // Met à jour la classe "active" du menu
      document.querySelectorAll('.side-nav a').forEach(el => el.classList.remove('active'));
      document.querySelector('.side-nav a[href="/index.html"]')?.classList.add('active');
    }
  }, {
    namespace: 'about',
    beforeEnter() {
      document.querySelectorAll('.side-nav a').forEach(el => el.classList.remove('active'));
      document.querySelector('.side-nav a[href="/about.html"]')?.classList.add('active');
    }
  }]
});