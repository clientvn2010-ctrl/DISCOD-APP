require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createWebServer } = require('./web');
const { getCommands, handleCommand } = require('./commands');
const oauth = require('./oauth');

// ===== Validate env =====
const required = ['BOT_TOKEN', 'CLIENT_ID', 'CLIENT_SECRET'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`[✗] Thiếu biến môi trường: ${key}`);
    console.error(`    Hãy copy .env.example thành .env và điền đầy đủ thông tin.`);
    process.exit(1);
  }
}

const BOT_TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;

// ===== Discord Client =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

// ===== Đăng ký Slash Commands =====
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
  try {
    console.log('[⟳] Đang đăng ký slash commands...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), {
      body: getCommands(),
    });
    console.log('[✓] Đã đăng ký slash commands thành công!');
  } catch (err) {
    console.error('[✗] Lỗi đăng ký commands:', err);
  }
}

// ===== Event Handlers =====
client.once(Events.ClientReady, async () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   🤖 Member Migration Bot - Online!      ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Bot: ${client.user.tag.padEnd(33)}║`);
  console.log(`║  Servers: ${String(client.guilds.cache.size).padEnd(29)}║`);
  console.log(`║  Web: http://localhost:${String(PORT).padEnd(18)}║`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  // Đăng ký commands
  await registerCommands();

  // Khởi động web server
  const app = createWebServer(client);
  app.listen(PORT, async () => {
    console.log(`[✓] Web server nội bộ: http://localhost:${PORT}`);

    // Tự động tạo link Internet công khai (Auto-Tunnel) nếu dùng localhost hoặc chưa có domain
    const shouldTunnel = !process.env.REDIRECT_URI || process.env.REDIRECT_URI.includes('localhost');
    if (shouldTunnel) {
      try {
        console.log('[⟳] Đang tạo đường link Internet công khai tự động...');
        const localtunnel = require('localtunnel');
        const tunnel = await localtunnel({ port: PORT });

        const callbackUrl = `${tunnel.url}/callback`;
        process.env.REDIRECT_URI = callbackUrl;

        console.log('');
        console.log('╔════════════════════════════════════════════════════════════════════════╗');
        console.log('║  🌐 ĐƯỜNG LINK VERIFY CÔNG KHAI CỦA BẠN (TỰ ĐỘNG TẠO):                 ║');
        console.log(`║     ${callbackUrl.padEnd(65)}║`);
        console.log('║                                                                        ║');
        console.log('║  👉 Hãy copy link trên dán vào tab OAuth2 trên Discord Developer Portal║');
        console.log('╚════════════════════════════════════════════════════════════════════════╝');
        console.log('');

        tunnel.on('close', () => {
          console.log('[!] Tunnel công khai đã đóng.');
        });
      } catch (err) {
        console.log(`[!] Không mở được tunnel tự động (${err.message}). Dùng: ${process.env.REDIRECT_URI || 'http://localhost:3000/callback'}`);
      }
    } else {
      console.log(`[✓] Callback URL cấu hình: ${process.env.REDIRECT_URI}`);
    }

    console.log('');
    console.log('[i] Các lệnh có sẵn:');
    console.log('    /verify       - Gửi link verify');
    console.log('    /verify-panel - Tạo panel verify cố định');
    console.log('    /pull         - Kéo member vào server mới');
    console.log('    /stats        - Xem thống kê');
    console.log('    /reset        - Reset trạng thái pulled');
    console.log('');
  });
});

// Xử lý slash commands
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    await handleCommand(interaction, client);
  } catch (err) {
    console.error('[✗] Command error:', err);
    const reply = { content: '❌ Đã xảy ra lỗi khi xử lý lệnh.', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

// ===== Auto-DM verify link khi member mới vào server =====
client.on(Events.GuildMemberAdd, async (member) => {
  // Không DM bot
  if (member.user.bot) return;

  try {
    const authUrl = oauth.getAuthUrl(member.guild.id);

    const embed = new EmbedBuilder()
      .setTitle('🛡️ Xác Minh Tài Khoản')
      .setDescription(
        `Chào **${member.user.username}**! Chào mừng bạn đến với **${member.guild.name}**!\n\n` +
        'Vui lòng xác minh tài khoản để được truy cập đầy đủ các kênh.\n\n' +
        '> 🔒 Nhấn nút bên dưới — chỉ mất vài giây.'
      )
      .setColor(0x5865F2)
      .setThumbnail(member.guild.iconURL({ size: 256 }))
      .setFooter({ text: member.guild.name })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('✓ Xác Minh Ngay')
        .setStyle(ButtonStyle.Link)
        .setURL(authUrl)
    );

    await member.send({ embeds: [embed], components: [row] });
    console.log(`[→ DM] Đã gửi verify cho ${member.user.username} (${member.guild.name})`);
  } catch (err) {
    // User tắt DM — bỏ qua
    console.log(`[→ DM] Không gửi được cho ${member.user.username}: ${err.message}`);
  }
});

// ===== Graceful Shutdown =====
process.on('SIGINT', () => {
  console.log('\n[i] Đang tắt bot...');
  require('./database').close();
  client.destroy();
  process.exit(0);
});

process.on('unhandledRejection', (err) => {
  console.error('[✗] Unhandled rejection:', err);
});

// ===== Start =====
(async () => {
  const db = require('./database');
  await db.init();
  client.login(BOT_TOKEN);
})();

