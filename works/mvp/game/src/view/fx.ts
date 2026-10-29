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
      vec2 off = d * r * 0.006;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col *= mix(1.0, 0.45, smoothstep(0.3, 0.85, r));
      col += (hash(vUv * 900.0 + fract(uTime)) - 0.5) * 0.03;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
