const express = require('express');
const oauth = require('./oauth');
const db = require('./database');
const path = require('path');

function createWebServer(discordClient) {
  const app = express();

  // ===== Trang chủ - Verify =====
  app.get('/', (req, res) => {
    const guildId = req.query.guild;
    const state = guildId || 'none';
    const authUrl = oauth.getAuthUrl(state);

    let guildName = 'Discord Server';
    let guildIcon = '';

    if (guildId && discordClient) {
      const g = discordClient.guilds.cache.get(guildId);
      if (g) {
        guildName = g.name;
        guildIcon = g.iconURL({ size: 128, extension: 'png' }) || '';
      }
    }

    res.send(getVerifyPage(authUrl, guildName, guildIcon));
  });

  // ===== OAuth2 Callback =====
  app.get('/callback', async (req, res) => {
    const { code, state } = req.query;
    if (!code) return res.status(400).send(getErrorPage('Không nhận được code từ Discord.'));

    try {
      // 1. Đổi code lấy token
      const tokenData = await oauth.exchangeCode(code);

      // 2. Lấy thông tin user
      const user = await oauth.getUser(tokenData.access_token);

      // 3. Lưu vào database
      db.saveMember({
        user_id: user.id,
        username: user.username,
        discriminator: user.discriminator || '0',
        avatar: user.avatar,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || null,
        token_expires_at: tokenData.expires_in
          ? Math.floor(Date.now() / 1000) + tokenData.expires_in
          : null,
        source_guild_id: state !== 'none' ? state : null,
      });

      console.log(`[✓ Verify] ${user.username} (${user.id}) đã verify thành công`);

      let guildName = 'Server';
      if (state && state !== 'none' && discordClient) {
        const g = discordClient.guilds.cache.get(state);
        if (g) guildName = g.name;
      }

      const userAvatar = user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
        : 'https://cdn.discordapp.com/embed/avatars/0.png';

      res.send(getSuccessPage(user.username, userAvatar, guildName));

    } catch (err) {
      console.error('[✗ Verify Error]', err.message);
      res.status(500).send(getErrorPage(err.message));
    }
  });

  // ===== API: Xem stats =====
  app.get('/api/stats', (req, res) => {
    res.json({
      stats: db.getStats(),
      byGuild: db.getStatsByGuild(),
    });
  });

  // ===== API: Danh sách members =====
  app.get('/api/members', (req, res) => {
    const members = db.getAllMembers().map(m => ({
      user_id: m.user_id,
      username: m.username,
      avatar: m.avatar,
      source_guild_id: m.source_guild_id,
      verified_at: m.verified_at,
      pulled: m.pulled,
    }));
    res.json({ members });
  });

  return app;
}

// ===== Utility =====
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ===== Matrix Rain Script =====
const MATRIX_SCRIPT = `
  const canvas = document.getElementById('matrix-canvas');
  const ctx = canvas.getContext('2d');

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  const characters = 'アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ<>{}/*+=~';
  const fontSize = 15;
  let columns = Math.floor(canvas.width / fontSize);
  let drops = Array(columns).fill(1);

  window.addEventListener('resize', () => {
    columns = Math.floor(canvas.width / fontSize);
    drops = Array(columns).fill(1);
  });

  function drawMatrix() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#00ff66';
    ctx.font = fontSize + 'px monospace';

    for (let i = 0; i < drops.length; i++) {
      const char = characters.charAt(Math.floor(Math.random() * characters.length));
      
      if (Math.random() > 0.85) {
        ctx.fillStyle = '#b3ffcc';
      } else {
        ctx.fillStyle = '#00e65c';
      }

      ctx.fillText(char, i * fontSize, drops[i] * fontSize);

      if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
        drops[i] = 0;
      }
      drops[i]++;
    }
  }

  setInterval(drawMatrix, 33);

  // Typewriter effect function
  function runTypewriter(targetId, text, speed = 45) {
    const el = document.getElementById(targetId);
    if (!el) return;
    el.textContent = '';
    let i = 0;
    function type() {
      if (i < text.length) {
        el.textContent += text.charAt(i);
        i++;
        setTimeout(type, speed);
      }
    }
    type();
  }
`;

