import * as THREE from 'three';

// --------------------------------------------------------
// 1. SETUP THREE.JS (Mode Plein Écran)
// --------------------------------------------------------
const canvas = document.querySelector<HTMLCanvasElement>('#webgl-canvas')!;
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const renderer = new THREE.WebGLRenderer({ 
  canvas: canvas, antialias: false, alpha: true 
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

function configureVideoPlayback(video: HTMLVideoElement, fallbackSources: string[] = []): void {
  const declaredSrc = video.getAttribute('src');
  const sources = [declaredSrc, ...fallbackSources].filter((src): src is string => Boolean(src));
  const tried = new Set<string>();
  let sourceIndex = 0;

  const loadAndPlay = (src: string): void => {
    if (video.getAttribute('src') !== src) {
      video.src = src;
      video.load();
    }
    video.play().catch(() => {});
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

const mouse = new THREE.Vector2(-1000, -1000);
window.addEventListener('mousemove', (event) => {
  mouse.x = event.clientX;
  mouse.y = event.clientY;
});

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
  uBloom: { value: 0.5 }
};

const material = new THREE.ShaderMaterial({
  uniforms: uniforms,
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
  `,
  // Fragment Shader d'origine simplifié (une seule vidéo de fond)
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
    varying vec2 vUv;

    vec2 optimizationTextureUv(vec2 _uv, float pa, float ta) {
        vec2 ratio = vec2(min(pa/ta, 1.0), (min((1.0/pa)/(1.0/ta), 1.0)));
        return vec2(((_uv.x-0.5)*ratio.x+0.5), ((_uv.y-0.5)*ratio.y+0.5));
    }

    void main(void) {
        vec4 c = vec4(1.0);
        float aspect = uResolution.x / uResolution.y;
        vec2 offsetNormalRainUv = vec2(0.1);
        vec2 normalRainUv = vUv;
        
        normalRainUv = optimizationTextureUv(normalRainUv, aspect, uVideoSize.x/uVideoSize.y);
        
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
        uv = optimizationTextureUv(uv, aspect, uVideoSize.x/uVideoSize.y);
        
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
function raf() {
  maskCtx.fillStyle = 'rgba(0, 0, 0, 0.03)'; 
  maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

  const brushSize = 150;
  const gradient = maskCtx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, brushSize);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
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
// 6. GESTION DES LETTRES SVG (HOVER)
// --------------------------------------------------------
const letters = document.querySelectorAll<HTMLImageElement>('.svg-letter');
letters.forEach(letter => {
  const originalSrc = letter.src;
  const hoverSrc = letter.getAttribute('data-hover')!;
  
  letter.addEventListener('mouseenter', () => letter.src = hoverSrc);
  letter.addEventListener('mouseleave', () => letter.src = originalSrc);
});

// --------------------------------------------------------
// 7. EFFET GLITCH SUR LES LABELS UI
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
// 8. AUDIO UI (SOUND TOGGLE + HOVER)
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
// 9. REDIMENSIONNEMENT
// --------------------------------------------------------
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
  maskCanvas.width = window.innerWidth;
  maskCanvas.height = window.innerHeight;
});
