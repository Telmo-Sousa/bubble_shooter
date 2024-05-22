const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
resizeCanvas();

const startScreen = document.getElementById('startScreen');
const loseScreen = document.getElementById('loseScreen');
const startButton = document.getElementById('startButton');
const restartButton = document.getElementById('restartButton');
const scoreBoard = document.getElementById('scoreBoard');
const fpsCounter = document.getElementById('fpsCounter');
const toggleColorButton = document.getElementById('toggleColorButton');
const resumeButton = document.getElementById('resumeButton');
const pauseMenu = document.getElementById('pauseMenu');
const playerColor = getComputedStyle(document.documentElement).getPropertyValue('--green');
const enemyColor = getComputedStyle(document.documentElement).getPropertyValue('--red');
const bulletColor = getComputedStyle(document.documentElement).getPropertyValue('--cyan');

let player, enemies, bullets, gameOver, round, keys, score;
let lastTime = performance.now();
let fps = 0;
let paused = false;

function startGame() {
    player = { x: canvas.width / 2, y: canvas.height / 2, radius: 20, speed: 5 };
    enemies = [];
    bullets = [];
    gameOver = false;
    round = 1;
    keys = {};
    score = 0;
    scoreBoard.innerText = 'Score: ' + score;
    scoreBoard.classList.add('active');
    fpsCounter.classList.add('active'); 
    spawnEnemies(5);

    startScreen.classList.remove('active');
    loseScreen.classList.remove('active');
    toggleColorButton.style.display = 'none';
    requestAnimationFrame(gameLoop);
}

function togglePause() {
    paused = !paused;
    if (paused) {
        pauseMenu.classList.add('active');
    } else {
        pauseMenu.classList.remove('active');
        requestAnimationFrame(gameLoop);
    }
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function spawnEnemies(count) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * 2 * Math.PI;
        const x = canvas.width / 2 + Math.cos(angle) * (canvas.width / 2 + 100);
        const y = canvas.height / 2 + Math.sin(angle) * (canvas.height / 2 + 100);
        enemies.push({ x, y, radius: 15, speed: 2 });
    }
}

function gameLoop(currentTime) {
    if (gameOver) {
        fpsCounter.classList.remove('active'); 
        loseScreen.classList.add('active');
        toggleColorButton.style.display = 'none';
        return;
    } else if (paused) {
        return;
    }

    const deltaTime = currentTime - lastTime;
    lastTime = currentTime;
    fps = Math.round(1000 / deltaTime);
    fpsCounter.innerText = 'FPS: ' + fps;

    update();
    draw();
    requestAnimationFrame(gameLoop);
}

function update() {
    if (keys['w'] && player.y > player.radius) player.y -= player.speed;
    if (keys['s'] && player.y < canvas.height - player.radius) player.y += player.speed;
    if (keys['a'] && player.x > player.radius) player.x -= player.speed;
    if (keys['d'] && player.x < canvas.width - player.radius) player.x += player.speed;

    bullets = bullets.filter(bullet => {
        bullet.x += bullet.dx;
        bullet.y += bullet.dy;
        return bullet.x > 0 && bullet.x < canvas.width && bullet.y > 0 && bullet.y < canvas.height;
    });

    enemies.forEach(enemy => {
        const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
        enemy.x += Math.cos(angle) * enemy.speed;
        enemy.y += Math.sin(angle) * enemy.speed;
    });

    bullets.forEach((bullet, bulletIndex) => {
        enemies.forEach((enemy, enemyIndex) => {
            const dx = bullet.x - enemy.x;
            const dy = bullet.y - enemy.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < bullet.radius + enemy.radius) {
                bullets.splice(bulletIndex, 1);
                enemies.splice(enemyIndex, 1);
                score++;
                scoreBoard.innerText = 'Score: ' + score;
            }
        });
    });

    enemies.forEach(enemy => {
        const dx = enemy.x - player.x;
        const dy = enemy.y - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < enemy.radius + player.radius) {
            gameOver = true;
        }
    });

    if (enemies.length === 0) {
        round++;
        spawnEnemies(5 * round);
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const currentPlayerColor = getComputedStyle(document.documentElement).getPropertyValue('--green');
    const currentEnemyColor = getComputedStyle(document.documentElement).getPropertyValue('--red');
    const currentBulletColor = getComputedStyle(document.documentElement).getPropertyValue('--cyan');

    ctx.fillStyle = currentPlayerColor;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = currentBulletColor;
    bullets.forEach(bullet => {
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.fillStyle = currentEnemyColor;
    enemies.forEach(enemy => {
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
        ctx.fill();
    });
}


function shootBullet(e) {
    const angle = Math.atan2(e.clientY - player.y, e.clientX - player.x);
    const speed = 7;
    const bullet = {
        x: player.x,
        y: player.y,
        radius: 5,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed
    };
    bullets.push(bullet);
}

function toggleColorScheme() {
    document.documentElement.classList.toggle('light-mode');
}

window.addEventListener('keydown', (e) => keys[e.key] = true);
window.addEventListener('keyup', (e) => keys[e.key] = false);
window.addEventListener('mousedown', shootBullet);

window.addEventListener('keydown', (e) => {
    if ((e.key === 'Escape' || e.key === 'p' || e.key === 'P') && !gameOver && !startScreen.classList.contains('active')) {
        togglePause();
    }
});

startButton.addEventListener('click', startGame);
restartButton.addEventListener('click', startGame);
toggleColorButton.addEventListener('click', toggleColorScheme);
resumeButton.addEventListener('click', () => {
    togglePause();
});

window.addEventListener('resize', resizeCanvas);

fpsCounter.classList.remove('active');  