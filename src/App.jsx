import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ==========================================
// 1. Game Constants & Data Definition
// ==========================================
const BOARD_DIMENSION = 4;
const CELL_SIZE = 2;
const PIECES = [];

// パクパクゴブレットに合わせたプレイヤーカラー
const PLAYER_COLORS = { 1: '#ff7043', 2: '#42a5f5' }; 

// 全16種類のコマを生成
let idCounter = 0;
for (const color of ['light', 'dark']) {
  for (const height of ['short', 'tall']) {
    for (const shape of ['round', 'square']) {
      for (const hole of ['solid', 'hollow']) {
        PIECES.push({ id: idCounter++, color, height, shape, hole });
      }
    }
  }
}

// 勝利判定ロジック
const checkWin = (currentBoard) => {
  const lines = [];
  
  // 縦・横のライン
  for (let i = 0; i < 4; i++) {
    lines.push([{ r: i, c: 0 }, { r: i, c: 1 }, { r: i, c: 2 }, { r: i, c: 3 }]);
    lines.push([{ r: 0, c: i }, { r: 1, c: i }, { r: 2, c: i }, { r: 3, c: i }]);
  }
  
  // 斜めのライン
  lines.push([{ r: 0, c: 0 }, { r: 1, c: 1 }, { r: 2, c: 2 }, { r: 3, c: 3 }]);
  lines.push([{ r: 0, c: 3 }, { r: 1, c: 2 }, { r: 2, c: 1 }, { r: 3, c: 0 }]);

  // ※ ここにあった「2x2の正方形」を勝利とするロジックを削除しました

  for (const line of lines) {
    const pIds = line.map(p => currentBoard[p.r][p.c]);
    if (pIds.includes(null)) continue;
    
    const pObjs = pIds.map(id => PIECES.find(p => p.id === id));
    const attrs = ['color', 'height', 'shape', 'hole'];
    
    for (const attr of attrs) {
      const val = pObjs[0][attr];
      if (pObjs.every(p => p[attr] === val)) {
        return { isWin: true, line: line, attr: attr };
      }
    }
  }
  return { isWin: false };
};

// ==========================================
// 2. Sound Manager
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

