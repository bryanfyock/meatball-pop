// ================== Meatball Pop — game.js (full file) ==================

// ---------- Canvas + sizing ----------
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function sizeCanvas(){
  const container = document.getElementById('game-container');
  const maxW = Math.min(980, container.clientWidth - 24); // padding allowance
  const hFromW = Math.floor(maxW * 9/16);                 // keep 16:9
  const maxH = Math.floor(window.innerHeight * 0.65);     // keep inside viewport
  const h = Math.max(300, Math.min(hFromW, maxH));
  const w = Math.floor(h * 16/9);
  canvas.width = w; canvas.height = h;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', sizeCanvas);
} else sizeCanvas();
window.addEventListener('resize', sizeCanvas, { passive: true });

// ---------- HUD + Controls ----------
const levelEl   = document.getElementById('level');
const targetsEl = document.getElementById('targets');
const timeEl    = document.getElementById('time');

const startBtn  = document.getElementById('startBtn');
const pauseBtn  = document.getElementById('pauseBtn');
const soundBtn  = document.getElementById('soundBtn');

// Tiny debug badge (auto-created)
let badge = document.getElementById('imgBadge');
if (!badge) {
  badge = document.createElement('div');
  badge.id = 'imgBadge';
  badge.textContent = 'IMG: …';
  badge.style.cssText = 'position:fixed;right:10px;top:10px;padding:4px 8px;border-radius:6px;background:#1f2937;border:1px solid #334155;font-size:12px;color:#fff;opacity:.85;z-index:50';
  document.body.appendChild(badge);
}

// ---------- Assets (your meatball art) ----------
const meatballImg = new Image();
let imgReady = false;

// Use cache-buster only when served over HTTP(S). On file:// it breaks.
const baseSrc = 'assets/meatball.png';
const MEATBALL_SRC = (location.protocol === 'file:' ? baseSrc : `${baseSrc}?cb=${Date.now()}`);

meatballImg.onload = () => { imgReady = true; badge.textContent = 'IMG: OK'; console.log('[MeatballPop] meatball.png loaded'); };
meatballImg.onerror = (e) => { imgReady = false; badge.textContent = 'IMG: FAIL'; console.warn('[MeatballPop] Failed to load assets/meatball.png', e); };
meatballImg.src = MEATBALL_SRC;

// ---------- State ----------
let balls = [];
let popFlashes = []; // quick pale "cheese" flashes on pop

let level = 1;
let timeLeft = 20;
let targetsRemaining = 0;

let isPaused = false;
let running = false;
let gameRAF = 0;
let timerId = 0;
let soundOn = true;

const popSound = new Audio('https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg');

const rand=(a,b)=>Math.random()*(b-a)+a;

// Gentle ramp; finish in < ~5 minutes total for 10 levels
function levelConfig(n){
  return {
    time: 20,                        // seconds per level
    count: 6 + (n-1)*2,              // L1=6 → L10=24
    size: { min: 36, max: Math.max(36, 56 - (n-1)*2) }, // slowly smaller
    speed: 60 + (n-1)*8              // px/sec upward
  };
}

// ---------- Spawning (ON-SCREEN immediately) ----------
function spawnBall(cfg){
  const r  = rand(cfg.size.min, cfg.size.max);
  const x  = rand(r, canvas.width - r);
  // Spawn in the lower 75% of the canvas so they are visible immediately
  const y  = rand(canvas.height * 0.25, canvas.height - r);

  const vx = rand(-20, 20);
  const vy = cfg.speed + rand(-10, 20); // upward float
  balls.push({ x, y, r, vx, vy, rot: rand(0,Math.PI*2), spin: rand(-0.8,0.8) });
}

function startLevel(n=1){
  level = n;
  const cfg = levelConfig(level);

  // (Optional) if you ever swapped the icon, retry default file each start
  if (meatballImg && (location.protocol !== 'file:')) {
    const fresh = `${baseSrc}?cb=${Date.now()}`;
    if (meatballImg.src !== fresh) {
      imgReady = false;
      meatballImg.onload  = () => { imgReady = true; badge.textContent='IMG: OK'; };
      meatballImg.onerror = () => { imgReady = false; badge.textContent='IMG: FAIL'; };
      meatballImg.src = fresh;
    }
  }

  // reset state
  timeLeft = cfg.time;
  balls.length = 0;
  popFlashes.length = 0;
  for(let i=0;i<cfg.count;i++) spawnBall(cfg);
  targetsRemaining = balls.length;
  updateHUD();

  // cancel previous loops/timers
  if (gameRAF) cancelAnimationFrame(gameRAF);
  if (timerId) clearInterval(timerId);
  running = true; isPaused = false;

  // timer
  timerId = setInterval(()=>{
    if (!running || isPaused) return;
    timeLeft = Math.max(0, timeLeft-1);
    updateHUD();
    if (timeLeft === 0){
      endLevel(false);
    }
  }, 1000);

  // start loop
  gameRAF = requestAnimationFrame(loop);
}

