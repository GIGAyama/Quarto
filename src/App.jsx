import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Swal from 'sweetalert2';
import confetti from 'canvas-confetti';
import { ErrorScreen } from './ErrorScreen.jsx';
import {
  BOARD_DIMENSION,
  CELL_SIZE,
  PIECES,
  createInitialGameState,
  checkWin
} from './game.js';

// この端末で 3D 表示（WebGL）が使えるか。
//
// three.js は使えないときに「Error creating WebGL context.」を投げるだけで、
// 「端末が古い」のか「設定で切られている」のかを教えてくれない。
// 例外を受けたあとにここで確かめて、利用者に出す文面を選び分ける。
function canUseWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return false;
    // ⚠️ 確かめただけの context も、端末が数えている「同時に持てる WebGL」の
    //    1つを占める。Android の安い端末はこの上限が小さく、放っておくと
    //    「調べただけ」で本番のぶんが作れなくなる。必ず手放す。
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/*
 * WebGL のレンダラを作る。断られたら、注文を減らしながら作り直す。
 *
 * ⚠️ 端末は「WebGL が使えるか」と「そのオプションで使えるか」を別々に答える。
 *    three.js の例外もそこを区別していて、
 *      Error creating WebGL context with your selected attributes.
 *    は「WebGL は使えるが、頼んだオプションが通らない」という意味である。
 *    Android では powerPreference: 'high-performance' や antialias が
 *    まさにこれで断られることがある。
 *
 * ⚠️ この2つは「あれば嬉しい」だけで、無くても遊べる。
 *    見た目のために盤面ごと出ないほうが、はるかに困る。
 *    断られたぶんを諦めて、いちばん素朴な注文まで下りる。
 *
 * ⚠️ canUseWebGL() で「使える」と出たのにここが全滅すると、利用者には
 *    🧩「うまく ひらけませんでした」しか出ず、原因が画面に残らない。
 *    2026-08-23 に Android で実際にそうなった。最後の例外は呼び出し元へ返し、
 *    先生向けの手がかりとして画面に出す。
 */
const RENDERER_OPTIONS = [
  // ふだんはこれ。いちばんきれいで速い
  { antialias: true, alpha: true, powerPreference: 'high-performance' },
  // GPU の選り好みをやめる
  { antialias: true, alpha: true },
  // 縁のなめらかさを諦める（memory の足りない端末で通ることがある）
  { antialias: false, alpha: true },
  // 型抜き用の面も要らないと伝える。いちばん軽い注文
  { antialias: false, alpha: true, stencil: false, depth: true }
];
// ⚠️ alpha はここを false にしても意味がない。three.js は透過を自前で扱うため、
//    端末へ渡す注文では alpha: true を決め打ちする（r152 以降）。
//    「alpha を諦める」段は作れないので、並べても嘘になる。

function createRenderer() {
  let lastError;
  for (const options of RENDERER_OPTIONS) {
    try {
      return new THREE.WebGLRenderer(options);
    } catch (err) {
      lastError = err;
      console.warn('[app] この注文では 3D を用意できませんでした', options, err);
    }
  }
  throw lastError;
}

// ==========================================
// 1. Sound Manager
// ==========================================
class SoundManager {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.3;
    this.masterGain.connect(this.ctx.destination);
    this.enabled = true; // ON/OFFフラグ
  }

  playTone(freq, type, duration, startTime = 0) {
    if (!this.enabled) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime + startTime);
    gain.gain.setValueAtTime(0, this.ctx.currentTime + startTime);
    gain.gain.linearRampToValueAtTime(1, this.ctx.currentTime + startTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + startTime + duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(this.ctx.currentTime + startTime);
    osc.stop(this.ctx.currentTime + startTime + duration);
  }

  playSelect() { this.playTone(400, 'sine', 0.1); this.playTone(600, 'sine', 0.1, 0.05); }
  playPlace() { this.playTone(800, 'triangle', 0.1); this.playTone(200, 'triangle', 0.2, 0.1); }
  playTurnChange() { this.playTone(523.25, 'sine', 0.1); this.playTone(659.25, 'sine', 0.1, 0.1); }
  playWin() {
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
      this.playTone(freq, 'triangle', 0.4, i * 0.1);
    });
  }
}

// パクパクゴブレットに合わせたプレイヤーカラー。
// 明るい色（P1 #ff7043 は白地で 2.76:1、P2 #42a5f5 は 2.30:1）をそのまま文字や記号に使うと
// Chromebook の安価な液晶では読めないため、「面用」と「文字用」の2段階を用意する。
// 面用は操作パネルの枠（#ffccbc / #bbdefb）として色の印象を保つ側に残してある。
const PLAYER_TEXT_COLORS = { 1: '#bf360c', 2: '#1565c0' };  // 文字・記号用（白地で 5.7:1 以上）

