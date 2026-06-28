document.addEventListener('DOMContentLoaded', () => {
    // ----- Константы и настройки -----
    const COLS = 10;
    const ROWS = 20;
    const BLOCK_SIZE = 30; // размер пикселя на canvas 300x600
    const BASE_INTERVAL = 500; // мс на уровне 1
    const LEVEL_SPEEDUP = 40;   // мс ускорения за уровень

    // Фигуры (матрицы 4x4)
    const SHAPES = [
        { // I
            matrix: [
                [0,0,0,0],
                [1,1,1,1],
                [0,0,0,0],
                [0,0,0,0]
            ],
            color: '#3fc1c9'
        },
        { // O
            matrix: [
                [1,1],
                [1,1]
            ],
            color: '#f7d44a'
        },
        { // T
            matrix: [
                [0,1,0],
                [1,1,1],
                [0,0,0]
            ],
            color: '#b484e0'
        },
        { // S
            matrix: [
                [0,1,1],
                [1,1,0],
                [0,0,0]
            ],
            color: '#6fcf97'
        },
        { // Z
            matrix: [
                [1,1,0],
                [0,1,1],
                [0,0,0]
            ],
            color: '#e66767'
        },
        { // J
            matrix: [
                [1,0,0],
                [1,1,1],
                [0,0,0]
            ],
            color: '#4a8fe0'
        },
        { // L
            matrix: [
                [0,0,1],
                [1,1,1],
                [0,0,0]
            ],
            color: '#f5a97f'
        }
    ];

    // ----- Элементы DOM -----
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const previewCanvas = document.getElementById('previewCanvas');
    const previewCtx = previewCanvas.getContext('2d');
    const scoreDisplay = document.getElementById('scoreDisplay');
    const levelDisplay = document.getElementById('levelDisplay');
    const linesDisplay = document.getElementById('linesDisplay');
    const finalScoreSpan = document.getElementById('finalScore');
    const gameOverOverlay = document.getElementById('gameOverOverlay');
    const restartBtn = document.getElementById('restartBtn');

    // ----- Состояние игры -----
    let board = [];
    let currentPiece = null;
    let nextPiece = null;
    let score = 0;
    let lines = 0;
    let level = 1;
    let gameOver = false;
    let dropInterval = BASE_INTERVAL;
    let intervalId = null;
    let animFrameId = null;

    // ----- Инициализация -----
    function initBoard() {
        board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    }

    // Создание случайной фигуры
    function createRandomPiece() {
        const idx = Math.floor(Math.random() * SHAPES.length);
        const shape = SHAPES[idx];
        const matrix = shape.matrix.map(row => [...row]); // копия
        return {
            matrix: matrix,
            color: shape.color,
            x: Math.floor((COLS - matrix[0].length) / 2),
            y: 0
        };
    }

    // Поворот матрицы по часовой
    function rotateMatrix(matrix) {
        const n = matrix.length;
        const rotated = Array.from({ length: n }, () => Array(n).fill(0));
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                rotated[j][n - 1 - i] = matrix[i][j];
            }
        }
        return rotated;
    }

    // Проверка столкновения
    function collide(piece, board, offsetX = 0, offsetY = 0) {
        const m = piece.matrix;
        for (let r = 0; r < m.length; r++) {
            for (let c = 0; c < m[0].length; c++) {
                if (m[r][c] !== 0) {
                    const newX = piece.x + c + offsetX;
                    const newY = piece.y + r + offsetY;
                    if (newX < 0 || newX >= COLS || newY >= ROWS || newY < 0) {
                        return true;
                    }
                    if (newY >= 0 && board[newY][newX] !== 0) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    // Закрепление фигуры на доске
    function mergePiece(piece) {
        const m = piece.matrix;
        for (let r = 0; r < m.length; r++) {
            for (let c = 0; c < m[0].length; c++) {
                if (m[r][c] !== 0) {
                    const y = piece.y + r;
                    const x = piece.x + c;
                    if (y >= 0 && y < ROWS && x >= 0 && x < COLS) {
                        board[y][x] = piece.color;
                    }
                }
            }
        }
    }

    // Удаление заполненных линий и подсчёт очков
    function clearLines() {
        let cleared = 0;
        for (let row = ROWS - 1; row >= 0; ) {
            let full = true;
            for (let col = 0; col < COLS; col++) {
                if (board[row][col] === 0) {
                    full = false;
                    break;
                }
            }
            if (full) {
                // удаляем строку
                for (let r = row; r > 0; r--) {
                    board[r] = [...board[r-1]];
                }
                board[0] = Array(COLS).fill(0);
                cleared++;
                // остаёмся на той же строке, т.к. всё сдвинулось
            } else {
                row--;
            }
        }

        if (cleared > 0) {
            // Очки: 1 линия - 100, 2 - 300, 3 - 500, 4 - 800
            const points = [0, 100, 300, 500, 800];
            const addScore = points[cleared] || 0;
            score += addScore * level;
            lines += cleared;
            // Повышение уровня каждые 10 линий
            const newLevel = Math.floor(lines / 10) + 1;
            if (newLevel > level) {
                level = newLevel;
                dropInterval = Math.max(80, BASE_INTERVAL - (level - 1) * LEVEL_SPEEDUP);
                resetDropTimer();
            }
            updateStats();
        }
    }

    // Сброс таймера падения
    function resetDropTimer() {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
        if (!gameOver) {
            intervalId = setInterval(() => {
                if (!gameOver && currentPiece) {
                    moveDown();
                }
            }, dropInterval);
        }
    }

    // Движение вниз (шаг)
    function moveDown() {
        if (!currentPiece || gameOver) return;
        if (!collide(currentPiece, board, 0, 1)) {
            currentPiece.y++;
            drawAll();
        } else {
            lockPiece();
        }
    }

    // Закрепление и спавн новой фигуры
    function lockPiece() {
        if (!currentPiece) return;
        mergePiece(currentPiece);
        clearLines();

        // Следующая становится текущей
        currentPiece = nextPiece;
        nextPiece = createRandomPiece();

        if (collide(currentPiece, board)) {
            // game over
            gameOver = true;
            if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
            }
            finalScoreSpan.textContent = score;
            gameOverOverlay.classList.add('active');
            drawAll();
            return;
        }
        drawAll();
        resetDropTimer();
    }

    // ----- Отрисовка -----
    function drawBoard() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Фон
        ctx.fillStyle = '#0b0b18';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Сетка (слабая)
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 0.5;
        for (let row = 0; row <= ROWS; row++) {
            ctx.beginPath();
            ctx.moveTo(0, row * BLOCK_SIZE);
            ctx.lineTo(canvas.width, row * BLOCK_SIZE);
            ctx.stroke();
        }
        for (let col = 0; col <= COLS; col++) {
            ctx.beginPath();
            ctx.moveTo(col * BLOCK_SIZE, 0);
            ctx.lineTo(col * BLOCK_SIZE, canvas.height);
            ctx.stroke();
        }

        // Закреплённые блоки
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                const color = board[row][col];
                if (color !== 0) {
                    ctx.fillStyle = color;
                    ctx.shadowColor = color;
                    ctx.shadowBlur = 10;
                    ctx.fillRect(col * BLOCK_SIZE, row * BLOCK_SIZE, BLOCK_SIZE-1, BLOCK_SIZE-1);
                    ctx.shadowBlur = 0;
                    // блик
                    ctx.fillStyle = 'rgba(255,255,255,0.15)';
                    ctx.fillRect(col * BLOCK_SIZE, row * BLOCK_SIZE, BLOCK_SIZE-1, 4);
                }
            }
        }

        // Текущая фигура
        if (currentPiece && !gameOver) {
            const m = currentPiece.matrix;
            for (let r = 0; r < m.length; r++) {
                for (let c = 0; c < m[0].length; c++) {
                    if (m[r][c] !== 0) {
                        const x = (currentPiece.x + c) * BLOCK_SIZE;
                        const y = (currentPiece.y + r) * BLOCK_SIZE;
                        ctx.fillStyle = currentPiece.color;
                        ctx.shadowColor = currentPiece.color;
                        ctx.shadowBlur = 12;
                        ctx.fillRect(x, y, BLOCK_SIZE-1, BLOCK_SIZE-1);
                        ctx.shadowBlur = 0;
                        ctx.fillStyle = 'rgba(255,255,255,0.2)';
                        ctx.fillRect(x, y, BLOCK_SIZE-1, 4);
                    }
                }
            }
        }
    }

    function drawPreview() {
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        previewCtx.fillStyle = 'rgba(0,0,0,0.2)';
        previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
        if (!nextPiece) return;
        const m = nextPiece.matrix;
        const blockSize = 24; // 120 / 5 (макс 4x4 с отступом)
        const offsetX = (previewCanvas.width - m[0].length * blockSize) / 2;
        const offsetY = (previewCanvas.height - m.length * blockSize) / 2;
        for (let r = 0; r < m.length; r++) {
            for (let c = 0; c < m[0].length; c++) {
                if (m[r][c] !== 0) {
                    previewCtx.fillStyle = nextPiece.color;
                    previewCtx.shadowColor = nextPiece.color;
                    previewCtx.shadowBlur = 10;
                    previewCtx.fillRect(offsetX + c * blockSize, offsetY + r * blockSize, blockSize-1, blockSize-1);
                    previewCtx.shadowBlur = 0;
                }
            }
        }
    }

    function drawAll() {
        drawBoard();
        drawPreview();
    }

    // ----- Обновление статистики -----
    function updateStats() {
        scoreDisplay.textContent = score;
        levelDisplay.textContent = level;
        linesDisplay.textContent = lines;
    }

    // ----- Действия игрока -----
    function moveLeft() {
        if (!currentPiece || gameOver) return;
        if (!collide(currentPiece, board, -1, 0)) {
            currentPiece.x--;
            drawAll();
        }
    }

    function moveRight() {
        if (!currentPiece || gameOver) return;
        if (!collide(currentPiece, board, 1, 0)) {
            currentPiece.x++;
            drawAll();
        }
    }

    function rotatePiece() {
        if (!currentPiece || gameOver) return;
        const rotated = rotateMatrix(currentPiece.matrix);
        const testPiece = {
            matrix: rotated,
            color: currentPiece.color,
            x: currentPiece.x,
            y: currentPiece.y
        };
        if (!collide(testPiece, board)) {
            currentPiece.matrix = rotated;
            drawAll();
        } else {
            // попытка "wall kick" (сдвиг влево/вправо)
            for (let offset of [-1, 1, -2, 2]) {
                testPiece.x = currentPiece.x + offset;
                if (!collide(testPiece, board)) {
                    currentPiece.matrix = rotated;
                    currentPiece.x = testPiece.x;
                    drawAll();
                    break;
                }
            }
        }
    }

    function hardDrop() {
        if (!currentPiece || gameOver) return;
        while (!collide(currentPiece, board, 0, 1)) {
            currentPiece.y++;
        }
        lockPiece();
        drawAll();
    }

    // ----- Новая игра -----
    function startNewGame() {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
        initBoard();
        score = 0;
        lines = 0;
        level = 1;
        dropInterval = BASE_INTERVAL;
        gameOver = false;
        gameOverOverlay.classList.remove('active');
        currentPiece = createRandomPiece();
        nextPiece = createRandomPiece();
        updateStats();
        drawAll();
        resetDropTimer();
    }

    // ----- Обработчики событий -----
    // Клавиатура
    document.addEventListener('keydown', (e) => {
        const key = e.key;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(key)) {
            e.preventDefault();
        }
        if (gameOver) return;
        switch (key) {
            case 'ArrowLeft': moveLeft(); break;
            case 'ArrowRight': moveRight(); break;
            case 'ArrowUp': rotatePiece(); break;
            case 'ArrowDown': moveDown(); break;
            case ' ': hardDrop(); break;
        }
    });

    // Кнопки (мобильные)
    document.getElementById('moveLeft').addEventListener('click', moveLeft);
    document.getElementById('moveRight').addEventListener('click', moveRight);
    document.getElementById('rotateBtn').addEventListener('click', rotatePiece);
    document.getElementById('hardDropBtn').addEventListener('click', hardDrop);
    document.getElementById('softDropBtn').addEventListener('click', moveDown);
    restartBtn.addEventListener('click', startNewGame);

    // ----- Старт игры -----
    startNewGame();
});