// ===== Shared CSS =====
const SHARED_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background-color: #000;
    color: #e0e0e0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;
  }
  #matrix-canvas {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 1;
    pointer-events: none;
  }
  .container {
    position: relative;
    z-index: 10;
    width: 100%;
    max-width: 440px;
    padding: 20px;
  }
  .toast-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #00e676;
    color: #051a0e;
    font-size: 11px;
    font-weight: 700;
    padding: 5px 12px;
    border-radius: 6px;
    margin-bottom: -10px;
    margin-left: 14px;
    position: relative;
    z-index: 15;
    box-shadow: 0 4px 15px rgba(0, 230, 118, 0.4);
    animation: fadeInDown 0.4s ease;
  }
  @keyframes fadeInDown {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .card {
    background: rgba(10, 15, 12, 0.88);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1.5px solid rgba(0, 255, 128, 0.45);
    border-radius: 22px;
    padding: 38px 32px 32px;
    text-align: center;
    box-shadow: 0 0 35px rgba(0, 255, 128, 0.18), 0 25px 60px rgba(0, 0, 0, 0.9);
  }
  .avatar-wrapper {
    position: relative;
    width: 86px;
    height: 86px;
    margin: 0 auto 14px;
  }
  .avatar {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid rgba(0, 255, 128, 0.6);
    box-shadow: 0 0 20px rgba(0, 255, 128, 0.3);
    background: #111;
  }
  .title {
    font-size: 26px;
    font-weight: 800;
    color: #ffffff;
    margin-bottom: 6px;
    letter-spacing: -0.5px;
    text-shadow: 0 2px 10px rgba(0,0,0,0.5);
  }
  
  /* Trust Pill Badge (Huy hiệu tạo lòng tin giống VaultCord) */
  .trust-badge-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 9999px;
    padding: 5px 14px;
    margin: 8px auto 16px;
    font-size: 11px;
    color: #4ade80;
    font-weight: 500;
    letter-spacing: 0.2px;
  }
  .trust-icon {
    width: 14px;
    height: 14px;
    fill: #4ade80;
    flex-shrink: 0;
  }

  .status-text {
    font-size: 13px;
    color: #9ca3af;
    margin-bottom: 22px;
    line-height: 1.5;
    min-height: 20px;
    font-family: monospace;
  }
  .cursor-blink::after {
    content: '▋';
    color: #00ff66;
    animation: blink 1s infinite;
    margin-left: 2px;
  }
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }

  .btn-verify {
    display: block;
    width: 100%;
    padding: 14px 20px;
    background: linear-gradient(135deg, #cd93ff, #b97feb);
    color: #000;
    font-weight: 700;
    font-size: 15px;
    border-radius: 12px;
    text-decoration: none;
    border: none;
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(185, 127, 235, 0.4);
    transition: all 0.25s ease;
  }
  .btn-verify:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 25px rgba(185, 127, 235, 0.65);
    filter: brightness(1.1);
  }
  .btn-completed {
    display: block;
    width: 100%;
    padding: 14px 20px;
    background: #473a5a;
    color: #bfa9dd;
    font-weight: 700;
    font-size: 14px;
    border-radius: 12px;
    border: 1px solid rgba(168, 85, 247, 0.3);
    cursor: default;
    user-select: none;
  }
  .footer {
    position: relative;
    z-index: 10;
    margin-top: 22px;
    font-size: 11px;
    color: #6b7280;
    text-align: center;
  }
  .footer span {
    color: #f43f5e;
    font-weight: 600;
  }