// 青のリンク・ボタン色。Google Material Blue 600 (#1a73e8) は白地でも
// 白抜きでも 4.27 しかなく、表にも裏にも届いていない。Blue 700 にすると両方 5.0 を超える。
const BLUE = '#1967d2';

// ==========================================
// 2. Three.js Game Engine Wrapper
// ==========================================
const CAMERA_FOV = 50;
const TAP_MAX_DISTANCE = 10;   // px: これ以上動いたらカメラ操作とみなす
const TAP_MAX_DURATION = 600;  // ms

class Game3DEngine {
  constructor(container, callbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xfff9c4, 0.02);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, width / height, 0.1, 100);
    this.camera.position.set(0, 18, 16);
    this.camera.lookAt(0, 0, 0);

    this.renderer = createRenderer();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    // デフォルトの影カメラは±5しかカバーせず、トレイ上のコマの影が切れるため拡張
    dirLight.shadow.camera.left = -14;
    dirLight.shadow.camera.right = 14;
    dirLight.shadow.camera.top = 14;
    dirLight.shadow.camera.bottom = -14;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 50;
    this.scene.add(dirLight);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.1;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 45;
    this.controls.enablePan = false;

    this.boardGroup = new THREE.Group();
    this.scene.add(this.boardGroup);
    this.piecesGroup = new THREE.Group();
    this.scene.add(this.piecesGroup);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.pieceMeshes = {};
    this.cellMeshes = [];
    this.currentState = null;
    this.isPortrait = false;
    this.pointerDownInfo = null;

    this.initBoardVisuals();
    this.initAllPieces();
    this.updateLayout(true);

    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.container.addEventListener('pointerdown', this.onPointerDown);
    this.container.addEventListener('pointerup', this.onPointerUp);

    this.animate = this.animate.bind(this);
    this.reqId = requestAnimationFrame(this.animate);
  }

  initBoardVisuals() {
    const boardSize = BOARD_DIMENSION * CELL_SIZE + 1;
    // 盤面の色をパクパクゴブレットの --board-bg (#8d6e63) に寄せる
    const geometry = new THREE.BoxGeometry(boardSize, 0.5, boardSize);
    const material = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.9 });
    const base = new THREE.Mesh(geometry, material);
    base.position.y = -0.25;
    base.receiveShadow = true;
    this.boardGroup.add(base);

    const cellGeo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE);
    // セルの色を --cell-bg (#fff3e0) 風に
    const cellMat = new THREE.MeshStandardMaterial({ color: 0xfff3e0, roughness: 0.5 });

    for (let r = 0; r < BOARD_DIMENSION; r++) {
      for (let c = 0; c < BOARD_DIMENSION; c++) {
        // 市松模様にするための調整 (オプション)
        const isDark = (r + c) % 2 === 1;
        const mat = cellMat.clone();
        if (isDark) mat.color.setHex(0xffe0b2);

        const cell = new THREE.Mesh(cellGeo, mat);
        cell.rotation.x = -Math.PI / 2;
        const x = (c - 1.5) * CELL_SIZE;
        const z = (r - 1.5) * CELL_SIZE;
        cell.position.set(x, 0.01, z);
        cell.receiveShadow = true;
        cell.userData = { type: 'cell', row: r, col: c };
        this.boardGroup.add(cell);
        this.cellMeshes.push(cell);
      }
    }
  }

  initAllPieces() {
    PIECES.forEach(data => {
      const isRound = data.shape === 'round';
      const isTall = data.height === 'tall';
      const isHollow = data.hole === 'hollow';
      const isLight = data.color === 'light';

      const h = isTall ? 2.0 : 1.2;
      const r = 0.7;

      let geo = isRound ? new THREE.CylinderGeometry(r, r, h, 32) : new THREE.BoxGeometry(r * 1.8, h, r * 1.8);
      const colorHex = isLight ? 0xfff8e1 : 0x4e342e;
      const mat = new THREE.MeshStandardMaterial({ color: colorHex });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.userData = { ...data, type: 'piece', originalColor: colorHex };

      if (isHollow) {
        const holeGeo = isRound ? new THREE.CylinderGeometry(r * 0.6, r * 0.6, 0.1, 32) : new THREE.BoxGeometry(r, 0.1, r);
        const holeMat = new THREE.MeshBasicMaterial({ color: 0x3e2723 });
        const holeMesh = new THREE.Mesh(holeGeo, holeMat);
        holeMesh.position.y = h / 2 + 0.01;
        mesh.add(holeMesh);
      }

      this.pieceMeshes[data.id] = mesh;
      this.piecesGroup.add(mesh);
    });
  }

  // 待機中のコマの置き場所（画面の向きに応じてレイアウトを切替）
  getTrayPosition(index, targetY) {
    if (this.isPortrait) {
      // 縦画面: 盤面の奥に2列で並べる（横幅を抑えて小さい画面でも見切れない）
      const row = index < 8 ? 0 : 1;
      const idx = index % 8;
      const x = (idx - 3.5) * 1.5;
      const z = -6.8 - row * 2.0;
      return new THREE.Vector3(x, targetY, z);
    }
    // 横画面: 盤面の左右に8個ずつ
    const isLeft = index < 8;
    const idx = index % 8;
    const z = (idx - 3.5) * 1.5;
    const x = isLeft ? -7 : 7;
    return new THREE.Vector3(x, targetY, z);
  }

  // 画面サイズ・向きに合わせてカメラとコマ配置を調整
  updateLayout(force = false) {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    const aspect = width / height;
    const wasPortrait = this.isPortrait;
    this.isPortrait = aspect < 1;

    if (force || wasPortrait !== this.isPortrait) {
      // 向きが変わったらカメラを定位置へ（縦画面はやや上から見下ろして奥のトレイを見やすく）
      if (this.isPortrait) {
        this.camera.position.set(0, 21, 13);
        this.controls.target.set(0, 0, -1.5);
      } else {
        this.camera.position.set(0, 18, 16);
        this.controls.target.set(0, 0, 0);
      }
      this.controls.update();
    }

    // 幅の狭い端末では、ゲーム領域全体が収まるようにズームアウト
    const baseDistance = 24;
    const contentHalfWidth = this.isPortrait ? 6.8 : 8.8;
    const halfFovTan = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2));
    const fitZoom = (baseDistance * halfFovTan * aspect) / contentHalfWidth;
    this.camera.zoom = THREE.MathUtils.clamp(fitZoom, 0.55, 1);

    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  syncState(state) {
    this.currentState = state;

    Object.values(this.pieceMeshes).forEach(mesh => {
      mesh.material.emissive.setHex(0x000000);
    });

    if (state.winLine) {
      state.winLine.forEach(pos => {
        const pid = state.board[pos.r][pos.c];
        if (pid !== null) {
          this.pieceMeshes[pid].material.emissive.setHex(0xffeb3b);
        }
      });
    }

    let availableCount = 0;
    PIECES.forEach(piece => {
      const pid = piece.id;
      const mesh = this.pieceMeshes[pid];
      const h = piece.height === 'tall' ? 2.0 : 1.2;
      const targetY = h / 2;

      let isOnBoard = false;
      for (let r = 0; r < BOARD_DIMENSION; r++) {
        for (let c = 0; c < BOARD_DIMENSION; c++) {
          if (state.board[r][c] === pid) {
            isOnBoard = true;
            const x = (c - 1.5) * CELL_SIZE;
            const z = (r - 1.5) * CELL_SIZE;

            if (mesh.userData.targetPosition && (mesh.userData.targetPosition.x !== x || mesh.userData.targetPosition.z !== z)) {
              mesh.position.set(x, targetY + 6, z);
            }
            mesh.userData.targetPosition = new THREE.Vector3(x, targetY, z);
            break;
          }
        }
        if (isOnBoard) break;
      }

      if (!isOnBoard) {
        if (state.pieceToPlace === pid) {
          mesh.userData.targetPosition = new THREE.Vector3(0, targetY + 3, 0);
        } else if (state.availablePieces.includes(pid)) {
          mesh.userData.targetPosition = this.getTrayPosition(availableCount, targetY);
          availableCount++;
        } else {
          mesh.userData.targetPosition = new THREE.Vector3(0, -10, 0);
        }
      }
    });
  }

  onPointerDown(event) {
    this.pointerDownInfo = {
      x: event.clientX,
      y: event.clientY,
      time: performance.now()
    };
  }

  // カメラ回転（ドラッグ）とタップを区別し、タップのときだけコマ選択・配置を行う
  onPointerUp(event) {
    const down = this.pointerDownInfo;
    this.pointerDownInfo = null;
    if (!down) return;
    if (!this.currentState || this.currentState.gameOver) return;

    const dx = event.clientX - down.x;
    const dy = event.clientY - down.y;
    if (Math.hypot(dx, dy) > TAP_MAX_DISTANCE) return;
    if (performance.now() - down.time > TAP_MAX_DURATION) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);

    if (this.currentState.currentPhase === 'SELECT') {
      const availableMeshes = this.currentState.availablePieces.map(id => this.pieceMeshes[id]);
      const intersects = this.raycaster.intersectObjects(availableMeshes, true);

      if (intersects.length > 0) {
        let target = intersects[0].object;
        while (target.parent !== this.piecesGroup && target.parent !== null) {
          if (target.userData.id !== undefined) break;
          target = target.parent;
        }
        if (target.userData.id !== undefined) {
          this.callbacks.onPieceSelect(target.userData.id);
        }
      }
    } else if (this.currentState.currentPhase === 'PLACE') {
      const emptyCells = this.cellMeshes.filter(m => this.currentState.board[m.userData.row][m.userData.col] === null);
      const intersects = this.raycaster.intersectObjects(emptyCells);

      if (intersects.length > 0) {
        const cell = intersects[0].object;
        const { row, col } = cell.userData;
        this.callbacks.onCellSelect(row, col);
      }
    }
  }

  onResize() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.updateLayout();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    // トレイのレイアウトが変わっている可能性があるので再同期
    if (this.currentState) this.syncState(this.currentState);
  }

  animate() {
    this.reqId = requestAnimationFrame(this.animate);
    this.controls.update();

    Object.values(this.pieceMeshes).forEach(mesh => {
      if (mesh.userData.targetPosition) {
        const target = mesh.userData.targetPosition;
        mesh.position.x = THREE.MathUtils.lerp(mesh.position.x, target.x, 0.15);
        mesh.position.z = THREE.MathUtils.lerp(mesh.position.z, target.z, 0.15);

        if (mesh.position.y > target.y + 0.1) {
          mesh.position.y -= 0.4;
          if (mesh.position.y < target.y) mesh.position.y = target.y;
        } else {
          mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, target.y, 0.15);
        }
      }
    });

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this.reqId);
    window.removeEventListener('resize', this.onResize);
    this.container.removeEventListener('pointerdown', this.onPointerDown);
    this.container.removeEventListener('pointerup', this.onPointerUp);
    this.controls.dispose();
    // GPUリソースを解放
    this.scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => m.dispose());
      }
    });
    this.renderer.dispose();
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

