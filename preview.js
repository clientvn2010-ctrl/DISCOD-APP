const express = require('express');
const { getVerifyPage, getSuccessPage, getErrorPage } = require('./web');

const app = express();
const PORT = 3000;

// 1. Xem trước trang Verify (Nền Matrix Rain, thẻ bo góc neon)
app.get('/', (req, res) => {
  const guildName = req.query.guild || 'immortals';
  const guildIcon = 'https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0a6a49cf127bf92de1e2_icon_clyde_blurple_RGB.png';
  const authUrl = '/demo-success'; // Bấm vào sẽ chuyển thẳng sang trang hoàn tất để test

  res.send(getVerifyPage(authUrl, guildName, guildIcon));
});

// 2. Xem trước trang Hoàn tất Verify (Giống hệt ảnh Vaultcord của bạn)
app.get('/demo-success', (req, res) => {
  const username = 'hpstore1612';
  const avatarUrl = 'https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0a6a49cf127bf92de1e2_icon_clyde_blurple_RGB.png';
  const guildName = 'immortals';

  res.send(getSuccessPage(username, avatarUrl, guildName));
});

// 3. Xem trước trang Báo lỗi
app.get('/demo-error', (req, res) => {
  res.send(getErrorPage('Không nhận được mã xác thực từ Discord hoặc phiên làm việc đã hết hạn.'));
});

app.listen(PORT, () => {
  console.log('');
  console.log('╔═════════════════════════════════════════════════════════════╗');
  console.log('║       🚀 SERVER PREVIEW TEST ĐANG CHẠY!                     ║');
  console.log('╠═════════════════════════════════════════════════════════════╣');
  console.log(`║  1. Trang Verify (Matrix):   http://localhost:${PORT}             ║`);
  console.log(`║  2. Trang Hoàn tất (Done):   http://localhost:${PORT}/demo-success ║`);
  console.log(`║  3. Trang Báo lỗi:           http://localhost:${PORT}/demo-error   ║`);
  console.log('╚═════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('[✓] Hãy mở trình duyệt và vào link: http://localhost:3000 để trải nghiệm!');
});
