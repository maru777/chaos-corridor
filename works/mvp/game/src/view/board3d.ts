import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { goalRow } from '../board';
import type { GameState, Pos, WallSpec } from '../types';
import type { Rarity } from '../abilities';
import { CINEMA_SHADER, glowMaterial, makeGlowTexture } from './fx';
import { IMPACT_TAIL_MS, impactFrame } from './impact';
import { cellToWorld, wallToWorld, worldToBoard } from './layout';
import { createSpace } from './space';
import type { Space } from './space';

const BASE_FOV = 45;
const BASE_BLOOM = 0.55;

const PLAYER_COLORS = [0x38d9ff, 0xff4fb8] as const;
const WALL_LENGTH = 1.9;
const WALL_THICK = 0.1;
const WALL_HEIGHT = 0.5;
const WALL_COLOR = 0xffb04a;

export interface BoardPoint {
  readonly bx: number;
  readonly by: number;
}

/** 3D 盤面の描画だけを受け持つ。ルールは持たない（状態を渡されて描くだけ） */
export class BoardView {
  private readonly size: number;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 200);
  private readonly basePos = new THREE.Vector3();
  private impact: { rarity: Rarity; startedAt: number; impactMs: number } | null = null;
  private simTime = 0;
  private lastTime = 0;
  private lastFov = BASE_FOV;
  private readonly reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly wallGroup = new THREE.Group();
  private readonly markerGroup = new THREE.Group();
  private readonly pawns: THREE.Group[] = [];
  private readonly pawnRings: THREE.Mesh[] = [];
  private readonly pawnTargets: THREE.Vector3[] = [];
  private readonly space: Space;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly cinema: ShaderPass;
  private readonly glow = makeGlowTexture();
  private readonly wallGeo = {
    h: new THREE.BoxGeometry(WALL_LENGTH, WALL_HEIGHT, WALL_THICK),
    v: new THREE.BoxGeometry(WALL_THICK, WALL_HEIGHT, WALL_LENGTH),
  };
  private readonly wallEdgeGeo = {
    h: new THREE.EdgesGeometry(new THREE.BoxGeometry(WALL_LENGTH, WALL_HEIGHT, WALL_THICK)),
    v: new THREE.EdgesGeometry(new THREE.BoxGeometry(WALL_THICK, WALL_HEIGHT, WALL_LENGTH)),
  };
  private readonly wallMats = new Map<number, { shell: THREE.MeshBasicMaterial; edge: THREE.LineBasicMaterial }>();
  private ghost: THREE.Group;
  private readonly container: HTMLElement;

  constructor(container: HTMLElement, size: number) {
    this.size = size;
    this.container = container;

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);

    this.space = createSpace(this.scene, this.renderer);
    this.scene.add(new THREE.AmbientLight(0x7080b8, 0.5));
    const key = new THREE.DirectionalLight(0xdde8ff, 1.4);
    key.position.set(-6, 10, 6);
    this.scene.add(key);

    this.buildBoard();
    this.scene.add(this.wallGroup, this.markerGroup);

    // 光る物（壁・コマ・目印）がにじむ
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), BASE_BLOOM, 0.5, 0.9);
    this.composer.addPass(this.bloom);
    this.cinema = new ShaderPass(CINEMA_SHADER);
    this.composer.addPass(this.cinema);
    this.composer.addPass(new OutputPass());

    for (let p = 0; p < 2; p++) {
      const pawn = this.makePawn(PLAYER_COLORS[p] as number);
      pawn.position.y = 0.34;
      this.pawns.push(pawn);
      this.pawnTargets.push(pawn.position.clone());
      this.scene.add(pawn);
    }

    this.ghost = this.makeWall('h', WALL_COLOR);
    this.ghost.visible = false;
    this.scene.add(this.ghost);

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  private buildBoard(): void {
    // 宙に浮かぶガラス板。下の天の川が透けて、星空を映す
    const tileGeo = new THREE.BoxGeometry(0.94, 0.08, 0.94);
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        let color = 0x22408a;
        let emissive = 0x0a1a48;
        let opacity = 0.32;
        if (y === goalRow(this.size, 0)) {
          color = 0x1a8fb8;
          emissive = 0x0a6a8a;
          opacity = 0.55;
        } else if (y === goalRow(this.size, 1)) {
          color = 0xb8208a;
          emissive = 0x8a0a62;
          opacity = 0.55;
        }
        const mat = new THREE.MeshPhysicalMaterial({
          color,
          emissive,
          emissiveIntensity: 0.6,
          transparent: true,
          opacity,
          roughness: 0.05,
          metalness: 0.2,
          clearcoat: 1,
          clearcoatRoughness: 0.05,
          depthWrite: false,
        });
        const tile = new THREE.Mesh(tileGeo, mat);
        const w = cellToWorld(this.size, x, y);
        tile.position.set(w.x, -0.04, w.z);
        this.scene.add(tile);
      }
    }
    // 光る格子線
    const half = this.size / 2;
    const pts: number[] = [];
    for (let i = 0; i <= this.size; i++) {
      const t = i - half;
      pts.push(-half, 0.005, t, half, 0.005, t, t, 0.005, -half, t, 0.005, half);
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.scene.add(new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0x7fb0ff, transparent: true, opacity: 0.8 })));
    // 縁は、細い光の線だけにする（ソリッドな枠にしない）
    const rimMat = glowMaterial(0x9cc0ff, 0.9);
    const edge = this.size + 0.06;
    const rims: [number, number, number, number][] = [
      [edge, 0.04, 0, half],
      [edge, 0.04, 0, -half],
      [0.04, edge, half, 0],
      [0.04, edge, -half, 0],
    ];
    for (const [w, d, px, pz] of rims) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), rimMat);
      rim.position.set(px, 0, pz);
      this.scene.add(rim);
    }
  }

  /** コマ。ソリッドな球ではなく、光の核・ぼんやりした殻・暈・回る輪で、エネルギー体のように見せる */
  private makePawn(color: number): THREE.Group {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.27, 28, 18), glowMaterial(color, 0.22));
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.glow, color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    halo.scale.set(1.7, 1.7, 1);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.012, 8, 56), glowMaterial(color, 0.9));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.27;
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.008, 8, 56), glowMaterial(color, 0.35));
    ring2.rotation.x = Math.PI / 2;
    ring2.position.y = -0.27;
    g.add(core, shell, halo, ring, ring2);
    this.pawnRings.push(ring, ring2);
    return g;
  }

  /** 壁。ソリッドな板ではなく、半透明の光の障壁と、明るい縁の線 */
  private makeWall(o: 'h' | 'v', color: number): THREE.Group {
    let mats = this.wallMats.get(color);
    if (!mats) {
      mats = {
        shell: glowMaterial(color, 0.26),
        edge: new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, toneMapped: false }),
      };
      this.wallMats.set(color, mats);
    }
    const g = new THREE.Group();
    g.add(new THREE.Mesh(this.wallGeo[o], mats.shell), new THREE.LineSegments(this.wallEdgeGeo[o], mats.edge));
    return g;
  }

  private placeWall(obj: THREE.Object3D, wall: WallSpec): void {
    const w = wallToWorld(this.size, wall.x, wall.y);
    obj.position.set(w.x, WALL_HEIGHT / 2, w.z);
  }

  /** 状態を描き直す。legalMoves は、動けるマスの目印 */
  setState(state: GameState, legalMoves: readonly Pos[]): void {
    this.wallGroup.clear();
    for (const wall of state.walls) {
      const obj = this.makeWall(wall.o, WALL_COLOR);
      this.placeWall(obj, wall);
      this.wallGroup.add(obj);
    }
    for (let p = 0; p < 2; p++) {
      const pos = state.pawns[p as 0 | 1];
      const w = cellToWorld(this.size, pos.x, pos.y);
      (this.pawnTargets[p] as THREE.Vector3).set(w.x, 0.34, w.z);
    }
    this.markerGroup.clear();
    const color = PLAYER_COLORS[state.turn] as number;
    for (const m of legalMoves) {
      const marker = new THREE.Mesh(
        new THREE.RingGeometry(0.22, 0.28, 40),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      marker.rotation.x = -Math.PI / 2;
      const w = cellToWorld(this.size, m.x, m.y);
      marker.position.set(w.x, 0.02, w.z);
      this.markerGroup.add(marker);
    }
  }

  /** 壁の置き場所の予告。null で消す */
  setGhost(wall: WallSpec | null, valid: boolean): void {
    if (wall === null) {
      this.ghost.visible = false;
      return;
    }
    this.scene.remove(this.ghost);
    this.ghost = this.makeWall(wall.o, valid ? 0x4dff9a : 0xff4d4d);
    this.placeWall(this.ghost, wall);
    this.scene.add(this.ghost);
  }

  /** 画面上の位置を、盤の座標に直す。盤の平面に当たらなければ null */
  pick(clientX: number, clientY: number): BoardPoint | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.plane, hit) === null) return null;
    return worldToBoard(this.size, hit.x, hit.z);
  }

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    // 縦長の画面（スマホ）では、盤が横幅いっぱいに収まるようにカメラを引き、真上に近い角度にして押しやすくする
    const portrait = this.camera.aspect < 1;
    const k = Math.max(1, (portrait ? 0.98 : 0.92) / this.camera.aspect);
    // 横長は低めの角度にして、奥に天の川が見えるようにする
    this.basePos.set(0, (portrait ? 10.5 : 7.5) * k, (portrait ? 9.5 : 11.5) * k);
    this.camera.position.copy(this.basePos);
    this.camera.lookAt(0, 0, 0.3);
    this.camera.updateProjectionMatrix();
  }

  /** 能力を使った瞬間の演出（光のにじみ・ズーム・揺れ・スロー）を始める。impactMs は見せ場までの時間 */
  playImpact(rarity: Rarity, impactMs: number): void {
    this.impact = { rarity, startedAt: performance.now(), impactMs };
  }

  private frame(time: number): void {
    const real = this.lastTime === 0 ? 0 : Math.min(time - this.lastTime, 100);
    this.lastTime = time;

    let glow = 0;
    let zoom = 0;
    let shake = 0;
    let scale = 1;
    if (this.impact !== null) {
      const elapsed = time - this.impact.startedAt;
      if (elapsed > this.impact.impactMs + IMPACT_TAIL_MS) {
        this.impact = null;
      } else {
        const f = impactFrame(this.impact.rarity, elapsed, this.impact.impactMs, this.reducedMotion);
        glow = f.glow;
        zoom = f.zoomDeg;
        shake = f.shake;
        scale = f.timeScale;
      }
    }
    this.simTime += real * scale;
    const t = this.simTime;

    for (let p = 0; p < 2; p++) {
      const pawn = this.pawns[p] as THREE.Group;
      pawn.position.lerp(this.pawnTargets[p] as THREE.Vector3, 0.2);
      pawn.position.y = 0.34 + Math.sin(t / 500 + p * 2) * 0.04;
    }
    this.pawnRings.forEach((r, i) => {
      r.scale.setScalar(1 + Math.sin(t / 400 + i) * 0.06);
    });
    this.cinema.uniforms['uTime']!.value = time / 1000;
    const pulse = 1 + Math.sin(t / 250) * 0.12;
    for (const m of this.markerGroup.children) m.scale.setScalar(pulse);

    // カメラ: ズーム（視野角をせばめる）と揺れ（位置をずらす）
    const fov = BASE_FOV - zoom;
    if (fov !== this.lastFov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
      this.lastFov = fov;
    }
    this.camera.position.set(
      this.basePos.x + (Math.random() - 0.5) * 2 * shake,
      this.basePos.y + (Math.random() - 0.5) * 2 * shake,
      this.basePos.z,
    );
    this.bloom.strength = BASE_BLOOM + glow;

    this.space.update(t);
    this.composer.render();
  }
}