`;

// ===== 1. Verify Page (Giao diện Matrix + Badge uy tín + Typewriter) =====
function getVerifyPage(authUrl, guildName, guildIcon) {
  const safeGuildName = escapeHtml(guildName);
  const avatarSrc = guildIcon || 'https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0a6a49cf127bf92de1e2_icon_clyde_blurple_RGB.png';

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🤖 Verification required</title>
  <style>
    ${SHARED_CSS}
  </style>
</head>
<body>
  <canvas id="matrix-canvas"></canvas>

  <div class="container">
    <div class="toast-badge">
      Verification required
    </div>

    <div class="card">
      <div class="avatar-wrapper">
        <img class="avatar" src="${avatarSrc}" alt="${safeGuildName}">
      </div>
      <h1 class="title">${safeGuildName}</h1>

      <!-- Huy hiệu tạo lòng tin giống hệt VaultCord -->
      <div class="trust-badge-pill">
        <svg class="trust-icon" viewBox="0 0 24 24">
          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>
        </svg>
        <span>Email isn't collected or saved</span>
      </div>

      <!-- Hiệu ứng chữ gõ Typewriter -->
      <p class="status-text cursor-blink" id="typewriter-text"></p>
      
      <a href="${authUrl}" class="btn-verify">Verify with Discord</a>
    </div>

    <div class="footer">
      Secured by Discord OAuth2 &bull; <span>Private & Encrypted</span>
    </div>
  </div>

  <script>
    ${MATRIX_SCRIPT}
    runTypewriter('typewriter-text', 'Click button to verify your account..', 40);
  </script>
</body>
</html>`;
}

// ===== 2. Success Page (Giống hệt ảnh Vaultcord + Typewriter "close this web") =====
function getSuccessPage(username, avatarUrl, guildName) {
  const safeUsername = escapeHtml(username);
  const safeGuildName = escapeHtml(guildName);
  const safeAvatar = avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png';

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Complete - ${safeGuildName}</title>
  <style>
    ${SHARED_CSS}
  </style>
</head>
<body>
  <canvas id="matrix-canvas"></canvas>

  <div class="container">
    <div class="toast-badge">
      ${safeUsername} added to '${safeGuildName}'!
    </div>
    
    <div class="card">
      <div class="avatar-wrapper">
        <img class="avatar" src="${safeAvatar}" alt="${safeUsername}">
      </div>
      <h1 class="title">${safeGuildName}</h1>
      
      <div class="trust-badge-pill" style="color: #60a5fa; border-color: rgba(96, 165, 250, 0.2);">
        <svg class="trust-icon" viewBox="0 0 24 24" style="fill: #60a5fa;">
          <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
        </svg>
        <span>Authentication verified</span>
      </div>

      <!-- Typewriter chữ "close this web" giống VaultCord -->
      <p class="status-text cursor-blink" id="typewriter-text" style="color: #9ca3af; font-size: 13px;"></p>

      <div class="btn-completed">
        Verify complete, close this site.
      </div>
    </div>

    <div class="footer">
      Service verified &bull; <span>Privacy Protected</span>
    </div>
  </div>

  <script>
    ${MATRIX_SCRIPT}
    runTypewriter('typewriter-text', 'close this web', 60);
  </script>
</body>
</html>`;
}

// ===== 3. Error Page =====
function getErrorPage(message) {
  const safeMessage = escapeHtml(message);

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verification Error</title>
  <style>
    ${SHARED_CSS}
    .card-error {
      border-color: rgba(239, 68, 68, 0.5) !important;
      box-shadow: 0 0 35px rgba(239, 68, 68, 0.2), 0 25px 60px rgba(0, 0, 0, 0.9) !important;
    }
  </style>
</head>
<body>
  <canvas id="matrix-canvas"></canvas>

  <div class="container">
    <div class="card card-error">
      <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
      <h1 class="title" style="color: #ef4444;">Verification Failed</h1>
      <p class="status-text" style="margin-top: 10px;"><code>${safeMessage}</code></p>
      <a href="/" class="btn-verify" style="background: #ef4444; color: #fff;">Try Again</a>
    </div>
  </div>

  <script>${MATRIX_SCRIPT}</script>
</body>
</html>`;
}

module.exports = { createWebServer, getVerifyPage, getSuccessPage, getErrorPage };
