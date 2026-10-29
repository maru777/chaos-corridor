import * as THREE from 'three';

/** 光の表現に使う、共通の部品（描画だけ） */

/** 中心が明るく、外へ消えていく丸いぼかしの画像。点や光の暈（ハロ）に使う */
export function makeGlowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.15, 'rgba(255,255,255,0.7)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.18)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(c);
}

/** アニメ調の黒縁の色（真っ黒ではなく、わずかに青紫の黒） */
export const OUTLINE_COLOR = 0x05030f;

/**
 * 黒縁（反転した殻）。物より少し大きい黒い殻を、裏面だけ描くと、まわりに縁が出る。
 * 物と同じ中心にある形（球・箱など）に使う。thickness は、縁の太さ（ワールドの長さ）。
 */
const OUTLINE_MATERIAL = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide, toneMapped: false });

export function outlineMesh(geometry: THREE.BufferGeometry, thickness: number): THREE.Mesh {
  geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  (geometry.boundingBox as THREE.Box3).getSize(size);
  const mesh = new THREE.Mesh(geometry, OUTLINE_MATERIAL);
  mesh.scale.set((size.x + thickness * 2) / size.x, (size.y + thickness * 2) / size.y, (size.z + thickness * 2) / size.z);
  return mesh;
}

/** トゥーン（セル画）の影の段階。3 段（暗・中・明）のはっきりした影になる */
export function makeToonGradient(): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array([90, 175, 255]), 3, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** 四方に光がのびる、キラッとした星の形（アニメの星の表現） */
export function makeSparkleTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    const glow = g.createRadialGradient(64, 64, 0, 64, 64, 30);
    glow.addColorStop(0, 'rgba(255,255,255,0.9)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#fff';
    g.beginPath();
    // 縦と横に細長くのびる、ひし形（十字の光）
    g.moveTo(64, 2);
    g.quadraticCurveTo(70, 58, 126, 64);
    g.quadraticCurveTo(70, 70, 64, 126);
    g.quadraticCurveTo(58, 70, 2, 64);
    g.quadraticCurveTo(58, 58, 64, 2);
    g.fill();
  }
  return new THREE.CanvasTexture(c);
}

/** 重ねると明るくなる、半透明の光の材質（ソリッドに見えない） */
export function glowMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
}

/** 画面の四隅を暗くし、細かい粒（フィルムの粒子）と、端のわずかな色ずれを足す。写真の「貼り付き感」を消す */
export const CINEMA_SHADER = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uTime: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 d = vUv - 0.5;
      float r = length(d);
      vec2 off = d * r * 0.0015;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col *= mix(1.0, 0.7, smoothstep(0.4, 0.95, r));
      col += (hash(vUv * 900.0 + fract(uTime)) - 0.5) * 0.008;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