// ==========================================
// 3. React Main App Component
// ==========================================
const popupBaseConfig = {
  background: '#fff9c4',
  customClass: { popup: 'rounded-[20px] border-[5px] border-[#ffca28] font-zen-maru' }
};

// 紙吹雪の描き場所。
//
// ⚠️ canvas-confetti を素のまま呼んではいけない。理由が2つある。
//    1. 既定では blob: の Worker を作ろうとする。CSP の worker-src 'self' に
//       はじかれて、勝つたびにコンソールへ違反が出る（描画自体は本体側に落ちる）。
//    2. 既定の canvas は z-index 100 で、SweetAlert2 の 1060 より下になる。
//       「かち！」のポップアップと暗幕が全面を覆うので、紙吹雪は一枚も見えない。
//    自前の canvas をポップアップより上に置き、Worker を使わない設定で作る。
const CONFETTI_Z = 2000; // SweetAlert2 の 1060 より上
const createConfetti = () => {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    `position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:${CONFETTI_Z}`;
  document.body.appendChild(canvas);
  return {
    canvas,
    fire: confetti.create(canvas, { resize: true, useWorker: false })
  };
};

export default function App() {
  const mountRef = useRef(null);
  const engineRef = useRef(null);
  const confettiRef = useRef(null);
  const soundManagerRef = useRef(null);
  const soundEnabledRef = useRef(true);
  const gameStateRef = useRef(null);
  const callbacksRef = useRef({ onPieceSelect: () => {}, onCellSelect: () => {} });

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [gameState, setGameState] = useState(createInitialGameState);
  const [canInstall, setCanInstall] = useState(false);
  const [presentation, setPresentation] = useState(false);
  // 3D の盤面を用意できなかった理由。null なら問題なし。
  const [initError, setInitError] = useState(null);

  if (gameStateRef.current === null) {
    gameStateRef.current = gameState;
  }

  // インストールの合図は install-hook.js が <head> の先頭で受け取っている。
  // 案内できるときだけボタンを出す。出せないボタンを置いておくと
  // 「押しても何も起きない」と言われる。
  useEffect(() => {
    const isStandalone =
      matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    if (isStandalone) return;

    if (window.__pwaInstallPrompt) setCanInstall(true);
    const onAvailable = () => setCanInstall(true);
    const onInstalled = () => setCanInstall(false);
    window.addEventListener('pwa-install-available', onAvailable);
    window.addEventListener('pwa-installed', onInstalled);
    return () => {
      window.removeEventListener('pwa-install-available', onAvailable);
      window.removeEventListener('pwa-installed', onInstalled);
    };
  }, []);

  // 提示モード（電子黒板・一斉授業）。教室の後ろの席から読めるよう文字を大きくする。
  useEffect(() => {
    document.body.classList.toggle('presentation', presentation);
    return () => document.body.classList.remove('presentation');
  }, [presentation]);

  const handleInstall = async () => {
    const prompt = window.__pwaInstallPrompt;
    if (!prompt) return;
    window.__pwaInstallPrompt = null;
    setCanInstall(false);
    prompt.prompt();
    await prompt.userChoice;
  };

  const togglePresentation = async () => {
    const next = !presentation;
    setPresentation(next);
    try {
      if (next && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else if (!next && document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // 全画面表示を断られてもモードの切り替え自体は効かせる
    }
  };

  const getSoundManager = useCallback(() => {
    if (!soundManagerRef.current) soundManagerRef.current = new SoundManager();
    soundManagerRef.current.enabled = soundEnabledRef.current;
    return soundManagerRef.current;
  }, []);

  const applyGameState = useCallback((next) => {
    gameStateRef.current = next;
    setGameState(next);
  }, []);

  useEffect(() => {
    if (!engineRef.current && mountRef.current) {
      try {
        // エンジンには常に最新のハンドラを参照させる（stale closure対策）
        engineRef.current = new Game3DEngine(mountRef.current, {
          onPieceSelect: (pid) => callbacksRef.current.onPieceSelect(pid),
          onCellSelect: (row, col) => callbacksRef.current.onCellSelect(row, col)
        });
        engineRef.current.syncState(gameStateRef.current);
      } catch (err) {
        // ⚠️ ここで投げっぱなしにすると React が画面の木を丸ごと外し、
        //    利用者にはまっ白な画面しか残らない（原因を書く場所すら無くなる）。
        //    3D が用意できないことは分かっているので、事情を書いた画面に差し替える。
        console.error('[app] 3D の盤面を用意できませんでした', err);
        engineRef.current = null;
        // 何が起きたかを画面にも残す。ここが空だと、利用者から届くのは
        // 「エラー画面が出る」だけになり、原因の切り分けに何往復もかかる。
        setInitError({
          kind: canUseWebGL() ? 'unknown' : 'webgl',
          detail: err && err.message ? String(err.message) : String(err)
        });
      }
    }
    return () => {
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
      if (confettiRef.current) {
        confettiRef.current.fire.reset();
        confettiRef.current.canvas.remove();
        confettiRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.syncState(gameState);
    }
  }, [gameState]);

  const toggleSound = () => {
    const next = !soundEnabledRef.current;
    soundEnabledRef.current = next;
    setSoundEnabled(next);
    if (next) {
      getSoundManager().playSelect();
    }
  };

  const resetGame = useCallback(() => {
    applyGameState(createInitialGameState());
  }, [applyGameState]);

  const handlePieceSelect = useCallback((pid) => {
    const prev = gameStateRef.current;
    if (prev.gameOver || prev.currentPhase !== 'SELECT' || !prev.availablePieces.includes(pid)) return;

    getSoundManager().playSelect();

    const nextPlayer = prev.currentPlayer === 1 ? 2 : 1;
    applyGameState({
      ...prev,
      pieceToPlace: pid,
      availablePieces: prev.availablePieces.filter(id => id !== pid),
      currentPlayer: nextPlayer,
      currentPhase: 'PLACE'
    });

    setTimeout(() => {
      getSoundManager().playTurnChange();
      const pName = `プレイヤー${nextPlayer}`;
      const pColor = PLAYER_TEXT_COLORS[nextPlayer];
      Swal.fire({
        ...popupBaseConfig,
        title: `<span style="color:${pColor}" aria-hidden="true">●</span> ${pName} のばん`,
        html: `<p>渡されたコマを置いてね。</p><small style="color:#5d4037;">（盤面の好きなマスをタップ！）</small>`,
        timer: 1500,
        showConfirmButton: false,
        backdrop: `rgba(0,0,123,0.1)`
      });
    }, 50);
  }, [getSoundManager, applyGameState]);

  const handleCellSelect = useCallback((row, col) => {
    const prev = gameStateRef.current;
    if (prev.gameOver || prev.currentPhase !== 'PLACE' || prev.pieceToPlace === null) return;
    if (prev.board[row][col] !== null) return;

    getSoundManager().playPlace();

    const newBoard = prev.board.map((rArr, i) =>
      rArr.map((cVal, j) => (i === row && j === col) ? prev.pieceToPlace : cVal)
    );

    const winResult = checkWin(newBoard);

    if (winResult.isWin) {
      applyGameState({
        ...prev,
        board: newBoard,
        pieceToPlace: null,
        gameOver: true,
        winner: prev.currentPlayer,
        winLine: winResult.line
      });

      setTimeout(() => {
        getSoundManager().playWin();
        startConfetti();
        const pName = `プレイヤー${prev.currentPlayer}`;
        const pColor = PLAYER_TEXT_COLORS[prev.currentPlayer];
        Swal.fire({
          ...popupBaseConfig,
          title: `<span style="color:${pColor}">🎉 ${pName} のかち！ 🎉</span>`,
          html: '<p>おめでとう！ すごい<ruby>作戦<rt>さくせん</rt></ruby>だったね！</p>',
          icon: 'success',
          confirmButtonText: 'もう一回あそぶ！',
          customClass: {
            ...popupBaseConfig.customClass,
            confirmButton: 'pop-btn bg-[#1967d2] text-white rounded-full font-bold px-6 min-h-[44px] border-0'
          }
        }).then(() => resetGame());
      }, 1000);
    } else if (prev.availablePieces.length === 0) {
      applyGameState({ ...prev, board: newBoard, pieceToPlace: null, gameOver: true });

      setTimeout(() => {
        Swal.fire({
          ...popupBaseConfig,
          title: '引き分け！',
          text: '勝負つかず！',
          icon: 'info'
        }).then(() => resetGame());
      }, 500);
    } else {
      applyGameState({ ...prev, board: newBoard, pieceToPlace: null, currentPhase: 'SELECT' });
    }
  }, [getSoundManager, applyGameState, resetGame]);

  useEffect(() => {
    callbacksRef.current = { onPieceSelect: handlePieceSelect, onCellSelect: handleCellSelect };
  }, [handlePieceSelect, handleCellSelect]);

  const confirmReset = () => {
    getSoundManager().playSelect();
    Swal.fire({
      ...popupBaseConfig,
      title: 'やりなおす？',
      html: '<ruby>今<rt>いま</rt></ruby>の<ruby>勝負<rt>しょうぶ</rt></ruby>は なかったことになるよ',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'はい',
      cancelButtonText: 'いいえ',
      confirmButtonColor: '#c62828',
      cancelButtonColor: '#1565c0'
    }).then((result) => {
      if (result.isConfirmed) resetGame();
    });
  };

  const showRules = async () => {
    getSoundManager().playSelect();
    const iconBase = "width: 45px; height: 45px; display: inline-block; box-shadow: 2px 4px 6px rgba(0,0,0,0.2);";
    const popupConfig = {
      background: '#fff9c4',
      customClass: {
        popup: 'rounded-[20px] border-[5px] border-[#ffca28] font-zen-maru',
        confirmButton: 'pop-btn bg-[#1967d2] text-white rounded-full font-bold px-6 min-h-[44px] border-0'
      }
    };

    await Swal.fire({
      ...popupConfig,
      title: 'ルール1：形（かたち）',
      html: `
        <p class="font-bold text-[#5d4037]">同じ形を4つそろえよう！</p>
        <div class="flex justify-center items-center gap-6 my-4 bg-white/60 p-4 rounded-[15px]">
          <div style="${iconBase} border-radius:50%; background:#8d6e63;"></div>
          <div class="text-xl font-black text-[#5d4037]">または</div>
          <div style="${iconBase} border-radius:10%; background:#8d6e63;"></div>
        </div>
        <p class="font-bold text-[#5d4037]">丸 か 四角</p>
      `,
      confirmButtonText: 'つぎへ ▶'
    });

    await Swal.fire({
      ...popupConfig,
      title: 'ルール2：色（いろ）',
      html: `
        <p class="font-bold text-[#5d4037]">同じ色を4つそろえよう！</p>
        <div class="flex justify-center items-center gap-6 my-4 bg-white/60 p-4 rounded-[15px]">
          <div style="${iconBase} border-radius:50%; background:#fff8e1; border: 2px solid #8d6e63;"></div>
          <div class="text-xl font-black text-[#5d4037]">または</div>
          <div style="${iconBase} border-radius:50%; background:#4e342e;"></div>
        </div>
        <p class="font-bold text-[#5d4037]">白 か 黒</p>
      `,
      confirmButtonText: 'つぎへ ▶'
    });

    await Swal.fire({
      ...popupConfig,
      title: 'ルール3：高さ（たかさ）',
      html: `
        <p class="font-bold text-[#5d4037]">同じ高さを4つそろえよう！</p>
        <div class="flex justify-center items-center gap-6 my-4 bg-white/60 p-4 rounded-[15px]">
          <div style="${iconBase} height: 65px; background:#8d6e63; border-radius:5px;"></div>
          <div class="text-xl font-black text-[#5d4037]">または</div>
          <div style="${iconBase} height: 35px; background:#8d6e63; border-radius:5px;"></div>
        </div>
        <p class="font-bold text-[#5d4037]">高い か 低い</p>
      `,
      confirmButtonText: 'つぎへ ▶'
    });

    await Swal.fire({
      ...popupConfig,
      title: 'ルール4：穴（あな）',
      html: `
        <p class="font-bold text-[#5d4037]">最後のルール！穴はどうかな？</p>
        <div class="flex justify-center items-center gap-6 my-4 bg-white/60 p-4 rounded-[15px]">
          <div style="${iconBase} border-radius:50%; background:#8d6e63;"></div>
          <div class="text-xl font-black text-[#5d4037]">または</div>
          <div style="${iconBase} border-radius:50%; background: radial-gradient(circle, transparent 30%, #8d6e63 31%); border: 2px solid #8d6e63;"></div>
        </div>
        <p class="font-bold text-[#5d4037]">穴なし か 穴あり</p>
      `,
      confirmButtonText: 'わかった！',
      customClass: {
        ...popupConfig.customClass,
        confirmButton: 'pop-btn bg-[#2e7d32] text-white rounded-full font-bold px-6 min-h-[44px] border-0'
      }
    });
  };

  const startConfetti = () => {
    if (!confettiRef.current) confettiRef.current = createConfetti();
    const fire = confettiRef.current.fire;
    const duration = 3000;
    const end = Date.now() + duration;
    (function frame() {
      fire({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#ff7043', '#42a5f5', '#ffca28'] });
      fire({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#ff7043', '#42a5f5', '#ffca28'] });
      if (Date.now() < end) requestAnimationFrame(frame);
    }());
  };

  const bgStyle = {
    backgroundColor: '#fff9c4',
    backgroundImage: 'radial-gradient(#ffe082 20%, transparent 20%), radial-gradient(#ffe082 20%, transparent 20%)',
    backgroundPosition: '0 0, 25px 25px',
    backgroundSize: '50px 50px'
  };

  // ⚠️ この分岐は必ず全てのフックを呼んだあとに置く。
  //    先に return すると呼ばれるフックの数が回によって変わり、React が壊れる。
  if (initError) return <ErrorScreen kind={initError.kind} detail={initError.detail} />;

  return (
    <>
      {/* 画面全体を縦レイアウトで構築 (パクパクゴブレット方式) */}
      <div className="flex flex-col h-full w-full overflow-hidden font-zen-maru text-[#5d4037]" style={bgStyle}>

        {/* 3D レイヤー (背面に固定) */}
        <div ref={mountRef} className="absolute inset-0 z-0 touch-none" />

        {/* UI レイヤー (前面) */}
        <div className="absolute inset-0 z-10 flex flex-col pointer-events-none safe-x">

          {/* 1. ヘッダー (固定) */}
          <header className="safe-top flex justify-between items-center gap-2 py-2 px-3 bg-white/90 backdrop-blur-[5px] border-b-[3px] border-[#ffca28] shadow-sm pointer-events-auto flex-shrink-0">
            <div className="flex items-center min-w-0">
              <h1
                className="font-black m-0 drop-shadow-[2px_2px_0_rgba(255,255,255,1)] tracking-wide whitespace-nowrap"
                style={{ color: BLUE, fontSize: 'var(--fs-title)' }}
              >
                GIGAクアルト！
              </h1>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {canInstall && (
                <button
                  onClick={handleInstall}
                  aria-label="このアプリを端末にインストールする"
                  className="tap-44 pop-btn bg-gray-100 font-bold rounded-full px-3 h-9 shadow-sm border-0"
                  style={{ color: BLUE, fontSize: 'var(--fs-small)' }}
                >
                  <span aria-hidden="true">⬇</span> いれる
                </button>
              )}
              {/* 提示モードは電子黒板・教員PC向け。320px のスマホでは
                  ヘッダーが折り返して別の破綻を生むので、広い画面でだけ出す。 */}
              <button
                onClick={togglePresentation}
                aria-pressed={presentation}
                aria-label={presentation ? '提示モードをやめる' : '提示モード（大きく表示）にする'}
                className="tap-44 pop-btn hidden sm:flex bg-gray-100 font-bold rounded-full px-3 h-9 items-center shadow-sm border-0"
                style={{ color: BLUE, fontSize: 'var(--fs-small)' }}
              >
                <span aria-hidden="true">{presentation ? '🔳 もどす' : '🔲 大きく'}</span>
              </button>
              <button
                onClick={toggleSound}
                aria-pressed={soundEnabled}
                aria-label={soundEnabled ? 'サウンドをオフにする' : 'サウンドをオンにする'}
                className="tap-44 pop-btn bg-gray-100 font-bold rounded-full px-3 h-9 shadow-sm border-0"
                style={{ color: BLUE, fontSize: 'var(--fs-small)' }}
              >
                {soundEnabled ? '🔊 ON' : '🔇 OFF'}
              </button>
              <button
                onClick={showRules}
                aria-label="ルールを見る"
                className="tap-44 pop-btn bg-[#ffca28] text-[#5d4037] font-black rounded-full w-9 h-9 flex items-center justify-center shadow-sm text-lg border-0 p-0"
              >
                <span aria-hidden="true">？</span>
              </button>
            </div>
          </header>

          {/* 2. メインエリアの中間空間（3D操作を通すための余白） */}
          <div className="flex-1" />

          {/* 3. 操作パネル (画面下部・パクパクゴブレットの turn-info-container 相当) */}
          <div className="turn-panel-wrap w-full flex justify-center pb-2 pointer-events-none px-2">
            <div className="turn-panel pointer-events-auto bg-white/80 backdrop-blur-sm rounded-3xl shadow-md px-6 py-2.5 text-center flex flex-col items-center w-full max-w-sm border-2 transition-colors duration-300"
                 style={{ borderColor: gameState.currentPlayer === 1 ? '#ffccbc' : '#bbdefb' }}>

              <div
                className="font-bold text-[#5d4037] mb-1 flex items-center justify-center gap-2"
                style={{ fontSize: 'var(--fs-lead)' }}
              >
                <span style={{ color: PLAYER_TEXT_COLORS[gameState.currentPlayer] }} aria-hidden="true">●</span>
                プレイヤー{gameState.currentPlayer} のばん
              </div>

              {/* ステータスメッセージ。
                  いま何をすればよいかを伝える案内文なので、装飾ではなく本文として扱う。
                  opacity で薄くすると 4.5:1 を割るため使わない。
                  盤面の変化を目で追えない子にも届くよう aria-live で読み上げる。 */}
              <div className="font-medium mb-2" style={{ fontSize: 'var(--fs-body)' }} aria-live="polite">
                {gameState.gameOver ? (
                  <span className="text-[#bf360c] animate-pulse font-bold">ゲーム終了！</span>
                ) : gameState.currentPhase === 'SELECT' ? (
                  <><ruby>相手<rt>あいて</rt></ruby>に<ruby>渡<rt>わた</rt></ruby>すコマをえらんでね！</>
                ) : (
                  <>コマを好きな<ruby>場所<rt>ばしょ</rt></ruby>に<ruby>置<rt>お</rt></ruby>いてね！</>
                )}
              </div>

              <button
                onClick={confirmReset}
                className="tap-44 pop-btn border-2 border-[#c62828] text-[#c62828] bg-white font-bold rounded-full px-5 py-1.5 hover:bg-red-50"
                style={{ fontSize: 'var(--fs-small)' }}
              >
                <ruby>最初<rt>さいしょ</rt></ruby>から
              </button>
            </div>
          </div>

          {/* 4. フッター (固定) */}
          {/* リンクは既定だと 35×11px しかないので、tap-44 で当たり判定だけを広げる */}
          <footer className="app-footer safe-bottom text-center text-gray-600 py-1.5 border-t border-gray-200 bg-white pointer-events-auto flex-shrink-0">
            <small className="font-medium" style={{ fontSize: 'var(--fs-small)' }}>© 2026 GIGAクアルト！ <a href="https://giga-school.com" target="_blank" rel="noreferrer" className="tap-44 inline-block text-gray-600 no-underline hover:text-blue-700">GIGA山</a>{' '}<a href="https://giga-school.com/apps/quarto/" target="_blank" rel="noopener noreferrer" className="tap-44 inline-block text-gray-600 no-underline hover:text-blue-700">使い方を読む</a></small>
          </footer>
        </div>

      </div>
    </>
  );
}
