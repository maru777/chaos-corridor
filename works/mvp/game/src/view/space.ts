import * as THREE from 'three';
import { makeGlowTexture, makeSparkleTexture, outlineMesh } from './fx';

/**
 * 宇宙の背景（宇宙テーマ）。コードだけで作る、絵として整えた宇宙。
 * - 星雲: 起動時に 1 回だけ描いて、立方体の画像（キューブマップ）にして貼る。毎フレームは計算しない。
 * - 星・宇宙塵・惑星: 写真・星・塵・惑星をそれぞれ違う速さで動かして、奥行きを出す。
 * 描画だけで、ルールとは無関係。
 */

const SKY_SIZE = 1024;
const DUST_COUNT = 220;
const DUST_BOX = { x: 14, yMin: -3, yMax: 8, z: 14 };
const STAR_COUNT = 2600;

const NOISE_GLSL = /* glsl */ `
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.02 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
    return s;
  }
`;

// 星雲。明るさには上限を設け、白飛びさせない（以前の銀河は足しすぎて白飛びした）
const NEBULA_FRAG = /* glsl */ `
  varying vec3 vDir;
  ${NOISE_GLSL}
  void main() {
    vec3 d = normalize(vDir);
    vec3 q = d * 2.2;
    vec3 w = vec3(fbm(q + vec3(0.0, 1.7, 0.3)), fbm(q + vec3(4.2, 0.8, 2.9)), fbm(q + vec3(1.3, 5.1, 7.7)));
    float n = fbm(q + 1.7 * w);
    float n2 = fbm(d * 4.6 + w * 2.1 + 9.0);
    float n3 = fbm(d * 3.0 + w * 1.4 + 21.0);

    // 明るく鮮やかな色（アニメ調）。藍・青・紫・青緑・桃
    vec3 col = vec3(0.025, 0.03, 0.16);
    col += vec3(0.10, 0.34, 1.00) * smoothstep(0.30, 0.85, n) * 0.62;
    col += vec3(0.78, 0.20, 0.98) * smoothstep(0.45, 0.90, n2) * smoothstep(0.30, 0.80, n) * 0.8;
    col += vec3(0.05, 0.85, 0.95) * smoothstep(0.58, 0.95, n3) * 0.4;
    col *= 1.0 - 0.45 * smoothstep(0.50, 0.80, fbm(d * 7.0 + w * 1.5));

    float glow = pow(max(dot(d, normalize(vec3(0.3, -0.35, -1.0))), 0.0), 5.0);
    col += vec3(1.0, 0.35, 0.75) * glow * 0.35;

    // セル画のように、色の濃さを段階（約 5 段）にそろえて、境目をはっきりさせる
    col = mix(col, floor(col * 5.0 + 0.5) / 5.0, 0.85);

    gl_FragColor = vec4(min(col, vec3(0.95)), 1.0);
  }
`;

