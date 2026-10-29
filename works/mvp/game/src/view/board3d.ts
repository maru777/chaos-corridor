import * as THREE from 'three';
import { goalRow } from '../board';
import type { GameState, Pos, Wall } from '../types';
import { cellToWorld, wallToWorld, worldToBoard } from './layout';

const PLAYER_COLORS = [0x38d9ff, 0xff4fb8] as const;
const WALL_LENGTH = 1.9;
const WALL_THICK = 0.14;
const WALL_HEIGHT = 0.55;

export interface BoardPoint {
  readonly bx: number;
  readonly by: number;
}

/** 3D 盤面の描画だけを受け持つ。ルールは持たない（状態を渡されて描くだけ） */
export class BoardView {
  private readonly size: number;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly wallGroup = new THREE.Group();
  private readonly markerGroup = new THREE.Group();
  private readonly pawns: THREE.Mesh[] = [];
  private readonly pawnTargets: THREE.Vector3[] = [];
  private readonly stars: THREE.Points;
  private ghost: THREE.Mesh;
  private readonly container: HTMLElement;

  constructor(container: HTMLElement, size: number) {
    this.size = size;
    this.container = container;

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x02030a);
    this.scene.fog = new THREE.Fog(0x02030a, 25, 70);
    this.scene.add(new THREE.AmbientLight(0x6070a0, 0.9));
    const key = new THREE.PointLight(0xaaccff, 90, 60);
    key.position.set(0, 12, 4);
    this.scene.add(key);

    this.buildBoard();
    this.stars = this.buildStars();
    this.scene.add(this.stars, this.wallGroup, this.markerGroup);

    for (let p = 0; p < 2; p++) {
      const color = PLAYER_COLORS[p] as number;
      const pawn = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 32, 24),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.3 }),
      );
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.4, 0.04, 12, 40),
        new THREE.MeshBasicMaterial({ color }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -0.22;
      pawn.add(ring);
      pawn.position.y = 0.34;
      this.pawns.push(pawn);
      this.pawnTargets.push(pawn.position.clone());
      this.scene.add(pawn);
    }

    this.ghost = this.makeWallMesh('h', 0xffffff);
    this.ghost.visible = false;
    (this.ghost.material as THREE.MeshStandardMaterial).transparent = true;
    (this.ghost.material as THREE.MeshStandardMaterial).opacity = 0.6;
    this.scene.add(this.ghost);

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  private buildBoard(): void {
    const tileGeo = new THREE.BoxGeometry(0.92, 0.1, 0.92);
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        let color = 0x141a38;
        let emissive = 0x0a1030;
        if (y === goalRow(this.size, 0)) {
          color = 0x0d3a4d;
          emissive = 0x0b4a63;
        } else if (y === goalRow(this.size, 1)) {
          color = 0x4d0d3a;
          emissive = 0x630b4a;
        }
        const tile = new THREE.Mesh(tileGeo, new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.5, metalness: 0.4 }));
        const w = cellToWorld(this.size, x, y);
        tile.position.set(w.x, -0.05, w.z);
        this.scene.add(tile);
      }
    }
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(this.size + 0.6, 0.12, this.size + 0.6),
      new THREE.MeshStandardMaterial({ color: 0x080c20, emissive: 0x101a48, roughness: 0.8 }),
    );
    frame.position.y = -0.14;
    this.scene.add(frame);
  }

  private buildStars(): THREE.Points {
    const count = 900;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 40 + Math.random() * 40;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = Math.abs(r * Math.cos(phi)) * 0.8 - 6;
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xcfe0ff, size: 0.35, sizeAttenuation: true, fog: false }));
  }

  private makeWallMesh(o: 'h' | 'v', color: number): THREE.Mesh {
    const geo = o === 'h' ? new THREE.BoxGeometry(WALL_LENGTH, WALL_HEIGHT, WALL_THICK) : new THREE.BoxGeometry(WALL_THICK, WALL_HEIGHT, WALL_LENGTH);
    return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, roughness: 0.3 }));
  }

  private placeWall(mesh: THREE.Mesh, wall: Wall): void {
    const w = wallToWorld(this.size, wall.x, wall.y);
    mesh.position.set(w.x, WALL_HEIGHT / 2, w.z);
  }

  /** 状態を描き直す。legalMoves は、動けるマスの目印 */
  setState(state: GameState, legalMoves: readonly Pos[]): void {
    this.wallGroup.clear();
    for (const wall of state.walls) {
      const mesh = this.makeWallMesh(wall.o, 0xffb347);
      this.placeWall(mesh, wall);
      this.wallGroup.add(mesh);
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
        new THREE.RingGeometry(0.2, 0.32, 32),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
      );
      marker.rotation.x = -Math.PI / 2;
      const w = cellToWorld(this.size, m.x, m.y);
      marker.position.set(w.x, 0.02, w.z);
      this.markerGroup.add(marker);
    }
  }

  /** 壁の置き場所の予告。null で消す */
  setGhost(wall: Wall | null, valid: boolean): void {
    if (wall === null) {
      this.ghost.visible = false;
      return;
    }
    this.scene.remove(this.ghost);
    this.ghost.geometry.dispose();
    (this.ghost.material as THREE.Material).dispose();
    this.ghost = this.makeWallMesh(wall.o, valid ? 0x4dff9a : 0xff4d4d);
    const mat = this.ghost.material as THREE.MeshStandardMaterial;
    mat.transparent = true;
    mat.opacity = 0.6;
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
    this.camera.aspect = w / h;
    // 縦長の画面（スマホ）では、盤が横幅いっぱいに収まるようにカメラを引き、真上に近い角度にして押しやすくする
    const portrait = this.camera.aspect < 1;
    const k = Math.max(1, 0.92 / this.camera.aspect);
    this.camera.position.set(0, (portrait ? 11.5 : 9.5) * k, (portrait ? 6 : 10) * k);
    this.camera.lookAt(0, 0, 0.3);
    this.camera.updateProjectionMatrix();
  }

  private frame(time: number): void {
    for (let p = 0; p < 2; p++) {
      const pawn = this.pawns[p] as THREE.Mesh;
      pawn.position.lerp(this.pawnTargets[p] as THREE.Vector3, 0.2);
      pawn.position.y = 0.34 + Math.sin(time / 500 + p * 2) * 0.04;
    }
    const pulse = 1 + Math.sin(time / 250) * 0.12;
    for (const m of this.markerGroup.children) m.scale.setScalar(pulse);
    this.stars.rotation.y = time / 200000;
    this.renderer.render(this.scene, this.camera);
  }
}
