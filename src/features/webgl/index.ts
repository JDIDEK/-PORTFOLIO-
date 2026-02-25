import * as THREE from 'three';
import type { LoadingController } from '../loading-screen';

export interface InitWebglOptions {
  loading: LoadingController;
}

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

export function initWebglBackground(options: InitWebglOptions): void {
  const { loading } = options;

  const canvas = document.querySelector<HTMLCanvasElement>('#webgl-canvas');
  const rainVideoEl = document.querySelector<HTMLVideoElement>('#rain-video');
  const bgVideoEl1 = document.querySelector<HTMLVideoElement>('#bg-video-1');

  if (!canvas || !rainVideoEl || !bgVideoEl1) {
    loading.resolveTask('texture-metal-normal');
    loading.resolveTask('texture-metal-roughness');
    loading.resolveTask('video-rain');
    loading.resolveTask('video-background');
    return;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const isTouchDevice =
    window.matchMedia('(hover: none), (pointer: coarse)').matches ||
    'ontouchstart' in window;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: true,
    powerPreference: 'high-performance'
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouchDevice ? 1.5 : 2));

  const textureLoader = new THREE.TextureLoader();

  const tMetalNormal = textureLoader.load(
    '/assets/webgl/texture/tMetalNormal.webp',
    () => loading.resolveTask('texture-metal-normal'),
    undefined,
    () => loading.resolveTask('texture-metal-normal')
  );
  const tMetalRoughness = textureLoader.load(
    '/assets/webgl/texture/tMetalRoughness.webp',
    () => loading.resolveTask('texture-metal-roughness'),
    undefined,
    () => loading.resolveTask('texture-metal-roughness')
  );
  tMetalNormal.wrapS = THREE.RepeatWrapping;
  tMetalNormal.wrapT = THREE.RepeatWrapping;
  tMetalRoughness.wrapS = THREE.RepeatWrapping;
  tMetalRoughness.wrapT = THREE.RepeatWrapping;

  loading.watchVideoReady(rainVideoEl, 'video-rain');
  configureVideoPlayback(rainVideoEl, ['/assets/webgl/texture/tNormal-Rain812d.mp4']);
  const tNormalRain = new THREE.VideoTexture(rainVideoEl);
  tNormalRain.wrapS = THREE.RepeatWrapping;
  tNormalRain.wrapT = THREE.RepeatWrapping;

  loading.watchVideoReady(bgVideoEl1, 'video-background');
  configureVideoPlayback(bgVideoEl1, [
    '/assets/webgl/texture/tNormal-Rain812d.mp4',
    '/assets/webgl/texture/tNormal-Rain.mp4'
  ]);
  const tVideo1 = new THREE.VideoTexture(bgVideoEl1);
  tVideo1.wrapS = THREE.MirroredRepeatWrapping;
  tVideo1.wrapT = THREE.MirroredRepeatWrapping;

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

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = window.innerWidth;
  maskCanvas.height = window.innerHeight;
  const maskCtx = maskCanvas.getContext('2d');
  if (!maskCtx) return;

  maskCtx.fillStyle = 'black';
  maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
  const tFluid = new THREE.CanvasTexture(maskCanvas);

  const mouse = new THREE.Vector2(window.innerWidth * 0.5, window.innerHeight * 0.55);
  const setPointer = (x: number, y: number): void => {
    mouse.x = x;
    mouse.y = y;
  };

  window.addEventListener(
    'pointermove',
    (event) => {
      setPointer(event.clientX, event.clientY);
    },
    { passive: true }
  );

  window.addEventListener(
    'touchstart',
    (event) => {
      const touch = event.touches[0];
      if (!touch) return;
      setPointer(touch.clientX, touch.clientY);
    },
    { passive: true }
  );

  window.addEventListener(
    'touchmove',
    (event) => {
      const touch = event.touches[0];
      if (!touch) return;
      setPointer(touch.clientX, touch.clientY);
    },
    { passive: true }
  );

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
    uniforms,
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

    if (
      mouse.x > window.innerWidth ||
      mouse.y > window.innerHeight ||
      mouse.x < 0 ||
      mouse.y < 0
    ) {
      setPointer(window.innerWidth * 0.5, window.innerHeight * 0.55);
    }
  });
}
