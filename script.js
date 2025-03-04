const config = {
    difficulty: {
        easy: { enemySpeed: 1.5, enemySpawnMultiplier: 3, playerSpeed: 5 },
        medium: { enemySpeed: 2, enemySpawnMultiplier: 5, playerSpeed: 5 },
        hard: { enemySpeed: 3, enemySpawnMultiplier: 7, playerSpeed: 5 }
    },
    currentDifficulty: 'medium',
    soundEnabled: true
};

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const startScreen = document.getElementById('startScreen');
const loseScreen = document.getElementById('loseScreen');
const pauseMenu = document.getElementById('pauseMenu');
const scoreBoard = document.getElementById('scoreBoard');
const scoreValue = document.getElementById('scoreValue');
const finalScore = document.getElementById('finalScore');
const fpsCounter = document.getElementById('fpsCounter');
const fpsValue = document.getElementById('fpsValue');
const roundIndicator = document.getElementById('roundIndicator');
const roundValue = document.getElementById('roundValue');
const finalRound = document.getElementById('finalRound');
const toggleColorButton = document.getElementById('toggleColorButton');
const toggleSoundButton = document.getElementById('toggleSoundButton');

let player, enemies, bullets, particles, powerups;
let gameOver = true;
let round = 1;
let keys = {};
let score = 0;
let lastTime = 0;
let fps = 0;
let paused = false;
let animationFrameId = null;
let lastShootTime = 0;
let shootCooldown = 200; // ms between shots

const sounds = {
    shoot: new Audio('audio/shoot.wav'),
    enemyHit: new Audio('audio/hit.wav'),
    playerHit: new Audio('audio/hit.wav'),
    powerup: new Audio('audio/powerUp.wav'),
    gameOver: new Audio('audio/gameOver.wav')
};

function init() {
    resizeCanvas();
    setupEventListeners();
    
    const difficultyBtns = document.querySelectorAll('.difficulty-btn');
    difficultyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            difficultyBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            config.currentDifficulty = btn.dataset.difficulty;
        });
    });
    
    document.querySelector(`[data-difficulty="${config.currentDifficulty}"]`).classList.add('selected');
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    if (!gameOver && !paused) {
        draw();
    }
}

function startGame() {
    const diffSettings = config.difficulty[config.currentDifficulty];
    
    player = {
        x: canvas.width / 2,
        y: canvas.height / 2,
        radius: 20,
        speed: diffSettings.playerSpeed,
        color: getComputedStyle(document.documentElement).getPropertyValue('--green').trim()
    };
    
    enemies = [];
    bullets = [];
    particles = [];
    powerups = [];
    gameOver = false;
    round = 1;
    score = 0;
    
    updateScoreDisplay();

    scoreBoard.innerText = 'Score: 0';
    
    if (scoreValue) {
        scoreValue.textContent = '0';
    }

    updateRoundDisplay();
    
    scoreBoard.classList.add('active');
    fpsCounter.classList.add('active');
    roundIndicator.classList.add('active');
    
    spawnEnemies(diffSettings.enemySpawnMultiplier);
    
    startScreen.classList.remove('active');
    loseScreen.classList.remove('active');
    
    lastTime = performance.now();
    animationFrameId = requestAnimationFrame(gameLoop);
}

function gameLoop(currentTime) {
    if (gameOver) {
        endGame();
        return;
    }
    
    if (paused) {
        return;
    }
    
    const deltaTime = currentTime - lastTime;
    lastTime = currentTime;
    
    if (currentTime % 500 < 16) {
        fps = Math.round(1000 / deltaTime);
        fpsValue.textContent = fps;
    }
    
    update(deltaTime);
    draw();
    
    animationFrameId = requestAnimationFrame(gameLoop);
}

function update(deltaTime) {

    const speedFactor = deltaTime / 16.67; // 60 FPS as baseline
    
    const moveDistance = player.speed * speedFactor;
    if (keys['w'] && player.y > player.radius) player.y -= moveDistance;
    if (keys['s'] && player.y < canvas.height - player.radius) player.y += moveDistance;
    if (keys['a'] && player.x > player.radius) player.x -= moveDistance;
    if (keys['d'] && player.x < canvas.width - player.radius) player.x += moveDistance;
    
    updateBullets(speedFactor);
    
    updateEnemies(speedFactor);
    
    updateParticles(speedFactor);
    
    updatePowerups(speedFactor);
    
    checkCollisions();
    
    if (enemies.length === 0) {
        nextRound();
    }
}

