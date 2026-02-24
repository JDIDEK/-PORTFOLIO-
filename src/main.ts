import * as THREE from 'three';

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
// 9. LOGIQUE DU TERMINAL INTERACTIF (HISTORIQUE, TAB, NEOFETCH, RM)
// --------------------------------------------------------
const openTermBtn = document.getElementById('open-terminal');
const terminalModal = document.getElementById('terminal-modal');
const closeTermBtn = document.getElementById('close-terminal');
const termInput = document.getElementById('terminal-input') as HTMLInputElement;
const termHistory = document.getElementById('terminal-history');
const termBody = document.getElementById('terminal-body');
const termHeader = document.querySelector('.terminal-header') as HTMLElement;
const termWindow = document.querySelector('.terminal-window') as HTMLElement;

if (openTermBtn && terminalModal && closeTermBtn && termInput && termHistory && termBody && termHeader && termWindow) {
  const terminalModalEl = terminalModal;
  
  // --- VARIABLES D'HISTORIQUE ET ANIMATIONS ---
  const cmdHistory: string[] = [];
  let historyIndex = -1;
  const terminalIntervals: number[] = [];
  let neofetchCallCount = 0;
  const asciiFrameUrls = Array.from({ length: 51 }, (_, index) => {
    return `/assets/frames/frame_${String(index + 1).padStart(3, '0')}.txt`;
  });
  let cachedAsciiFrames: string[] | null = null;
  let asciiFramesLoadingPromise: Promise<string[]> | null = null;

  const loadAsciiFrames = async (): Promise<string[]> => {
    if (cachedAsciiFrames) return cachedAsciiFrames;
    if (asciiFramesLoadingPromise) return asciiFramesLoadingPromise;

    asciiFramesLoadingPromise = Promise.all(
      asciiFrameUrls.map(async (url) => {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Unable to load ASCII frame: ${url}`);
        }
        return (await response.text()).replace(/\r\n/g, '\n');
      })
    )
      .then((frames) => {
        cachedAsciiFrames = frames;
        return frames;
      })
      .catch((error) => {
        console.error(error);
        return [];
      })
      .finally(() => {
        asciiFramesLoadingPromise = null;
      });

    return asciiFramesLoadingPromise;
  };

  // --- VARIABLES D'AUTOCOMPLÉTION ---
  const knownCommands = ['help', 'ls', 'clear', 'whoami', 'sudo', 'cd', 'cat', 'neofetch', 'rm'];
  const knownFiles = ['about/', 'works/', 'contact.txt', 'matrix.sh'];

  // Ouvre le terminal
  openTermBtn.addEventListener('click', () => {
    terminalModalEl.classList.add('active');
    setTimeout(() => termInput.focus(), 100); 
  });

  // Ferme le terminal
  const closeModal = () => {
    terminalModalEl.classList.remove('active');
    // On nettoie les animations (ex: neofetch) pour ne pas faire ramer le PC en arrière-plan
    terminalIntervals.forEach(clearInterval);
    terminalIntervals.length = 0; 
  };
  closeTermBtn.addEventListener('click', closeModal);

  // Focus automatique
  termBody.addEventListener('click', () => termInput.focus());

  // --- LOGIQUE DE DRAG & DROP ---
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

  // --- ÉCOUTE DES TOUCHES DU CLAVIER ---
  termInput.addEventListener('keydown', (e) => {
    // 1. AUTOCOMPLÉTION (TAB)
    if (e.key === 'Tab') {
      e.preventDefault(); 
      const inputVal = termInput.value;
      const args = inputVal.split(' ');

      if (args.length === 1) {
        const match = knownCommands.find(c => c.startsWith(args[0].toLowerCase()));
        if (match) termInput.value = match + ' ';
      } else if (args.length === 2 && ['cd', 'cat', 'rm'].includes(args[0].toLowerCase())) {
        const match = knownFiles.find(f => f.startsWith(args[1].toLowerCase()));
        if (match) termInput.value = args[0] + ' ' + match;
      }
      return;
    }

    // 2. NAVIGATION HISTORIQUE (FLÈCHES)
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex > 0) {
        historyIndex--;
        termInput.value = cmdHistory[historyIndex];
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex < cmdHistory.length - 1) {
        historyIndex++;
        termInput.value = cmdHistory[historyIndex];
      } else {
        historyIndex = cmdHistory.length;
        termInput.value = '';
      }
      return;
    }

    // 3. VALIDATION (ENTRÉE)
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
    const cmd = args[0]; // Strict mode (case sensitive)
    const extraArgs = args.slice(1);

    switch (cmd) {
      case 'help':
        printLog(`Available commands:
        <br/>- <span class="t-warn">ls</span> : List directory contents
        <br/>- <span class="t-warn">cd [dir]</span> : Change directory
        <br/>- <span class="t-warn">whoami</span> : Print effective user id
        <br/>- <span class="t-warn">clear</span> : Clear terminal screen
        <br/>- <span class="t-warn">cat [file]</span> : Concatenate files and print
        <br/>- <span class="t-warn">neofetch</span> : Print system information`);
        break;
      
      case 'ls':
        if (extraArgs.length > 0) printLog(`<span class="t-err">ls: cannot access '${extraArgs[0]}': No such file or directory</span>`);
        else printLog(`<span class="t-blue">about</span>&nbsp;&nbsp;&nbsp;<span class="t-blue">works</span>&nbsp;</span>&nbsp;&nbsp;&nbsp;contact.txt&nbsp;&nbsp;&nbsp;<span class="t-green">matrix.sh*</span>`);
        break;
      
      case 'clear':
        termHistory!.innerHTML = '';
        break;
      
      case 'whoami':
        if (extraArgs.length > 0) printLog(`whoami: extra operand '${extraArgs[0]}'<br/>Try 'whoami --help' for more information.`);
        else printLog('root');
        break;
      
      case 'sudo':
        printLog(`root@josselin is not in the sudoers file.<br/><span class="t-err">This incident will be reported.</span>`);
        break;

      case 'cd':
        if (extraArgs.length === 0) printLog('');
        else if (extraArgs.length > 1) printLog(`<span class="t-err">bash: cd: too many arguments</span>`);
        else {
          const target = extraArgs[0].replace(/\/$/, '');
          if (['about', 'works'].includes(target)) {
            printLog(`Navigating to <span class="t-blue">${target}</span>...`);
            setTimeout(() => { closeModal(); }, 800);
          } else {
            printLog(`<span class="t-err">bash: cd: ${target}: No such file or directory</span>`);
          }
        }
        break;
      
      case 'cat':
        if (extraArgs.length === 0) printLog(`<span class="t-err">cat: missing operand</span><br/>Try 'cat --help' for more information.`);
        else {
          const file = extraArgs[0];
          if (file === 'contact.txt') printLog('Email: contact@didev.fr<br/>Github: https://github.com/JDIDEK');
          else if (file === 'matrix.sh') printLog(`<span class="t-err">bash: ./matrix.sh: Permission denied.</span>`);
          else printLog(`<span class="t-err">cat: ${file}: No such file or directory</span>`);
        }
        break;

      // ----------------------------------------------------
      // L'EASTER EGG NEOFETCH : ANIMATION ASCII DEPUIS /assets/frames
      // ----------------------------------------------------
      case 'neofetch':
        neofetchCallCount++;
        const animId = `ascii-anim-${neofetchCallCount}`;

        // Injection du conteneur HTML
        printLog(`
          <div style="display: flex; gap: 25px; align-items: center; margin-top: 15px; margin-bottom: 15px;">
            <div id="${animId}" style="color: #ff0000; white-space: pre; font-family: monospace; font-weight: bold; text-shadow: 0 0 8px rgba(255,0,0,0.7); font-size: 1.1em; line-height: 1.1; min-height: 120px; min-width: 200px;"></div>
            <div>
              -------------------<br/>
              <span class="t-blue">OS</span>: Josselin_OS (Cyberpunk Kernel)<br/>
              <span class="t-blue">Net</span>: LINK_ESTABLISHED // SECURE<br/>
              <span class="t-blue">Role</span>: Creative Developer & Breaker<br/>
              <span class="t-blue">Status</span>: <span class="t-green" style="text-shadow: 0 0 5px #8ae234;">System Stable (mostly)</span><br/>
              <span class="t-blue">Shell</span>: bash v5.0 (infected)<br/>
            </div>
          </div>
        `);

        setTimeout(() => {
          const animTarget = document.getElementById(animId);
          if (animTarget) {
            void loadAsciiFrames().then((frames) => {
              if (!frames.length) {
                animTarget.textContent = '\n[ASCII animation unavailable]\n';
                termBody!.scrollTop = termBody!.scrollHeight;
                return;
              }

              let frameIndex = 0;
              animTarget.textContent = `\n${frames[frameIndex]}\n`;
              termBody!.scrollTop = termBody!.scrollHeight;

              const interval = setInterval(() => {
                if (!terminalModalEl.classList.contains('active')) {
                  clearInterval(interval);
                  return;
                }
                frameIndex = (frameIndex + 1) % frames.length;
                animTarget.textContent = `\n${frames[frameIndex]}\n`;
                termBody!.scrollTop = termBody!.scrollHeight;
              }, 80) as unknown as number;

              terminalIntervals.push(interval);
            });
          }
        }, 50);
        break;

      // ----------------------------------------------------
      // LA SÉQUENCE D'AUTODESTRUCTION RM -RF /
      // ----------------------------------------------------
      case 'rm':
        if (extraArgs.join(' ') === '-rf /' || extraArgs.join(' ') === '-rf /*') {
          termInput.disabled = true;
          termInput.value = '';
          termInput.placeholder = 'SYSTEM CORRUPTED...';
          
          let delay = 20;
          let count = 0;
          const fakeFiles = [
            '/boot/vmlinuz-linux', '/etc/fstab', '/usr/bin/sudo', '/usr/lib/systemd',
            '/var/log/syslog', '/dev/sda1', '/usr/local/bin/node', '/home/josselin/portfolio/index.html',
            '/sys/firmware/efi', '/dev/null', '...'
          ];

          // Son du clavier (s'assure que l'élément est trouvé/créé)
          const keyboardSound = new Audio('/assets/sounds/keyboard.mp3');

          const nukeSystem = () => {
            if (count < 25) {
              const file = fakeFiles[count % fakeFiles.length];
              printLog(`rm: cannot remove '${file}': Device or resource busy`);
              if (count > 5) printLog(`rm: removing directory '${file}'`);
              
              delay += 15; 
              count++;
              setTimeout(nukeSystem, delay);
            } else {
              printLog(`<br/><span class="t-err" style="font-size: 1.1em; font-weight: bold;">Segmentation fault (core dumped)</span>`);
              printLog(`<span class="t-warn">Kernel panic - not syncing: Attempted to kill init!</span>`);
              
              termWindow.style.animation = 'neon-heavy-flicker 0.2s infinite';
              
              setTimeout(() => {
                // Écran de crash GRUB
                document.body.innerHTML = `
                  <div style="background:#000; color:#ccc; width:100vw; height:100vh; display:flex; flex-direction:column; padding: 20px; font-family: 'Courier New', monospace; box-sizing: border-box; margin: 0;">
                    <p>GRUB loading.</p>
                    <p>Welcome to GRUB!</p>
                    <p style="color: #ff0000; margin-top: 20px;">error: no such partition.</p>
                    <p style="color: #ff0000;">Entering rescue mode...</p>
                    <div style="display: flex; align-items: center; margin-top: 10px;">
                      <span>grub rescue> </span>
                      <span id="grub-text" style="margin-left: 8px;"></span>
                      <span class="term-cursor" style="color: #fff; margin-left: 2px;">_</span>
                    </div>
                  </div>
                `;

                const message = "Fatal error. File system destroyed. Please refresh the page to reboot.";
                const grubTextEl = document.getElementById('grub-text');
                let charIndex = 0;

                const typeWriter = () => {
                  if (charIndex < message.length) {
                    grubTextEl!.textContent += message.charAt(charIndex);
                    
                    // On vérifie si l'audio est débloqué par le code de l'étape 7
                    // @ts-ignore - Ignore l'erreur TS car isSoundOn est déclaré plus haut dans le main.ts
                    if (typeof isSoundOn !== 'undefined' && isSoundOn && isAudioUnlocked) {
                      const click = keyboardSound.cloneNode() as HTMLAudioElement;
                      click.volume = 0.3 + Math.random() * 0.2;
                      click.play().catch(() => {});
                    }

                    charIndex++;
                    setTimeout(typeWriter, Math.random() * 100 + 50); 
                  }
                };

                setTimeout(typeWriter, 1500);

              }, 2500);
            }
          };
          
          nukeSystem();

        } else {
          printLog(`rm: cannot remove '${extraArgs.join(' ')}': Permission denied`);
        }
        break;

      default:
        printLog(`<span class="t-err">bash: ${cmd}: command not found</span>`);
    }
  }
}