const PLANET_VERT = /* glsl */ `
  varying vec3 vWN;
  varying vec3 vP;
  varying vec3 vView;
  void main() {
    vP = position;
    vWN = normalize(mat3(modelMatrix) * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const PLANET_FRAG = /* glsl */ `
  varying vec3 vWN;
  varying vec3 vP;
  varying vec3 vView;
  ${NOISE_GLSL}
  void main() {
    vec3 N = normalize(vWN);
    vec3 V = normalize(vView);
    vec3 L = normalize(vec3(0.7, 0.45, 0.6));
    // トゥーン: 影は 3 段、縞は 2 色のはっきりした帯、縁の光は段になる
    float lit = floor(smoothstep(-0.15, 0.65, dot(N, L)) * 2.99) / 2.0;
    float bands = step(0.5, 0.5 + 0.5 * sin(vP.y * 0.9 + fbm(vP * 0.25) * 5.0));
    vec3 surf = mix(vec3(0.16, 0.55, 0.95), vec3(0.95, 0.45, 0.85), bands);
    surf = mix(surf, vec3(0.95, 0.98, 1.0), step(0.72, fbm(vP * 0.4)) * 0.6);
    float rim = step(0.62, 1.0 - max(dot(N, V), 0.0));
    vec3 col = surf * (0.35 + 0.65 * lit) + vec3(0.55, 0.85, 1.0) * rim * (0.3 + 0.7 * lit);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export interface Space {
  update(timeMs: number): void;
}

function buildDust(glow: THREE.Texture): THREE.Points {
  const pos = new Float32Array(DUST_COUNT * 3);
  for (let i = 0; i < DUST_COUNT; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * DUST_BOX.x;
    pos[i * 3 + 1] = DUST_BOX.yMin + Math.random() * (DUST_BOX.yMax - DUST_BOX.yMin);
    pos[i * 3 + 2] = (Math.random() * 2 - 1) * DUST_BOX.z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0xbcd4ff, map: glow, size: 0.14, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
}

/** くっきりした星。色と明るさに幅をつける */
function buildStars(glow: THREE.Texture): THREE.Points {
  const pos = new Float32Array(STAR_COUNT * 3);
  const col = new Float32Array(STAR_COUNT * 3);
  const palette = [new THREE.Color(0xcfe0ff), new THREE.Color(0xffffff), new THREE.Color(0xffe2b0), new THREE.Color(0xa8c0ff), new THREE.Color(0xffc4a0)];
  for (let i = 0; i < STAR_COUNT; i++) {
    const r = 80 + Math.random() * 30;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.cos(phi);
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    const c = palette[Math.floor(Math.random() * palette.length)] as THREE.Color;
    const b = Math.pow(Math.random(), 3) * 1.6 + 0.12; // 暗い星が多く、まれに明るい
    col[i * 3] = c.r * b;
    col[i * 3 + 1] = c.g * b;
    col[i * 3 + 2] = c.b * b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Points(
    geo,
    new THREE.PointsMaterial({ size: 1.4, map: glow, vertexColors: true, sizeAttenuation: true, fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
}

/** 星雲を 1 回だけ描いて、背景と反射に使う画像にする */
function bakeNebula(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
  const skyScene = new THREE.Scene();
  skyScene.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(100, 48, 32),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: NEBULA_FRAG,
      }),
    ),
  );
  const target = new THREE.WebGLCubeRenderTarget(SKY_SIZE, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  new THREE.CubeCamera(0.1, 500, target).update(renderer, skyScene);
  scene.background = target.texture;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromCubemap(target.texture).texture;
  pmrem.dispose();
}

function buildPlanet(glow: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const radius = 6;
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 64, 48),
    new THREE.ShaderMaterial({ vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG }),
  );
  // 惑星にも黒縁（遠くにあるので、縁は太め）
  const hull = outlineMesh(new THREE.SphereGeometry(radius, 48, 32), 0.28);
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glow, color: 0x4a86ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  halo.scale.set(radius * 4.2, radius * 4.2, 1);
  halo.renderOrder = -1;
  g.add(halo, hull, planet);
  g.position.set(-15, -20, -56);
  return g;
}

export function createSpace(scene: THREE.Scene, renderer: THREE.WebGLRenderer): Space {
  scene.background = new THREE.Color(0x01020a);
  scene.backgroundIntensity = 1.0;
  scene.environmentIntensity = 1.2;
  bakeNebula(scene, renderer);

  const glow = makeGlowTexture();
  const stars = buildStars(makeSparkleTexture());
  const dust = buildDust(glow);
  const planet = buildPlanet(glow);
  scene.add(stars, dust, planet);
  const dustPos = dust.geometry.getAttribute('position') as THREE.BufferAttribute;
  let last = 0;

  return {
    update(timeMs: number): void {
      const dt = last === 0 ? 0 : Math.min((timeMs - last) / 1000, 0.1);
      last = timeMs;
      // 星雲・星・塵・惑星を、違う速さで動かす（奥ほどゆっくり）
      scene.backgroundRotation.y += dt * 0.006;
      scene.environmentRotation.y += dt * 0.006;
      stars.rotation.y -= dt * 0.012;
      planet.children[2]!.rotation.y += dt * 0.03;
      for (let i = 0; i < DUST_COUNT; i++) {
        let z = dustPos.getZ(i) - dt * 1.2;
        if (z < -DUST_BOX.z) z += DUST_BOX.z * 2;
        dustPos.setZ(i, z);
      }
      dustPos.needsUpdate = true;
    },
  };
}