function endLevel(won){
  running = false;
  if (gameRAF) cancelAnimationFrame(gameRAF);
  if (timerId) clearInterval(timerId);

  if (won){
    if (level >= 10){
      alert('Congratulations! You win!\nPromo Code: BallGameWinner');
      startLevel(1);
    } else {
      alert(`Level ${level} complete! Starting Level ${level+1}`);
      startLevel(level+1);
    }
  } else {
    alert(`Level ${level} — Try again`);
    startLevel(level);
  }
}

function updateHUD(){
  levelEl.textContent   = level;
  targetsEl.textContent = targetsRemaining;
  timeEl.textContent    = timeLeft;
}

// ---------- Input ----------
canvas.addEventListener('click', (e)=>{
  if (!running || isPaused) return;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width/rect.width);
  const y = (e.clientY - rect.top ) * (canvas.height/rect.height);

  for (let i = balls.length-1; i >= 0; i--){
    const b = balls[i];
    if (Math.hypot(b.x - x, b.y - y) <= b.r){
      balls.splice(i,1);
      targetsRemaining = Math.max(0, targetsRemaining-1);
      // quick pale "cheese" flash
      popFlashes.push({x, y, age:0, life:220}); // ms
      if (soundOn) { try { popSound.currentTime = 0; popSound.play(); } catch{} }
      updateHUD();
      if (targetsRemaining === 0) endLevel(true);
      break;
    }
  }
});

// Controls
startBtn.addEventListener('click', ()=> startLevel(1));
pauseBtn.addEventListener('click', ()=>{
  if (!running) return;
  isPaused = !isPaused;
  pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
  if (!isPaused) gameRAF = requestAnimationFrame(loop);
});
soundBtn.addEventListener('click', ()=>{
  soundOn = !soundOn;
  soundBtn.textContent = soundOn ? 'Sound: On' : 'Sound: Off';
});

// ---------- Main loop ----------
let lastTs = 0;

function loop(ts){
  if (!running || isPaused) return;
  if (!lastTs) lastTs = ts;
  const dt = Math.min(1/30, (ts - lastTs)/1000);
  lastTs = ts;

  // update balls
  for (const b of balls){
    b.x += b.vx * dt;
    b.y -= b.vy * dt;
    b.rot += b.spin * dt;
    if (b.x < b.r) { b.x = b.r; b.vx *= -1; }
    if (b.x > canvas.width - b.r) { b.x = canvas.width - b.r; b.vx *= -1; }
  }
  // remove those that drifted off top (missed)
  for (let i=balls.length-1;i>=0;i--){
    if (balls[i].y + balls[i].r < -10) balls.splice(i,1);
  }
  if (balls.length === 0 && targetsRemaining > 0) return endLevel(false);

  // draw background
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const g = ctx.createLinearGradient(0,canvas.height,0,0);
  g.addColorStop(0,'#0f172a'); g.addColorStop(1,'#1e293b');
  ctx.fillStyle = g; ctx.fillRect(0,0,canvas.width,canvas.height);

  // draw balls (use meatball art if loaded; otherwise draw fallback)
  for (const b of balls){
    ctx.save();
    ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.clip();
    if (imgReady){
      const d = b.r*2;
      ctx.translate(b.x,b.y); ctx.rotate(b.rot); ctx.translate(-b.x,-b.y);
      const ratio = Math.max(d/meatballImg.width, d/meatballImg.height);
      const iw = meatballImg.width*ratio, ih = meatballImg.height*ratio;
      ctx.drawImage(meatballImg, b.x - iw/2, b.y - ih/2, iw, ih);
    } else {
      // temporary fallback tint (only shows if PNG didn't load)
      ctx.fillStyle = '#9d4b00';
      ctx.fillRect(b.x-b.r, b.y-b.r, b.r*2, b.r*2);
    }
    ctx.restore();
    // rim
    ctx.strokeStyle='rgba(255,255,255,0.6)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.stroke();
  }

  // draw quick pale "cheese" flashes
  for (let i=popFlashes.length-1; i>=0; i--){
    const p = popFlashes[i];
    p.age += dt*1000;
    const t = Math.min(1, p.age/p.life);
    const alpha = 1 - t;
    const r = 10 + 40*t;
    const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    grd.addColorStop(0, `rgba(255, 250, 230, ${0.9*alpha})`);
    grd.addColorStop(1, `rgba(255, 220, 120, 0)`);
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(p.x,p.y,r,0,Math.PI*2); ctx.fill();
    if (p.age >= p.life) popFlashes.splice(i,1);
  }

  gameRAF = requestAnimationFrame(loop);
}
// =======================================================================
