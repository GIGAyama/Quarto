/*
 * クアルトの中核ロジック。画面にも three.js にも依存しない純粋な部分だけを置く。
 * ここだけを取り出してあるのは、勝敗判定をテストで確かめられるようにするため。
 */

export const BOARD_DIMENSION = 4;
export const CELL_SIZE = 2;

// 全16種類のコマ（色・高さ・形・穴 の4属性の全組み合わせ）
export const PIECES = [];
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

export const PIECES_BY_ID = new Map(PIECES.map((p) => [p.id, p]));

export const createInitialGameState = () => ({
  board: Array(4)
    .fill(null)
    .map(() => Array(4).fill(null)),
  availablePieces: PIECES.map((p) => p.id),
  pieceToPlace: null,
  currentPlayer: 1, // 1=Orange(P1), 2=Blue(P2)
  currentPhase: 'SELECT',
  gameOver: false,
  winner: null,
  winLine: null
});

// 勝利判定。縦・横・斜めの10本を見て、4つとも同じ値の属性が1つでもあれば勝ち。
export const checkWin = (currentBoard) => {
  const lines = [];

  // 縦・横のライン
  for (let i = 0; i < 4; i++) {
    lines.push([{ r: i, c: 0 }, { r: i, c: 1 }, { r: i, c: 2 }, { r: i, c: 3 }]);
    lines.push([{ r: 0, c: i }, { r: 1, c: i }, { r: 2, c: i }, { r: 3, c: i }]);
  }

  // 斜めのライン
  lines.push([{ r: 0, c: 0 }, { r: 1, c: 1 }, { r: 2, c: 2 }, { r: 3, c: 3 }]);
  lines.push([{ r: 0, c: 3 }, { r: 1, c: 2 }, { r: 2, c: 1 }, { r: 3, c: 0 }]);

  for (const line of lines) {
    const pIds = line.map((p) => currentBoard[p.r][p.c]);
    if (pIds.includes(null)) continue;

    const pObjs = pIds.map((id) => PIECES_BY_ID.get(id));
    const attrs = ['color', 'height', 'shape', 'hole'];

    for (const attr of attrs) {
      const val = pObjs[0][attr];
      if (pObjs.every((p) => p[attr] === val)) {
        return { isWin: true, line: line, attr: attr };
      }
    }
  }
  return { isWin: false };
};
