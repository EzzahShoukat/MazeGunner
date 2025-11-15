(function () {
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");

    const minimap = document.getElementById("minimap");
    const mctx = minimap.getContext("2d");

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        minimap.width = 200;
        minimap.height = 200;
    }
    window.addEventListener("resize", resize);
    resize();

    const input = { keys:{}, mouseLocked:false, mouseDX:0, mouseDY:0 };
    window.addEventListener("keydown", e=>input.keys[e.code]=true);
    window.addEventListener("keyup", e=>input.keys[e.code]=false);
    document.addEventListener("pointerlockchange", ()=>{
        input.mouseLocked=document.pointerLockElement===canvas;
    });
    window.addEventListener("mousemove", e=>{ 
        if(input.mouseLocked){
            input.mouseDX += e.movementX;
            input.mouseDY += e.movementY;
        } else if(gameStarted){
            const rect = canvas.getBoundingClientRect();
            gun.screenX = Math.max(0, Math.min(canvas.width, e.clientX - rect.left));
            gun.screenY = Math.max(0, Math.min(canvas.height, e.clientY - rect.top));
        }
    });

    const HUD = {
        score: document.getElementById("score"),
        level: document.getElementById("level"),
        time: document.getElementById("time"),
        enemiesLeft: document.getElementById("enemies-left")
    };

    let score=0, level=1, timeLeft=120, gameStarted=false, gamePaused=false;

    /***  ███████████████████████████
     ***      UPDATED FOR 2 LEVELS  
     ***  ███████████████████████████ **/
    const maxLevel = 2;

    let mazeWidth=14, mazeHeight=14, maze=[], enemies=[];

    /*** MUST MATCH number of levels ***/
    const levelTimes=[120, 120];  // ← UPDATED (2 levels only)

    const startPoint={x:1.5,y:1.5};
    const endPoint={x:mazeWidth-2+0.5,y:mazeHeight-2+0.5};

    const player={x:startPoint.x,y:startPoint.y,angle:0,speed:3,bullets:[]};
    const gun = { screenX: canvas.width/2, screenY: canvas.height/2, width:60, height:40, free:true };

    function generateMaze(level){
        // Keep both levels easy
        const w=16, h=16;
        maze=[]; 
        for(let y=0;y<h;y++){
            maze[y]=[];
            for(let x=0;x<w;x++) maze[y][x]=1;
        }
        const stack=[[1,1]]; maze[1][1]=0;
        const dirs=[[0,2],[2,0],[0,-2],[-2,0]];
        while(stack.length>0){
            const [x,y]=stack[stack.length-1];
            const neighbors=dirs.filter(([dx,dy])=>{
                const nx=x+dx, ny=y+dy;
                return nx>0 && ny>0 && nx<w-1 && ny<h-1 && maze[ny][nx]===1;
            });
            if(neighbors.length===0){ stack.pop(); } 
            else{
                const [dx,dy]=neighbors[Math.floor(Math.random()*neighbors.length)];
                maze[y+dy/2|0][x+dx/2|0]=0; 
                maze[y+dy|0][x+dx|0]=0;
                stack.push([x+dx,y+dy]);
            }
        }
        mazeWidth=w; 
        mazeHeight=h;

        player.x=startPoint.x; 
        player.y=startPoint.y;

        // Find the farthest walkable cell from start for EXIT using BFS for guaranteed reachability
        let visited = Array.from({length: mazeHeight}, () => Array(mazeWidth).fill(false));
        let queue = [[Math.floor(startPoint.x), Math.floor(startPoint.y), 0]];
        visited[Math.floor(startPoint.y)][Math.floor(startPoint.x)] = true;
        let farthest = {x: Math.floor(startPoint.x), y: Math.floor(startPoint.y), dist: 0};
        while(queue.length > 0) {
            let [x, y, d] = queue.shift();
            if (d > farthest.dist) {
                farthest = {x, y, dist: d};
            }
            for (const [dx, dy] of [[0,1],[1,0],[0,-1],[-1,0]]) {
                let nx = x + dx, ny = y + dy;
                if (nx > 0 && ny > 0 && nx < mazeWidth-1 && ny < mazeHeight-1 && maze[ny][nx] === 0 && !visited[ny][nx]) {
                    visited[ny][nx] = true;
                    queue.push([nx, ny, d+1]);
                }
            }
        }
        endPoint.x = farthest.x + 0.5;
        endPoint.y = farthest.y + 0.5;
    }
    // --- Sound Effects ---
    const shootSound = new Audio("https://cdn.jsdelivr.net/gh/joshwcomeau/beatmapper-assets@main/sounds/shoot.wav");
    const hitSound = new Audio("https://cdn.jsdelivr.net/gh/joshwcomeau/beatmapper-assets@main/sounds/hit.wav");


    function spawnEnemies(num){
        // Keep enemy count low for both levels
        enemies.length=0; 
        let spawned=0;
        const easyEnemies = 3;
        while(spawned<easyEnemies){
            const x=Math.floor(Math.random()*(mazeWidth-2))+1;
            const y=Math.floor(Math.random()*(mazeHeight-2))+1;
            if(maze[y][x]===0 && (x!==1 && y!==1)){
                enemies.push({x:x+0.5,y:y+0.5,alive:true,time:0,hitTime:0});
                spawned++; 
            }
        }
    }

    window.addEventListener("mousedown", ()=>{
        if(!gameStarted) return;
        const rel = (gun.screenX / canvas.width - 0.5);
        const fov = Math.PI/3;
        const angle = player.angle + rel * fov;
        const startX = player.x + Math.cos(angle)*0.6;
        const startY = player.y + Math.sin(angle)*0.6;
        player.bullets.push({x:startX,y:startY,angle:angle,speed:10});
        // Play shoot sound
        try { shootSound.currentTime = 0; shootSound.play(); } catch(e){}
    });

    window.addEventListener("keydown", e=>{
        if(e.code === "Escape" && gameStarted && !gamePaused){
            gamePaused = true;
            centerMsg.innerHTML = `<div style="font-size: 24px; font-weight: bold;">PAUSED</div><br><b>Press ESC to Resume</b>`;
            centerMsg.style.display = "block";
            document.exitPointerLock?.();
        } else if(e.code === "Escape" && gamePaused){
            gamePaused = false;
            centerMsg.style.display = "none";
            canvas.requestPointerLock();
        }
    });

    function updateBullets(dt){
        for(let i=player.bullets.length-1;i>=0;i--){
            const b=player.bullets[i];
            b.x+=Math.cos(b.angle)*b.speed*dt; 
            b.y+=Math.sin(b.angle)*b.speed*dt;
            if(!maze[b.y|0] || maze[b.y|0][b.x|0]===1){
                player.bullets.splice(i,1); 
                continue;
            }
            enemies.forEach(e=>{
                if(!e.alive) return;
                if(Math.hypot(b.x-e.x,b.y-e.y)<0.5){
                    e.alive=false; 
                    e.hitTime=0.3; 
                    player.bullets.splice(i,1); 
                    score++;
                    // Play hit sound
                    try { hitSound.currentTime = 0; hitSound.play(); } catch(e){}
                    return; // Bullet is spent, exit the loop for this bullet
                }
            });
        }
    }

    function drawMinimap(){
        mctx.clearRect(0,0,minimap.width,minimap.height);
        const scale=minimap.width/mazeWidth;
        // Aesthetic: dark background, soft border
        mctx.save();
        mctx.globalAlpha = 0.95;
        mctx.fillStyle = '#181c24';
        mctx.fillRect(0,0,minimap.width,minimap.height);
        mctx.globalAlpha = 1.0;
        mctx.strokeStyle = '#fff8';
        mctx.lineWidth = 3;
        mctx.strokeRect(0,0,minimap.width,minimap.height);
        mctx.restore();
        for(let y=0;y<mazeHeight;y++){
            for(let x=0;x<mazeWidth;x++){
                if(maze[y][x]===1){
                    mctx.fillStyle="#3a2d1a"; 
                    mctx.fillRect(x*scale,y*scale,scale,scale);
                }
            }
        }
        // Start (green)
        mctx.fillStyle="lime"; 
        mctx.fillRect(startPoint.x*scale-5,startPoint.y*scale-5,10,10);
        // Exit (blue)
        mctx.fillStyle="#3a8dde"; 
        mctx.fillRect(endPoint.x*scale-5,endPoint.y*scale-5,10,10);
        // Player (yellow box)
        mctx.fillStyle="#ffe066";
        mctx.fillRect(player.x*scale-4, player.y*scale-4, 8, 8);
        enemies.forEach(e=>{
            if(e.alive){
                mctx.fillStyle="#ff4d4d"; 
                mctx.fillRect(e.x*scale-3,e.y*scale-3,6,6);
            }
        });
    }

    function updateHUD(){
        HUD.score.innerText=`Score: ${score}`;
        HUD.level.innerText=`Level: ${level}`;
        const minutes=Math.floor(timeLeft/60), seconds=timeLeft%60;
        HUD.time.innerText=`Time: ${minutes}:${seconds<10?'0':''}${seconds}`;
        HUD.enemiesLeft.innerText=`Enemies: ${enemies.filter(e=>e.alive).length}`;
    }

function drawGun() {
    const gunWidth = gun.width * 0.6;
    const gunHeight = gun.height * 0.6;

    const x = gun.screenX - gunWidth / 2;
    const y = gun.screenY - gunHeight / 2;

    // --- Compact Gun Body (clean rectangle with light metal shading) ---
    let bodyGrad = ctx.createLinearGradient(x, y, x + gunWidth, y + gunHeight);
    bodyGrad.addColorStop(0, "#555");
    bodyGrad.addColorStop(0.5, "#2b2b2b");
    bodyGrad.addColorStop(1, "#6b6b6b");

    ctx.save();
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y + 10, gunWidth, gunHeight - 10, 10);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // --- Connected Barrel (small + properly attached) ---
    const barrelX = gun.screenX;
    const barrelY = y - 10;

    let barrelGrad = ctx.createLinearGradient(barrelX - 5, barrelY - 15, barrelX + 5, barrelY);
    barrelGrad.addColorStop(0, "#d8d8d8");
    barrelGrad.addColorStop(1, "#444");

    ctx.save();
    ctx.fillStyle = barrelGrad;

    // Barrel base (connection point)
    ctx.beginPath();
    ctx.rect(barrelX - 5, y, 10, 8);
    ctx.fill();

    // Barrel tip
    ctx.beginPath();
    ctx.roundRect(barrelX - 4, barrelY - 15, 8, 20, 4);
    ctx.fill();
    ctx.restore();

    // --- Small Highlight for metallic look ---
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#fff";
    ctx.fillRect(x + gunWidth * 0.2, y + gunHeight * 0.25, gunWidth * 0.6, 4);
    ctx.restore();

    // --- Crosshair (unchanged) ---
    ctx.strokeStyle = gun.free ? "lime" : "#ffe066";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gun.screenX - 8, gun.screenY);
    ctx.lineTo(gun.screenX + 8, gun.screenY);
    ctx.moveTo(gun.screenX, gun.screenY - 8);
    ctx.lineTo(gun.screenX, gun.screenY + 8);
    ctx.stroke();
}


    function castRay(px, py, angle) {
        const rayDirX = Math.cos(angle);
        const rayDirY = Math.sin(angle);

        let mapX = Math.floor(px);
        let mapY = Math.floor(py);

        const deltaDistX = (rayDirX === 0) ? 1e30 : Math.abs(1 / rayDirX);
        const deltaDistY = (rayDirY === 0) ? 1e30 : Math.abs(1 / rayDirY);

        let stepX, stepY;
        let sideDistX, sideDistY;

        if (rayDirX < 0) {
            stepX = -1;
            sideDistX = (px - mapX) * deltaDistX;
        } else {
            stepX = 1;
            sideDistX = (mapX + 1.0 - px) * deltaDistX;
        }

        if (rayDirY < 0) {
            stepY = -1;
            sideDistY = (py - mapY) * deltaDistY;
        } else {
            stepY = 1;
            sideDistY = (mapY + 1.0 - py) * deltaDistY;
        }

        let hit = 0;
        let side;
        const maxDist = 20;
        let dist = 0;

        while (hit === 0 && dist < maxDist) {
            if (sideDistX < sideDistY) {
                sideDistX += deltaDistX;
                mapX += stepX;
                side = 0; // Hit a vertical wall
            } else {
                sideDistY += deltaDistY;
                mapY += stepY;
                side = 1; // Hit a horizontal wall
            }

            if (mapX < 0 || mapX >= mazeWidth || mapY < 0 || mapY >= mazeHeight || (maze[mapY] && maze[mapY][mapX] === 1)) {
                hit = 1;
            }
        }

        if(hit){
            if(side === 0){
                dist = (mapX - px + (1 - stepX) / 2) / rayDirX;
            } else {
                dist = (mapY - py + (1 - stepY) / 2) / rayDirY;
            }
            return { dist: dist, side: side };
        }
        return { dist: maxDist, side: -1 };
    }

    function drawWallStripe(x, wallHeight, shade, side){
        const startY = (canvas.height - wallHeight) / 2;
        
        // A single color for the wall, with shading based on distance and side
        let baseR = 180, baseG = 160, baseB = 130; // A brownish/stone color

        // Darken one side to give a sense of depth
        if (side === 1) { // horizontal wall
            baseR *= 0.8;
            baseG *= 0.8;
            baseB *= 0.8;
        }

        // Apply distance-based shading
        const r = Math.max(0, baseR - shade);
        const g = Math.max(0, baseG - shade);
        const b = Math.max(0, baseB - shade);

        ctx.fillStyle = `rgb(${r|0},${g|0},${b|0})`;
        ctx.fillRect(x, startY, 1, wallHeight);
    }

    let last=performance.now();
    const centerMsg=document.querySelector(".center-msg");

    const showStartScreen = () => {
        centerMsg.innerHTML = `<div style="font-size: 36px; font-weight: bold; margin-bottom: 30px; color: #00ff00;">MAZE GUNNER</div>
        <div style="font-size: 13px; line-height: 2; margin: 20px 0; color: #ccc;">
        <b>CONTROLS:</b><br>WASD/Arrows: Move | Mouse: Aim<br>Click: Fire | ESC: Pause<br><br>
        <b>GOAL:</b><br>Kill all enemies & reach EXIT. There ae two levels to win!!!<br>
        </div>
        <div style="font-size: 14px; margin: 20px 0; color: #ffff00;">
        <b>LEVEL: ${level} | SCORE: ${score}</b></div>
        <div style="font-size: 12px; color: #888; margin-top: 20px;">CLICK TO START</div>`;
        centerMsg.style.display = "block";
    };
    showStartScreen();

    // EXIT button UI
    const exitBtn = {
        x: null, y: null, w: 100, h: 40, visible: false
    };

    function drawExitButton() {
        // Always show during gameplay
        if (!gameStarted || gamePaused) return;
        exitBtn.w = 110;
        exitBtn.h = 44;
        exitBtn.x = canvas.width - exitBtn.w - 32;
        exitBtn.y = canvas.height - exitBtn.h - 32;
        ctx.save();
        ctx.globalAlpha = 0.97;
        // Gradient blue button
        let grad = ctx.createLinearGradient(exitBtn.x, exitBtn.y, exitBtn.x, exitBtn.y+exitBtn.h);
        grad.addColorStop(0, '#3a8dde');
        grad.addColorStop(1, '#174a8c');
        ctx.fillStyle = grad;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(exitBtn.x, exitBtn.y, exitBtn.w, exitBtn.h, 14);
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.stroke();
        ctx.globalAlpha = 1.0;
        ctx.font = "bold 22px Arial";
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("EXIT", exitBtn.x + exitBtn.w/2, exitBtn.y + exitBtn.h/2);
        ctx.restore();
    }

    window.addEventListener("mousedown", (e)=>{
        // Check EXIT button click
        if (gameStarted && !gamePaused) {
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            if (
                mx >= exitBtn.x && mx <= exitBtn.x + exitBtn.w &&
                my >= exitBtn.y && my <= exitBtn.y + exitBtn.h
            ) {
                // EXIT: stop game, show start screen
                gameStarted = false;
                gamePaused = false;
                document.exitPointerLock?.();
                showStartScreen();
                return;
            }
        }
    });

    function loop(now){
        const dt=(now-last)/1000; 
        last=now;
        if(!gameStarted || gamePaused){ requestAnimationFrame(loop); return; }

        const move=dt*player.speed;
        // --- Smooth movement with collision buffer ---
        const buffer = 0.18; // collision buffer for smooth sliding
        function canMove(nx, ny) {
            return (
                maze[Math.floor(ny-buffer)][Math.floor(nx-buffer)] === 0 &&
                maze[Math.floor(ny-buffer)][Math.floor(nx+buffer)] === 0 &&
                maze[Math.floor(ny+buffer)][Math.floor(nx-buffer)] === 0 &&
                maze[Math.floor(ny+buffer)][Math.floor(nx+buffer)] === 0
            );
        }
        // Track last movement direction for pointer
        let moved = false;
        if(input.keys["KeyW"]||input.keys["ArrowUp"]){
            const nx=player.x+Math.cos(player.angle)*move; 
            const ny=player.y+Math.sin(player.angle)*move;
            if(canMove(nx, player.y)) { player.x=nx; player.lastMoveAngle = player.angle; moved = true; }
            if(canMove(player.x, ny)) { player.y=ny; player.lastMoveAngle = player.angle; moved = true; }
        }
        if(input.keys["KeyS"]||input.keys["ArrowDown"]){
            const nx=player.x-Math.cos(player.angle)*move; 
            const ny=player.y-Math.sin(player.angle)*move;
            let backAngle = player.angle + Math.PI;
            if(canMove(nx, player.y)) { player.x=nx; player.lastMoveAngle = backAngle; moved = true; }
            if(canMove(player.x, ny)) { player.y=ny; player.lastMoveAngle = backAngle; moved = true; }
        }
        if(input.keys["KeyA"]||input.keys["ArrowLeft"]){
            const nx=player.x+Math.cos(player.angle-Math.PI/2)*move; 
            const ny=player.y+Math.sin(player.angle-Math.PI/2)*move;
            let leftAngle = player.angle - Math.PI/2;
            if(canMove(nx, player.y)) { player.x=nx; player.lastMoveAngle = leftAngle; moved = true; }
            if(canMove(player.x, ny)) { player.y=ny; player.lastMoveAngle = leftAngle; moved = true; }
        }
        if(input.keys["KeyD"]||input.keys["ArrowRight"]){
            const nx=player.x+Math.cos(player.angle+Math.PI/2)*move; 
            const ny=player.y+Math.sin(player.angle+Math.PI/2)*move;
            let rightAngle = player.angle + Math.PI/2;
            if(canMove(nx, player.y)) { player.x=nx; player.lastMoveAngle = rightAngle; moved = true; }
            if(canMove(player.x, ny)) { player.y=ny; player.lastMoveAngle = rightAngle; moved = true; }
        }

        player.angle+=input.mouseDX*0.002; 
        gun.screenX += input.mouseDX;
        gun.screenY += input.mouseDY;
        gun.screenX = Math.max(0, Math.min(canvas.width, gun.screenX));
        gun.screenY = Math.max(0, Math.min(canvas.height, gun.screenY));
        input.mouseDX=0;
        input.mouseDY=0;

        updateBullets(dt);

        ctx.fillStyle="#87ceeb"; 
        ctx.fillRect(0,0,canvas.width,canvas.height/2);
        ctx.fillStyle="#5a5a5a"; 
        ctx.fillRect(0,canvas.height/2,canvas.width,canvas.height/2);

        for(let x=0;x<canvas.width;x++){
            const angle = player.angle + (x/canvas.width-0.5)*Math.PI/3;
            const ray = castRay(player.x,player.y,angle);
            const dist = ray.dist * Math.cos(angle - player.angle); // Correct for fisheye
            const heightWall=(1/dist)*canvas.height;
            const shade=Math.min(255, dist * 30);
            drawWallStripe(x, heightWall, shade, ray.side);
        }

        enemies.forEach(e=>{
            if(!e.alive) return;
            e.time += dt;
            e.hitTime = Math.max(0, e.hitTime - dt);
            const dx=e.x-player.x, dy=e.y-player.y, dist=Math.hypot(dx,dy);
            let angleDiff = Math.atan2(dy, dx) - player.angle;
                        if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                        if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
            
                        const ray = castRay(player.x, player.y, Math.atan2(dy, dx));
                        if (ray.dist >= dist) {
                            const size = (1 / dist) * canvas.height;
                            const screenX = canvas.width / 2 + Math.tan(angleDiff) * (canvas.width / (Math.PI / 3));                const bobOffset = Math.sin(e.time * 3) * size * 0.07;
                const hitPulse = e.hitTime > 0 ? Math.sin(e.hitTime * 20) * 0.3 : 0;
                const drawSize = size * (1 + hitPulse);
                // Enemy body
                ctx.save();
                ctx.globalAlpha = 0.93;
                ctx.fillStyle = e.hitTime > 0 ? "#ffe066" : "#ff4d4d";
                ctx.beginPath();
                ctx.arc(screenX, canvas.height/2 + bobOffset, drawSize/2, 0, 2*Math.PI);
                ctx.fill();
                ctx.globalAlpha = 1.0;
                // Eyes
                ctx.fillStyle = "#fff";
                ctx.beginPath();
                ctx.arc(screenX - drawSize/6, canvas.height/2 + bobOffset - drawSize/8, drawSize/12, 0, 2*Math.PI);
                ctx.arc(screenX + drawSize/6, canvas.height/2 + bobOffset - drawSize/8, drawSize/12, 0, 2*Math.PI);
                ctx.fill();
                ctx.restore();
            }
        });

        const drawMarker = (px, py, label, color) => {
            const dx = px - player.x, dy = py - player.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0.5) { // Only draw if not too close
                let angleDiff = Math.atan2(dy, dx) - player.angle;
                if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

                if (Math.abs(angleDiff) < (Math.PI / 3) / 2) { // Check if within FOV
                    const size = (1 / dist) * canvas.height / 4;
                    const screenX = canvas.width / 2 + Math.tan(angleDiff) * (canvas.width / (Math.PI / 3));
                    const screenY = canvas.height / 2;
                    ctx.fillStyle = color;
                    ctx.fillRect(screenX - size / 2, screenY - size / 2, size, size);
                    ctx.fillStyle = "#fff";
                    ctx.font = "bold 16px monospace";
                    ctx.fillText(label, screenX - 15, screenY - size / 2 - 8);
                }
            }
        };
        drawMarker(startPoint.x, startPoint.y, "START", "#00ff00");
        drawMarker(endPoint.x, endPoint.y, "EXIT", "#0080ff");

        updateHUD();
        drawGun(); 
        drawMinimap();
        drawExitButton();

        const exitX=endPoint.x, exitY=endPoint.y;

        if(enemies.every(e=>!e.alive) && Math.hypot(player.x-exitX,player.y-exitY)<1){
            gameStarted=false;
            clearInterval(timerInterval);

            if(level >= maxLevel){
                centerMsg.innerHTML = `<div style="font-size: 28px; font-weight: bold; color: #00ff00;">GAME COMPLETE!</div><br><b>Final Score: ${score}</b><br><br><div style="font-size: 12px; color: #888;">Click to Play Again</div>`;
                level = 1;
                score = 0;
            } else {
                centerMsg.innerHTML = `<div style="font-size: 24px; font-weight: bold; color: #00ff00;">LEVEL ${level} COMPLETE!</div><br><b>Score: ${score}</b><br>Next: Level ${level + 1}<br><br><div style="font-size: 12px; color: #888;">Click to Continue</div>`;
                level++;
            }
            centerMsg.style.display="block";
        }

        requestAnimationFrame(loop);
    }

    let timerInterval = null;

    const startTimer = () => {
        if(timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(()=>{
            if(!gameStarted || gamePaused) return;
            if(timeLeft>0) timeLeft--; 
            else{
                gameStarted=false;
                centerMsg.innerHTML = `<div style="font-size: 28px; font-weight: bold; color: #ff4444;">TIME'S UP!</div><br><b>Score: ${score}</b><br><br><div style="font-size: 12px; color: #888;">Click to Retry</div>`;
                centerMsg.style.display="block";
            }
        },1000);
    };


    document.addEventListener("click", ()=>{
        if(gameStarted) return;
        canvas.requestPointerLock();
        gameStarted=true;
        gamePaused=false;
        timeLeft=levelTimes[level-1];
        generateMaze(level);
        spawnEnemies(Math.max(2, level + 1));
        centerMsg.style.display="none";
        startTimer();
    });

    window.addEventListener("keydown", e=>{
        if(e.code === "Escape" && !gameStarted && !gamePaused){
            level = 1;
            score = 0;
            showStartScreen();
        }
    });

    loop(performance.now());
})();