// ==========================================
// 3. Three.js Game Engine Wrapper
// ==========================================
class Game3DEngine {
  constructor(container, callbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xfff9c4, 0.02);

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 18, 16);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    this.scene.add(dirLight);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.1;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 40;

    this.boardGroup = new THREE.Group();
    this.scene.add(this.boardGroup);
    this.piecesGroup = new THREE.Group();
    this.scene.add(this.piecesGroup);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.pieceMeshes = {};
    this.cellMeshes = [];
    this.currentState = null;

    this.initBoardVisuals();
    this.initAllPieces();

    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.container.addEventListener('pointerdown', this.onPointerDown);

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
        if(isDark) mat.color.setHex(0xffe0b2);

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
      
      let geo = isRound ? new THREE.CylinderGeometry(r, r, h, 32) : new THREE.BoxGeometry(r*1.8, h, r*1.8);
      const colorHex = isLight ? 0xfff8e1 : 0x4e342e; 
      const mat = new THREE.MeshStandardMaterial({ color: colorHex });
      
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.userData = { ...data, type: 'piece', originalColor: colorHex };

      if (isHollow) {
        const holeGeo = isRound ? new THREE.CylinderGeometry(r*0.6, r*0.6, 0.1, 32) : new THREE.BoxGeometry(r, 0.1, r);
        const holeMat = new THREE.MeshBasicMaterial({ color: 0x3e2723 });
        const holeMesh = new THREE.Mesh(holeGeo, holeMat);
        holeMesh.position.y = h/2 + 0.01;
        mesh.add(holeMesh);
      }
      
      this.pieceMeshes[data.id] = mesh;
      this.piecesGroup.add(mesh);
    });
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
      }

      if (!isOnBoard) {
        if (state.pieceToPlace === pid) {
          mesh.userData.targetPosition = new THREE.Vector3(0, targetY + 3, 0);
        } else if (state.availablePieces.includes(pid)) {
          const isLeft = availableCount < 8;
          const idx = availableCount % 8;
          const z = (idx - 3.5) * 1.5;
          const x = isLeft ? -7 : 7; // 端に寄せる
          mesh.userData.targetPosition = new THREE.Vector3(x, targetY, z);
          availableCount++;
        } else {
           mesh.userData.targetPosition = new THREE.Vector3(0, -10, 0);
        }
      }
    });
  }

  onPointerDown(event) {
    if (!this.currentState || this.currentState.gameOver) return;
    
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    this.raycaster.setFromCamera(this.pointer, this.camera);

    if (this.currentState.currentPhase === 'SELECT') {
      const availableMeshes = this.currentState.availablePieces.map(id => this.pieceMeshes[id]);
      const intersects = this.raycaster.intersectObjects(availableMeshes, true);
      
      if (intersects.length > 0) {
        let target = intersects[0].object;
        while(target.parent !== this.piecesGroup && target.parent !== null) {
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
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
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
    this.renderer.dispose();
    if(this.container.contains(this.renderer.domElement)) {
        this.container.removeChild(this.renderer.domElement);
    }
  }
}

// ==========================================
// 4. React Main App Component
// ==========================================
export default function App() {
  const mountRef = useRef(null);
  const engineRef = useRef(null);
  const soundManagerRef = useRef(null);

  const [soundEnabled, setSoundEnabled] = useState(true);

  // 外部ライブラリの動的読み込み用
  useEffect(() => {
    const loadLib = (src) => {
      if (!document.querySelector(`script[src="${src}"]`)) {
        const script = document.createElement('script');
        script.src = src;
        document.body.appendChild(script);
      }
    };
    loadLib('https://cdn.jsdelivr.net/npm/sweetalert2@11');
    loadLib('https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js');
  }, []);

  const initialGameState = {
    board: Array(4).fill(null).map(() => Array(4).fill(null)),
    availablePieces: PIECES.map(p => p.id),
    pieceToPlace: null,
    currentPlayer: 1, // 1=Orange(P1), 2=Blue(P2)
    currentPhase: 'SELECT',
    gameOver: false,
    winner: null,
    winLine: null
  };

  const [gameState, setGameState] = useState(initialGameState);

  const getSoundManager = useCallback(() => {
    if (!soundManagerRef.current) soundManagerRef.current = new SoundManager();
    soundManagerRef.current.enabled = soundEnabled;
    return soundManagerRef.current;
  }, [soundEnabled]);

  useEffect(() => {
    if (!engineRef.current && mountRef.current) {
      engineRef.current = new Game3DEngine(mountRef.current, {
        onPieceSelect: handlePieceSelect,
        onCellSelect: handleCellSelect
      });
      engineRef.current.syncState(initialGameState);
    }
    return () => {
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.syncState(gameState);
    }
  }, [gameState]);

  const toggleSound = () => {
    setSoundEnabled(prev => !prev);
    if (!soundEnabled && soundManagerRef.current) {
       soundManagerRef.current.enabled = true;
       soundManagerRef.current.playSelect();
    }
  };

  const handlePieceSelect = useCallback((pid) => {
    getSoundManager().playSelect();
    
    setGameState(prev => {
      const nextPlayer = prev.currentPlayer === 1 ? 2 : 1;
      const newAvailable = prev.availablePieces.filter(id => id !== pid);
      
      setTimeout(() => {
        getSoundManager().playTurnChange();
        const pName = `プレイヤー${nextPlayer}`;
        const pColor = PLAYER_COLORS[nextPlayer];
        if (window.Swal) {
          window.Swal.fire({
            title: `<span style="color:${pColor}">●</span> ${pName} のばん`,
            html: `<p>渡されたコマを置いてね。</p><small style="color:#8d6e63;">（盤面の好きなマスをタップ！）</small>`,
            timer: 1500,
            showConfirmButton: false,
            backdrop: `rgba(0,0,123,0.1)`,
            background: '#fff9c4', // パクパクゴブレット風背景
            customClass: { popup: 'rounded-[20px] border-[5px] border-[#ffca28] font-zen-maru' }
          });
        }
      }, 50);

      return {
        ...prev,
        pieceToPlace: pid,
        availablePieces: newAvailable,
        currentPlayer: nextPlayer,
        currentPhase: 'PLACE'
      };
    });
  }, [getSoundManager]);

  const handleCellSelect = useCallback((row, col) => {
    getSoundManager().playPlace();

    setGameState(prev => {
      const newBoard = prev.board.map((rArr, i) => 
        rArr.map((cVal, j) => (i === row && j === col) ? prev.pieceToPlace : cVal)
      );
      
      const winResult = checkWin(newBoard);
      
      if (winResult.isWin) {
         setTimeout(() => {
            getSoundManager().playWin();
            startConfetti();
            const pName = `プレイヤー${prev.currentPlayer}`;
            const pColor = PLAYER_COLORS[prev.currentPlayer];
            if (window.Swal) {
              window.Swal.fire({
                title: `<span style="color:${pColor}">🎉 ${pName} のかち！ 🎉</span>`,
                html: '<p>おめでとう！ すごい<ruby>作戦<rt>さくせん</rt></ruby>だったね！</p>',
                icon: 'success',
                confirmButtonText: 'もう一回あそぶ！',
                background: '#fff9c4',
                customClass: { 
                  popup: 'rounded-[20px] border-[5px] border-[#ffca28] font-zen-maru',
                  confirmButton: 'pop-btn bg-[#1a73e8] text-white rounded-full font-bold px-6 py-2 border-0'
                }
              }).then(() => resetGame());
            } else {
              alert(`クアルト！！ おめでとう！ ${pName} の勝ち！`);
              resetGame();
            }
         }, 1000);

         return {
           ...prev, board: newBoard, pieceToPlace: null, gameOver: true, winner: prev.currentPlayer, winLine: winResult.line
         };
      } else if (prev.availablePieces.length === 0) {
         setTimeout(() => {
            if (window.Swal) {
              window.Swal.fire({
                title: '引き分け！', 
                text: '勝負つかず！', 
                icon: 'info',
                background: '#fff9c4',
                customClass: { popup: 'rounded-[20px] border-[5px] border-[#ffca28] font-zen-maru' }
              }).then(() => resetGame());
            } else {
              alert('引き分け！ 勝負つかず！');
              resetGame();
            }
         }, 500);
         return { ...prev, board: newBoard, pieceToPlace: null, gameOver: true };
      } else {
         return { ...prev, board: newBoard, pieceToPlace: null, currentPhase: 'SELECT' };
      }
    });
  }, [getSoundManager]);

  const resetGame = () => {
    setGameState(initialGameState);
  };

  const confirmReset = () => {
    getSoundManager().playSelect();
    if (window.Swal) {
      window.Swal.fire({
        title: 'やりなおす？',
        html: '<ruby>今<rt>いま</rt></ruby>の<ruby>勝負<rt>しょうぶ</rt></ruby>は なかったことになるよ',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'はい',
        cancelButtonText: 'いいえ',
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        background: '#fff9c4',
        customClass: { popup: 'rounded-[20px] border-[5px] border-[#ffca28] font-zen-maru' }
      }).then((result) => {
        if (result.isConfirmed) resetGame();
      });
    } else {
      if (window.confirm('リセットしますか？今のゲームは終わってしまいます。')) resetGame();
    }
  };

  const showRules = async () => {
    getSoundManager().playSelect();
    if (!window.Swal) {
      alert("ルールを読み込んでいます。もう一度お試しください。");
      return;
    }
    const iconBase = "width: 45px; height: 45px; display: inline-block; box-shadow: 2px 4px 6px rgba(0,0,0,0.2);";
    const popupConfig = {
      background: '#fff9c4',
      customClass: { 
        popup: 'rounded-[20px] border-[5px] border-[#ffca28] font-zen-maru',
        confirmButton: 'pop-btn bg-[#1a73e8] text-white rounded-full font-bold px-6 py-2 border-0'
      }
    };
    
    await window.Swal.fire({
      ...popupConfig,
      title: 'ルール1：形（かたち）',
      html: `
        <p class="font-bold text-[#5d4037]">同じ形を4つそろえよう！</p>
        <div class="flex justify-center items-center gap-6 my-4 bg-white/60 p-4 rounded-[15px]">
          <div style="${iconBase} border-radius:50%; background:#8d6e63;"></div>
          <div class="text-xl font-black text-[#bcaaa4]">または</div>
          <div style="${iconBase} border-radius:10%; background:#8d6e63;"></div>
        </div>
        <p class="font-bold text-[#5d4037]">丸 か 四角</p>
      `,
      confirmButtonText: 'つぎへ ▶'
    });

    await window.Swal.fire({
      ...popupConfig,
      title: 'ルール2：色（いろ）',
      html: `
        <p class="font-bold text-[#5d4037]">同じ色を4つそろえよう！</p>
        <div class="flex justify-center items-center gap-6 my-4 bg-white/60 p-4 rounded-[15px]">
          <div style="${iconBase} border-radius:50%; background:#fff8e1; border: 2px solid #8d6e63;"></div>
          <div class="text-xl font-black text-[#bcaaa4]">または</div>
          <div style="${iconBase} border-radius:50%; background:#4e342e;"></div>
        </div>
        <p class="font-bold text-[#5d4037]">白 か 黒</p>
      `,
      confirmButtonText: 'つぎへ ▶'
    });

    await window.Swal.fire({
      ...popupConfig,
      title: 'ルール3：高さ（たかさ）',
      html: `
        <p class="font-bold text-[#5d4037]">同じ高さを4つそろえよう！</p>
        <div class="flex justify-center items-center gap-6 my-4 bg-white/60 p-4 rounded-[15px]">
          <div style="${iconBase} height: 65px; background:#8d6e63; border-radius:5px;"></div>
          <div class="text-xl font-black text-[#bcaaa4]">または</div>
          <div style="${iconBase} height: 35px; background:#8d6e63; border-radius:5px;"></div>
        </div>
        <p class="font-bold text-[#5d4037]">高い か 低い</p>
      `,
      confirmButtonText: 'つぎへ ▶'
    });
    
    await window.Swal.fire({
      ...popupConfig,
      title: 'ルール4：穴（あな）',
      html: `
        <p class="font-bold text-[#5d4037]">最後のルール！穴はどうかな？</p>
        <div class="flex justify-center items-center gap-6 my-4 bg-white/60 p-4 rounded-[15px]">
          <div style="${iconBase} border-radius:50%; background:#8d6e63;"></div>
          <div class="text-xl font-black text-[#bcaaa4]">または</div>
          <div style="${iconBase} border-radius:50%; background: radial-gradient(circle, transparent 30%, #8d6e63 31%); border: 2px solid #8d6e63;"></div>
        </div>
        <p class="font-bold text-[#5d4037]">穴なし か 穴あり</p>
      `,
      confirmButtonText: 'わかった！',
      customClass: { 
        ...popupConfig.customClass,
        confirmButton: 'pop-btn bg-[#4caf50] text-white rounded-full font-bold px-6 py-2 border-0'
      }
    });
  };

  const startConfetti = () => {
    if (typeof window.confetti !== 'undefined') {
      const duration = 3000;
      const end = Date.now() + duration;
      (function frame() {
        window.confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#ff7043', '#42a5f5', '#ffca28'] });
        window.confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#ff7043', '#42a5f5', '#ffca28'] });
        if (Date.now() < end) requestAnimationFrame(frame);
      }());
    }
  };

  const bgStyle = {
    backgroundColor: '#fff9c4',
    backgroundImage: 'radial-gradient(#ffe082 20%, transparent 20%), radial-gradient(#ffe082 20%, transparent 20%)',
    backgroundPosition: '0 0, 25px 25px',
    backgroundSize: '50px 50px'
  };

  return (
    <>
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@500;700;900&display=swap');
          .font-zen-maru { font-family: 'Zen Maru Gothic', sans-serif; }
          ruby { ruby-position: over; }
          rt { font-size: 0.65em; color: #8d6e63; font-weight: 500; }
          
          /* パクパクゴブレット風 ポップボタンアニメーション */
          .pop-btn {
            transition: transform 0.1s, box-shadow 0.1s;
          }
          .pop-btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 5px 10px rgba(0,0,0,0.15);
          }
          .pop-btn:active {
            transform: scale(0.92);
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
          }
        `}
      </style>

      {/* 画面全体を縦レイアウトで構築 (パクパクゴブレット方式) */}
      <div className="flex flex-col h-screen w-screen overflow-hidden font-zen-maru text-[#5d4037]" style={bgStyle}>
        
        {/* 3D レイヤー (背面に固定) */}
        <div ref={mountRef} className="absolute inset-0 z-0 touch-none" />

        {/* UI レイヤー (前面) */}
        <div className="absolute inset-0 z-10 flex flex-col pointer-events-none">
          
          {/* 1. ヘッダー (固定) */}
          <header className="flex justify-between items-center py-2 px-3 bg-white/90 backdrop-blur-[5px] border-b-[3px] border-[#ffca28] shadow-sm pointer-events-auto flex-shrink-0">
            <div className="flex items-center">
              <h1 className="text-[#1a73e8] font-black text-lg m-0 drop-shadow-[2px_2px_0_rgba(255,255,255,1)] tracking-wide">
                GIGAクアルト！
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={toggleSound} 
                className="bg-gray-100 text-[#1a73e8] text-xs font-bold rounded-full px-3 py-1.5 shadow-sm border-0"
              >
                {soundEnabled ? '🔊 ON' : '🔇 OFF'}
              </button>
              <button 
                onClick={showRules} 
                className="pop-btn bg-[#ffca28] text-white font-black rounded-full w-9 h-9 flex items-center justify-center shadow-sm text-lg border-0 p-0"
              >
                ？
              </button>
            </div>
          </header>

          {/* 2. メインエリアの中間空間（3D操作を通すための余白） */}
          <div className="flex-1" />

          {/* 3. 操作パネル (画面下部・パクパクゴブレットの turn-info-container 相当) */}
          <div className="w-full flex justify-center pb-3 pointer-events-none px-2">
            <div className="pointer-events-auto bg-white/80 backdrop-blur-sm rounded-3xl shadow-md px-6 py-3 text-center flex flex-col items-center w-full max-w-sm border-2 transition-colors duration-300"
                 style={{ borderColor: gameState.currentPlayer === 1 ? '#ffccbc' : '#bbdefb' }}>
              
              <div className="font-bold text-[#5d4037] mb-1 text-[1.1rem] flex items-center justify-center gap-2">
                 <span style={{ color: PLAYER_COLORS[gameState.currentPlayer] }}>●</span>
                 プレイヤー{gameState.currentPlayer} のばん
              </div>
              
              {/* ステータスメッセージ */}
              <div className="text-sm font-medium opacity-80 mb-3">
                  {gameState.gameOver ? (
                     <span className="text-[#ff7043] animate-pulse font-bold">ゲーム終了！</span>
                  ) : gameState.currentPhase === 'SELECT' ? (
                     <><ruby>相手<rt>あいて</rt></ruby>に<ruby>渡<rt>わた</rt></ruby>すコマをえらんでね！</>
                  ) : (
                     <>コマを好きな<ruby>場所<rt>ばしょ</rt></ruby>に<ruby>置<rt>お</rt></ruby>いてね！</>
                  )}
              </div>

              <button 
                onClick={confirmReset} 
                className="pop-btn border-2 border-red-400 text-red-500 bg-white text-[0.8rem] font-bold rounded-full px-5 py-1.5 hover:bg-red-50"
              >
                <ruby>最初<rt>さいしょ</rt></ruby>から
              </button>
            </div>
          </div>

          {/* 4. フッター (固定) */}
          <footer className="text-center text-gray-500 py-2 border-t border-gray-200 bg-white pointer-events-auto flex-shrink-0">
            <small className="text-[0.7rem] font-medium">© 2026 GIGAクアルト！ <a href="https://note.com/cute_borage86" target="_blank" rel="noreferrer" className="text-gray-500 no-underline hover:text-blue-500">GIGA山</a></small>
          </footer>
        </div>

      </div>
    </>
  );
}