function updateBullets(speedFactor) {
    bullets = bullets.filter(bullet => {
        bullet.x += bullet.dx * speedFactor;
        bullet.y += bullet.dy * speedFactor;
        
        return bullet.x > -bullet.radius && 
               bullet.x < canvas.width + bullet.radius && 
               bullet.y > -bullet.radius && 
               bullet.y < canvas.height + bullet.radius;
    });
}

function updateEnemies(speedFactor) {
    enemies.forEach(enemy => {
        const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
        enemy.x += Math.cos(angle) * enemy.speed * speedFactor;
        enemy.y += Math.sin(angle) * enemy.speed * speedFactor;
    });
}

function updateParticles(speedFactor) {
    particles = particles.filter(particle => {
        particle.x += particle.dx * speedFactor;
        particle.y += particle.dy * speedFactor;
        particle.life -= speedFactor;
        particle.radius -= 0.05 * speedFactor;
        
        return particle.life > 0 && particle.radius > 0;
    });
}

function updatePowerups(speedFactor) {
    powerups = powerups.filter(powerup => {
        powerup.y += powerup.speed * speedFactor;
        powerup.rotation += 0.02 * speedFactor;
        
        return powerup.y < canvas.height + powerup.size;
    });
}

function checkCollisions() {

    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        let bulletHit = false;
        
        for (let j = enemies.length - 1; j >= 0; j--) {
            const enemy = enemies[j];
            const dx = bullet.x - enemy.x;
            const dy = bullet.y - enemy.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < bullet.radius + enemy.radius) {

                bulletHit = true;
                

                if (enemy.health !== undefined) {
                    enemy.health -= 1;
                    
                    if (enemy.health <= 0) {

                        createExplosion(enemy.x, enemy.y, enemy.color);
                        
                        enemies.splice(j, 1);

                        score += enemy.isBoss ? 100 : 10;
                        scoreBoard.innerText = 'Score: ' + score;
                        
                        if (Math.random() < 0.1) {
                            spawnPowerup(enemy.x, enemy.y);
                        }
                    }
                } else {

                    createExplosion(enemy.x, enemy.y, enemy.color);
                    enemies.splice(j, 1);
                    score += 10;
                    scoreBoard.innerText = 'Score: ' + score;
                }
                
                break;
            }
        }
        
        if (bulletHit) {
            bullets.splice(i, 1);
            playSound('enemyHit');
        }
    }
    
    for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        const dx = enemy.x - player.x;
        const dy = enemy.y - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < enemy.radius + player.radius) {

            if (player.hasShield) {

                playSound('enemyHit');
                enemies.splice(i, 1);
                createExplosion(enemy.x, enemy.y, enemy.color);
                player.hasShield = false;
            } else {
                gameOver = true;
                createExplosion(player.x, player.y, player.color, 30);
                playSound('playerHit');
            }
            break;
        }
    }
    
    for (let i = powerups.length - 1; i >= 0; i--) {
        const powerup = powerups[i];
        const dx = powerup.x - player.x;
        const dy = powerup.y - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < powerup.size + player.radius) {

            applyPowerup(powerup.type);

            powerups.splice(i, 1);

            if (typeof playSound === 'function') {
                playSound('powerup');
            }
        }
    }
}
    
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        drawParticles();
        
        drawPowerups();
        
        drawPlayer();
        
        drawBullets();
        
        drawEnemies();
    }
    
    function drawPlayer() {
        ctx.fillStyle = player.color;
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
        ctx.fill();
        
        const mouseX = keys.mouseX || canvas.width / 2;
        const mouseY = keys.mouseY || canvas.height / 2;
        const angle = Math.atan2(mouseY - player.y, mouseX - player.x);
        
        ctx.strokeStyle = player.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(player.x, player.y);
        ctx.lineTo(
            player.x + Math.cos(angle) * player.radius * 1.5,
            player.y + Math.sin(angle) * player.radius * 1.5
        );
        ctx.stroke();
    }
    
    function drawBullets() {
        const bulletColor = getComputedStyle(document.documentElement).getPropertyValue('--cyan').trim();
        ctx.fillStyle = bulletColor;
        
        bullets.forEach(bullet => {
            ctx.beginPath();
            ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
            ctx.fill();
        });
    }
    
    function drawEnemies() {
        enemies.forEach(enemy => {
            ctx.fillStyle = enemy.color;
            ctx.beginPath();
            ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
            ctx.fill();
            
            if (enemy.health && enemy.maxHealth) {
                const healthPercent = enemy.health / enemy.maxHealth;
                const barWidth = enemy.radius * 2;
                const barHeight = 4;
                
                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.fillRect(
                    enemy.x - barWidth / 2,
                    enemy.y - enemy.radius - 10,
                    barWidth,
                    barHeight
                );
                
                ctx.fillStyle = healthPercent > 0.5 ? 'green' : healthPercent > 0.25 ? 'orange' : 'red';
                ctx.fillRect(
                    enemy.x - barWidth / 2,
                    enemy.y - enemy.radius - 10,
                    barWidth * healthPercent,
                    barHeight
                );
            }
        });
    }
    
    function drawParticles() {
        particles.forEach(particle => {
            ctx.globalAlpha = particle.life / particle.initialLife;
            ctx.fillStyle = particle.color;
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
            ctx.fill();
        });
        
        ctx.globalAlpha = 1;
    }
    
    function drawPowerups() {
        powerups.forEach(powerup => {
            ctx.save();
            ctx.translate(powerup.x, powerup.y);
            ctx.rotate(powerup.rotation);
            
            ctx.fillStyle = powerup.color;
            ctx.fillRect(-powerup.size/2, -powerup.size/2, powerup.size, powerup.size);
            
            ctx.restore();
        });
    }
    
    function spawnEnemies(count) {
        const diffSettings = config.difficulty[config.currentDifficulty];
        const enemyColor = getComputedStyle(document.documentElement).getPropertyValue('--red').trim();
        
        for (let i = 0; i < count; i++) {

            let x, y;
            const side = Math.floor(Math.random() * 4); // 0: top, 1: right, 2: bottom, 3: left
            
            switch(side) {
                case 0: // top
                    x = Math.random() * canvas.width;
                    y = -30;
                    break;
                case 1: // right
                    x = canvas.width + 30;
                    y = Math.random() * canvas.height;
                    break;
                case 2: // bottom
                    x = Math.random() * canvas.width;
                    y = canvas.height + 30;
                    break;
                case 3: // left
                    x = -30;
                    y = Math.random() * canvas.height;
                    break;
            }
            
            // Add variety to enemy sizes and speeds
            const sizeVariation = 0.7 + Math.random() * 0.6; 
            const speedVariation = 0.8 + Math.random() * 0.4; 
            
            enemies.push({
                x,
                y,
                radius: 15 * sizeVariation,
                speed: diffSettings.enemySpeed * speedVariation,
                color: enemyColor,
                health: round > 3 ? Math.ceil(round / 3) : 1,
                maxHealth: round > 3 ? Math.ceil(round / 3) : 1
            });
        }
    }
    
    function nextRound() {
        round++;
        updateRoundDisplay();
        
        const diffSettings = config.difficulty[config.currentDifficulty];
        const baseEnemies = diffSettings.enemySpawnMultiplier;
        const enemyCount = baseEnemies + Math.floor(round * 1.5);
        
        if (round % 5 === 0) {
            spawnBoss();
        } else {
            spawnEnemies(enemyCount);
        }
    }
    
    function spawnBoss() {
        const bossColor = getComputedStyle(document.documentElement).getPropertyValue('--orange').trim();
        const bossSize = 40 + (round / 5) * 10;
        const bossHealth = 10 + (round / 5) * 5;
        
        enemies.push({
            x: canvas.width / 2,
            y: -bossSize,
            radius: bossSize,
            speed: 1,
            color: bossColor,
            health: bossHealth,
            maxHealth: bossHealth,
            isBoss: true
        });
    }
    
    function spawnPowerup(x, y) {
        const powerupTypes = ['speedBoost', 'healthBoost', 'spreadShot', 'shield'];
        const type = powerupTypes[Math.floor(Math.random() * powerupTypes.length)];
        
        let color;
        switch(type) {
            case 'speedBoost':
                color = getComputedStyle(document.documentElement).getPropertyValue('--cyan').trim();
                break;
            case 'healthBoost':
                color = getComputedStyle(document.documentElement).getPropertyValue('--green').trim();
                break;
            case 'spreadShot':
                color = getComputedStyle(document.documentElement).getPropertyValue('--yellow').trim();
                break;
            case 'shield':
                color = getComputedStyle(document.documentElement).getPropertyValue('--purple').trim();
                break;
        }
        
        powerups.push({
            x,
            y,
            size: 15,
            speed: 1,
            rotation: 0,
            color,
            type
        });
    }
    
    function applyPowerup(type) {
        switch(type) {
            case 'speedBoost':
                player.speed *= 1.5;
                setTimeout(() => { player.speed /= 1.5; }, 5000);
                break;
            case 'healthBoost':
                // Increase player health (not implemented, soon maybe :D)
                score += 50;
                updateScoreDisplay();
                break;
            case 'spreadShot':

                player.spreadShot = true;
                setTimeout(() => { player.spreadShot = false; }, 5000);
                break;
            case 'shield':

                player.hasShield = true;
                setTimeout(() => { player.hasShield = false; }, 8000);
                break;
        }
    }
    
    function shootBullet(e) {
        const currentTime = performance.now();
        if (currentTime - lastShootTime < shootCooldown) return;
        
        lastShootTime = currentTime;
        
        const bulletColor = getComputedStyle(document.documentElement).getPropertyValue('--cyan').trim();
        const angle = Math.atan2(e.clientY - player.y, e.clientX - player.x);
        const speed = 10;
        
        if (player.spreadShot) {
            // Shotgun spread, type of powerups we love
            for (let i = -1; i <= 1; i++) {
                const spreadAngle = angle + (i * Math.PI / 12);
                bullets.push({
                    x: player.x,
                    y: player.y,
                    radius: 5,
                    dx: Math.cos(spreadAngle) * speed,
                    dy: Math.sin(spreadAngle) * speed,
                    color: bulletColor
                });
            }
        } else {
            // Shoot a single bullet
            bullets.push({
                x: player.x,
                y: player.y,
                radius: 5,
                dx: Math.cos(angle) * speed,
                dy: Math.sin(angle) * speed,
                color: bulletColor
            });
        }
        
        playSound('shoot');
    }
    
    function createExplosion(x, y, color, count = 15) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 3;
            
            particles.push({
                x,
                y,
                radius: 2 + Math.random() * 3,
                dx: Math.cos(angle) * speed,
                dy: Math.sin(angle) * speed,
                color,
                life: 30 + Math.random() * 20,
                initialLife: 30 + Math.random() * 20
            });
        }
    }
    
    function endGame() {
        cancelAnimationFrame(animationFrameId);
        
        scoreBoard.classList.remove('active');
        fpsCounter.classList.remove('active');
        roundIndicator.classList.remove('active');
        
        finalScore.textContent = score;
        finalRound.textContent = round;
        loseScreen.classList.add('active');
        
        playSound('gameOver');
    }
    
    function togglePause() {
        paused = !paused;
        
        if (paused) {
            pauseMenu.classList.add('active');
        } else {
            pauseMenu.classList.remove('active');
            lastTime = performance.now();
            requestAnimationFrame(gameLoop);
        }
    }
    
    function toggleColorScheme() {
        document.documentElement.classList.toggle('light-mode');
        
        if (!gameOver) {
            player.color = getComputedStyle(document.documentElement).getPropertyValue('--green').trim();
            
            const enemyColor = getComputedStyle(document.documentElement).getPropertyValue('--red').trim();
            enemies.forEach(enemy => {
                if (!enemy.isBoss) {
                    enemy.color = enemyColor;
                }
            });
        }
    }
    
    function toggleSound() {
        config.soundEnabled = !config.soundEnabled;
        toggleSoundButton.textContent = `Sound: ${config.soundEnabled ? 'ON' : 'OFF'}`;
    }
    
    function playSound(soundName) {
        if (!config.soundEnabled) return;
        
        const sound = sounds[soundName];
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(e => console.log("Error playing sound:", e));
        }
    }
    
    function updateScoreDisplay() {
        scoreValue.textContent = score;
    }
    
    function updateRoundDisplay() {
        roundValue.textContent = round;
    }
    
    function setupEventListeners() {
        window.addEventListener('keydown', (e) => {
            keys[e.key.toLowerCase()] = true;
            
            if ((e.key === 'Escape' || e.key.toLowerCase() === 'p') && !gameOver && !startScreen.classList.contains('active')) {
                togglePause();
            }
        });
        
        window.addEventListener('keyup', (e) => {
            keys[e.key.toLowerCase()] = false;
        });
        
        window.addEventListener('mousemove', (e) => {
            keys.mouseX = e.clientX;
            keys.mouseY = e.clientY;
        });
        
        window.addEventListener('mousedown', (e) => {
            if (!gameOver && !paused && !startScreen.classList.contains('active')) {
                shootBullet(e);
            }
        });
        
        window.addEventListener('resize', resizeCanvas);
        
        startButton.addEventListener('click', startGame);
        restartButton.addEventListener('click', startGame);
        resumeButton.addEventListener('click', togglePause);
        document.getElementById('restartFromPauseButton').addEventListener('click', () => {
            paused = false;
            pauseMenu.classList.remove('active');
            startGame();
        });
        
        toggleColorButton.addEventListener('click', toggleColorScheme);
        toggleSoundButton.addEventListener('click', toggleSound);
    }
    
    window.addEventListener('load', init);