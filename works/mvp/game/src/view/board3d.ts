import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { goalRow } from '../board';
import type { GameState, Pos, WallSpec } from '../types';
import type { Rarity } from '../abilities';
import { CINEMA_SHADER, OUTLINE_COLOR, glowMaterial, makeGlowTexture, makeToonGradient, outlineMesh } from './fx';
import { IMPACT_TAIL_MS, impactFrame } from './impact';
import { cameraRig, cellToWorld, safeAreaFromInsets, wallToWorld, worldToBoard } from './layout';
import { createSpace } from './space';
import type { Space } from './space';

const BASE_FOV = 45;
const BASE_BLOOM = 0.38;
/** 黒縁の太さ（ワールドの長さ） */
const OUTLINE_PAWN = 0.045;
const OUTLINE_WALL = 0.035;

// 先手は黄色、後手は桃色。背景（青・紫）から離れた色にして、コマと自分のゴールを見やすくする
const PLAYER_COLORS = [0xffc928, 0xff4fb8] as const;
const WALL_LENGTH = 1.9;
const WALL_THICK = 0.1;
const WALL_HEIGHT = 0.5;
const WALL_COLOR = 0xffb04a;
/** 鉄壁（鋼の色）と、短い壁（水色）。置く前の予告（緑・赤）と区別するため、本物の壁の色を覚えておく */
const IRON_COLOR = 0xaab6cc;
const SHORT_COLOR = 0x5fe0ff;
const REAL_WALL_COLORS = new Set<number>([WALL_COLOR, IRON_COLOR, SHORT_COLOR]);
const SHORT_LENGTH = 0.92;

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
  private readonly meteorGroup = new THREE.Group();
  private readonly digitTextures = new Map<number, THREE.Texture>();
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
  private readonly shortWallGeo = {
    h: new THREE.BoxGeometry(SHORT_LENGTH, WALL_HEIGHT, WALL_THICK),
    v: new THREE.BoxGeometry(WALL_THICK, WALL_HEIGHT, SHORT_LENGTH),
  };
  private readonly toon = makeToonGradient();
  private readonly wallMats = new Map<string, { solid: THREE.MeshToonMaterial; halo: THREE.MeshBasicMaterial }>();
  private ghost: THREE.Group;
  private readonly container: HTMLElement;

  constructor(container: HTMLElement, size: number) {
    this.size = size;
    this.container = container;

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    this.space = createSpace(this.scene, this.renderer);
    this.scene.add(new THREE.AmbientLight(0xb8c4ff, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-6, 10, 6);
    this.scene.add(key);

    this.buildBoard();
    this.scene.add(this.wallGroup, this.markerGroup, this.meteorGroup);

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
          color = 0xffc21c;
          emissive = 0x8a4f00;
          opacity = 0.8; // 黄色は、青い背景に溶けやすいので、少し濃くする
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
    // 格子線は、アニメ調の太い黒線（マスの境目）
    const half = this.size / 2;
    const gridMat = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, toneMapped: false });
    const lineThick = 0.075;
    for (let i = 0; i <= this.size; i++) {
      const t = i - half;
      const across = new THREE.Mesh(new THREE.BoxGeometry(this.size, 0.012, lineThick), gridMat);
      across.position.set(0, 0.006, t);
      const down = new THREE.Mesh(new THREE.BoxGeometry(lineThick, 0.012, this.size), gridMat);
      down.position.set(t, 0.006, 0);
      this.scene.add(across, down);
    }
    // 縁は、太い黒縁の中に、細い光の線（光る表現は残す）
    const rimGlow = glowMaterial(0xbcd4ff, 0.95);
    const long = this.size + 0.2;
    for (const horizontal of [true, false]) {
      for (const side of [1, -1]) {
        const px = horizontal ? 0 : side * half;
        const pz = horizontal ? side * half : 0;
        const black = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? long : 0.2, 0.05, horizontal ? 0.2 : long), gridMat);
        black.position.set(px, 0, pz);
        const glow = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? long : 0.045, 0.02, horizontal ? 0.045 : long), rimGlow);
        glow.position.set(horizontal ? 0 : px - side * 0.04, 0.03, horizontal ? pz - side * 0.04 : 0);
        this.scene.add(black, glow);
      }
    }
  }

  /**
   * コマ。アニメ調: トゥーン（3 段の影）の球に、黒縁と、白いハイライト（光の点）。
   * 光る表現は残し、ぼんやりした暈（ハロ）と、回る輪（黒縁つき）を重ねる。
   */
  private makePawn(color: number): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 32, 22), new THREE.MeshToonMaterial({ color, gradientMap: this.toon }));
    const hull = outlineMesh(new THREE.SphereGeometry(0.26, 32, 22), OUTLINE_PAWN);
    // 左上に、白いハイライト（アニメの目のような光の点）
    const spot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    spot.position.set(-0.1, 0.12, 0.16);
    spot.scale.set(1.3, 0.8, 0.5);
    spot.rotation.z = 0.6;
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.glow, color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    halo.scale.set(1.5, 1.5, 1);
    const ringBlack = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.036, 8, 56), new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, toneMapped: false }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.016, 8, 56), glowMaterial(color, 1));
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.01, 8, 56), glowMaterial(color, 0.5));
    for (const r of [ringBlack, ring, ring2]) {
      r.rotation.x = Math.PI / 2;
      r.position.y = -0.27;
    }
    ring.position.y = -0.265;
    g.add(hull, body, spot, halo, ringBlack, ring, ring2);
    this.pawnRings.push(ringBlack, ring, ring2);
    return g;
  }

  /**
   * 壁。アニメ調: トゥーンの色の塊に黒縁。外側に、ぼんやり光る暈を重ねる（光る表現は残す）。
   * ghost（置く前の予告）は、半透明にする。
   */
  private makeWall(o: 'h' | 'v', color: number, short = false): THREE.Group {
    const ghost = !REAL_WALL_COLORS.has(color);
    const key = `${color}:${ghost}`;
    let mats = this.wallMats.get(key);
    if (!mats) {
      mats = {
        solid: new THREE.MeshToonMaterial({ color, gradientMap: this.toon, transparent: ghost, opacity: ghost ? 0.7 : 1 }),
        halo: glowMaterial(color, ghost ? 0.18 : 0.22),
      };
      this.wallMats.set(key, mats);
    }
    const geo = short ? this.shortWallGeo[o] : this.wallGeo[o];
    const g = new THREE.Group();
    const halo = new THREE.Mesh(geo, mats.halo);
    halo.scale.set(o === 'h' ? 1.05 : 3, 1.5, o === 'h' ? 3 : 1.05);
    g.add(outlineMesh(geo, color === IRON_COLOR ? OUTLINE_WALL * 1.6 : OUTLINE_WALL), new THREE.Mesh(geo, mats.solid), halo);
    return g;
  }

  /** 隕石の足もと: 赤い着弾の印（マスの赤み・黒い×・影）。浮き沈みせず、どこに落ちたかを示す */
  private makeMeteorGround(): THREE.Group {
    const g = new THREE.Group();
    const tint = new THREE.Mesh(
      new THREE.PlaneGeometry(0.92, 0.92),
      new THREE.MeshBasicMaterial({ color: 0xff3b1a, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false }),
    );
    tint.rotation.x = -Math.PI / 2;
    tint.position.y = 0.008;
    tint.renderOrder = 3;
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 28),
      new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    shadow.renderOrder = 4;
    const cross = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, toneMapped: false });
    for (const angle of [Math.PI / 4, -Math.PI / 4]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.012, 0.075), cross);
      bar.rotation.y = angle;
      bar.position.y = 0.016;
      g.add(bar);
    }
    g.add(tint, shadow);
    return g;
  }

  /** 残りの回数の数字（縁取りつき）の画像。同じ数字は使い回す */
  private digitTexture(n: number): THREE.Texture {
    let tex = this.digitTextures.get(n);
    if (!tex) {
      const c = document.createElement('canvas');
      c.width = c.height = 96;
      const g = c.getContext('2d');
      if (g) {
        g.font = '900 78px sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineJoin = 'round';
        g.lineWidth = 14;
        g.strokeStyle = '#05030f';
        g.strokeText(String(n), 48, 52);
        g.fillStyle = '#fff';
        g.fillText(String(n), 48, 52);
      }
      tex = new THREE.CanvasTexture(c);
      this.digitTextures.set(n, tex);
    }
    return tex;
  }

  /** 隕石（通行不可のマス）。黒縁つきの岩と、赤い暈、残りの回数の数字 */
  private makeMeteor(turnsLeft: number): THREE.Group {
    const g = new THREE.Group();
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), new THREE.MeshToonMaterial({ color: 0xff7a3a, gradientMap: this.toon }));
    rock.add(outlineMesh(new THREE.IcosahedronGeometry(0.34, 0), 0.05));
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.glow, color: 0xff4a1a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    halo.scale.set(1.3, 1.3, 1);
    const digit = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.digitTexture(turnsLeft), transparent: true, depthTest: false }));
    digit.scale.set(0.5, 0.5, 1);
    digit.position.y = 0.72;
    g.add(halo, rock, digit);
    g.userData['rock'] = rock;
    return g;
  }

  private placeWall(obj: THREE.Object3D, wall: WallSpec): void {
    const w = wallToWorld(this.size, wall.x, wall.y);
    // 短い壁は、交点の中心から、ふさぐ 1 マスの中心へ、半マスずらす
    const shift = wall.half === undefined ? 0 : wall.half === 0 ? -0.5 : 0.5;
    obj.position.set(w.x + (wall.o === 'h' ? shift : 0), WALL_HEIGHT / 2, w.z + (wall.o === 'v' ? shift : 0));
  }

  /** 状態を描き直す。legalMoves は、動けるマスの目印 */
  setState(state: GameState, legalMoves: readonly Pos[]): void {
    this.wallGroup.clear();
    for (const wall of state.walls) {
      const short = wall.half !== undefined;
      const obj = this.makeWall(wall.o, wall.iron ? IRON_COLOR : short ? SHORT_COLOR : WALL_COLOR, short);
      this.placeWall(obj, wall);
      this.wallGroup.add(obj);
    }
    for (let p = 0; p < 2; p++) {
      const pos = state.pawns[p as 0 | 1];
      const w = cellToWorld(this.size, pos.x, pos.y);
      (this.pawnTargets[p] as THREE.Vector3).set(w.x, 0.34, w.z);
    }
    this.meteorGroup.clear();
    for (const m of state.meteors) {
      const w = cellToWorld(this.size, m.x, m.y);
      const ground = this.makeMeteorGround(); // 足もとの着弾の印（動かない）
      ground.position.set(w.x, 0, w.z);
      const meteor = this.makeMeteor(m.turnsLeft);
      meteor.position.set(w.x, 0.36, w.z);
      this.meteorGroup.add(ground, meteor);
    }
    this.markerGroup.clear();
    const color = PLAYER_COLORS[state.turn] as number;
    for (const m of legalMoves) {
      // 動ける先の目印: 黒縁つきの色の輪
      const marker = new THREE.Group();
      const black = new THREE.Mesh(new THREE.RingGeometry(0.19, 0.31, 40), new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.DoubleSide, toneMapped: false }));
      const colored = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.28, 40), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, toneMapped: false }));
      colored.position.z = 0.002; // 回した後の上向き（ワールドの y）が、輪の局所の z
      marker.add(black, colored);
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
    this.ghost = this.makeWall(wall.o, valid ? 0x4dff9a : 0xff4d4d, wall.half !== undefined);
    this.placeWall(this.ghost, wall);
    this.scene.add(this.ghost);
  }

  /** 盤の上の位置（ワールドの x, z）が、画面のどこに見えるか（画面の左上からの px）。擬音を出す位置に使う */
  project(wx: number, wz: number): { x: number; y: number } {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3(wx, 0.3, wz).project(this.camera);
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
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

  /** 画面の上・下に出ている表示の高さ（ピクセル）を返す関数。盤が、それに被らない範囲に収まるようにする */
  private insets: (() => { top: number; bottom: number }) | undefined;

  setInsets(fn: () => { top: number; bottom: number }): void {
    this.insets = fn; // 呼び出し側の表示が整ってから、relayout() で反映する
  }

  /** 表示の大きさが変わったとき（手札の枚数、メッセージなど）に、盤の位置を計算し直す */
  relayout(): void {
    this.resize();
  }

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    // 盤が、画面の安全な範囲（上の表示と下の手札・ボタンを避けた所）いっぱいに収まるように、距離と位置を計算で決める
    const insets = this.insets?.();
    const safe = insets === undefined ? undefined : safeAreaFromInsets(this.camera.aspect, h, insets.top, insets.bottom);
    const rig = cameraRig(this.camera.aspect, this.size, safe);
    const shiftPx = Math.round((rig.shiftNdc * h) / 2);
    if (shiftPx !== 0) this.camera.setViewOffset(w, h, 0, shiftPx, w, h);
    else this.camera.clearViewOffset();
    this.basePos.set(rig.pos[0], rig.pos[1], rig.pos[2]);
    this.camera.position.copy(this.basePos);
    this.camera.lookAt(rig.target[0], rig.target[1], rig.target[2]);
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
    // 隕石は、ゆっくり回って、少し浮き沈みする
    for (const m of this.meteorGroup.children) {
      const rock = m.userData['rock'] as THREE.Object3D | undefined;
      if (!rock) continue; // 足もとの印は動かさない
      m.position.y = 0.36 + Math.sin(t / 420) * 0.05;
      rock.rotation.y = t / 700;
    }

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
