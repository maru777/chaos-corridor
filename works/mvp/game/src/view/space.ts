import * as THREE from 'three';
import { makeGlowTexture } from './fx';

/**
 * 宇宙の背景（宇宙テーマ）。実写の天の川の全天写真を背景にし、同じ写真を盤の反射にも使う。
 * 写真: ESO/S. Brunier（CC BY 4.0）。4096x2048 に縮小して使用している。描画だけで、ルールとは無関係。
 *
 * 写真だけだと、引き伸ばされてぼやけ、動かない「壁紙」に見える。
 * そこで、くっきりした星の層を上に重ね、写真・星・宇宙塵をそれぞれ違う速さで動かして奥行きを出す。
 */

const PANORAMA_URL = './milkyway.jpg';
const DUST_COUNT = 220;
const DUST_BOX = { x: 14, yMin: -3, yMax: 8, z: 14 };
const STAR_COUNT = 2600;

// 写真の中心（銀河の中心）が奥に来るよう回し、天の川の帯が奥の空に斜めに立ち上がるよう傾ける
const SKY_ROTATION = new THREE.Euler(-0.75, Math.PI / 2 + 0.6, 0.1);

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

/** 写真の上に重ねる、くっきりした星。色と明るさに幅をつける */
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
    new THREE.PointsMaterial({ size: 0.5, map: glow, vertexColors: true, sizeAttenuation: true, fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
}

export function createSpace(scene: THREE.Scene, renderer: THREE.WebGLRenderer): Space {
  scene.background = new THREE.Color(0x01020a);
  scene.backgroundRotation.copy(SKY_ROTATION);
  scene.environmentRotation.copy(SKY_ROTATION);
  scene.backgroundIntensity = 1.6;
  scene.environmentIntensity = 1.2;

  new THREE.TextureLoader().load(PANORAMA_URL, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = tex;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose();
  });

  const glow = makeGlowTexture();
  const stars = buildStars(glow);
  scene.add(stars);
  const dust = buildDust(glow);
  scene.add(dust);
  const dustPos = dust.geometry.getAttribute('position') as THREE.BufferAttribute;
  let last = 0;

  return {
    update(timeMs: number): void {
      const dt = last === 0 ? 0 : Math.min((timeMs - last) / 1000, 0.1);
      last = timeMs;
      // 写真・星・塵を、違う速さで動かす（奥ほどゆっくり）
      scene.backgroundRotation.y += dt * 0.004;
      scene.environmentRotation.y += dt * 0.004;
      stars.rotation.y -= dt * 0.012;
      for (let i = 0; i < DUST_COUNT; i++) {
        let z = dustPos.getZ(i) - dt * 1.2;
        if (z < -DUST_BOX.z) z += DUST_BOX.z * 2;
        dustPos.setZ(i, z);
      }
      dustPos.needsUpdate = true;
    },
  };
}
