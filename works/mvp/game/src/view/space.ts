import * as THREE from 'three';

/**
 * 宇宙の背景（宇宙テーマ）。実写の天の川の全天写真を背景にし、同じ写真を盤の反射にも使う。
 * 写真: ESO/S. Brunier（CC BY 4.0）。4096x2048 に縮小して使用している。描画だけで、ルールとは無関係。
 */

const PANORAMA_URL = './milkyway.jpg';
const DUST_COUNT = 220;
const DUST_BOX = { x: 14, yMin: -3, yMax: 8, z: 14 };

// 写真の中心（銀河の中心）が奥に来るよう回し、天の川の帯が奥の空に斜めに立ち上がるよう傾ける
const SKY_ROTATION = new THREE.Euler(-0.75, Math.PI / 2, 0.1);

export interface Space {
  update(timeMs: number): void;
}

/** 点を丸くぼかすための、小さな光の画像 */
function makeDotTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(c);
}

function buildDust(dot: THREE.Texture): THREE.Points {
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
    new THREE.PointsMaterial({ color: 0xbcd4ff, map: dot, size: 0.16, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }),
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

  const dust = buildDust(makeDotTexture());
  scene.add(dust);
  const dustPos = dust.geometry.getAttribute('position') as THREE.BufferAttribute;
  let last = 0;

  return {
    update(timeMs: number): void {
      const dt = last === 0 ? 0 : Math.min((timeMs - last) / 1000, 0.1);
      last = timeMs;
      // 宇宙塵が手前から奥へ流れて、進んでいる感じを出す
      for (let i = 0; i < DUST_COUNT; i++) {
        let z = dustPos.getZ(i) - dt * 1.2;
        if (z < -DUST_BOX.z) z += DUST_BOX.z * 2;
        dustPos.setZ(i, z);
      }
      dustPos.needsUpdate = true;
    },
  };
}
