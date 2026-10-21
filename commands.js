const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');
const db = require('./database');
const oauth = require('./oauth');

/** Đăng ký slash commands */
function getCommands() {
  return [
    new SlashCommandBuilder()
      .setName('verify')
      .setDescription('Gửi link xác minh cho thành viên')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('verify-panel')
      .setDescription('Tạo panel xác minh cố định trong kênh')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addStringOption(opt =>
        opt.setName('title')
          .setDescription('Tiêu đề panel (Mặc định: 🤖 Verification required)')
          .setRequired(false)
      )
      .addStringOption(opt =>
        opt.setName('description')
          .setDescription('Nội dung mô tả (Mặc định: click button verify)')
          .setRequired(false)
      )
      .addBooleanOption(opt =>
        opt.setName('everyone')
          .setDescription('Tag @everyone khi gửi panel không?')
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName('pull')
      .setDescription('Kéo tất cả thành viên đã verify vào server này')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addStringOption(opt =>
        opt.setName('target')
          .setDescription('ID server đích (mặc định dùng TARGET_GUILD_ID trong .env)')
          .setRequired(false)
      )
      .addStringOption(opt =>
        opt.setName('source')
          .setDescription('Chỉ kéo member từ guild nguồn cụ thể')
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName('stats')
      .setDescription('Xem thống kê thành viên đã verify')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('reset')
      .setDescription('Reset trạng thái pulled để kéo lại tất cả')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  ].map(cmd => cmd.toJSON());
}

/** Xử lý slash commands */
async function handleCommand(interaction, client) {
  const { commandName } = interaction;

  switch (commandName) {
    case 'verify':
      return handleVerify(interaction);
    case 'verify-panel':
      return handleVerifyPanel(interaction);
    case 'pull':
      return handlePull(interaction, client);
    case 'stats':
      return handleStats(interaction);
    case 'reset':
      return handleReset(interaction);
  }
}

// ===== /verify =====
async function handleVerify(interaction) {
  const verifyUrl = `${process.env.REDIRECT_URI.replace('/callback', '')}?guild=${interaction.guildId}`;
  const authUrl = oauth.getAuthUrl(interaction.guildId);

  const embed = new EmbedBuilder()
    .setTitle('🛡️ Xác Minh Tài Khoản')
    .setDescription('Nhấn nút bên dưới để xác minh tài khoản Discord của bạn.\nQuá trình này hoàn toàn an toàn và chỉ mất vài giây.')
    .setColor(0x5865F2)
    .setFooter({ text: 'Member Migration Bot' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('✓ Xác Minh Ngay')
      .setStyle(ButtonStyle.Link)
      .setURL(authUrl)
  );

  await interaction.reply({ embeds: [embed], components: [row] });
}

// ===== /verify-panel =====
async function handleVerifyPanel(interaction) {
  const authUrl = oauth.getAuthUrl(interaction.guildId);

  const title = interaction.options.getString('title') || '🤖 Verification required';
  const description = interaction.options.getString('description') || 'click button verify';
  const pingEveryone = interaction.options.getBoolean('everyone') || false;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(7932159); // Màu tím neon chính xác của VaultCord (7932159)

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Click here')
      .setStyle(ButtonStyle.Link)
      .setURL(authUrl)
  );

  const messagePayload = {
    embeds: [embed],
    components: [row],
  };

  if (pingEveryone) {
    messagePayload.content = '@everyone';
  }

  // Gửi panel vào channel
  await interaction.channel.send(messagePayload);
  await interaction.reply({ content: '✅ Đã tạo panel xác minh thành công!', ephemeral: true });
}


// ===== /pull (Smart Adaptive Engine) =====
async function handlePull(interaction, client) {
  await interaction.deferReply();

  const targetGuildId = interaction.options.getString('target') || process.env.TARGET_GUILD_ID;
  const sourceGuildId = interaction.options.getString('source') || null;

  if (!targetGuildId) {
    return interaction.editReply('❌ Chưa cấu hình TARGET_GUILD_ID. Hãy thêm vào file `.env` hoặc truyền qua option `target`.');
  }

  // Kiểm tra bot có trong target guild không
  let targetGuild;
  try {
    targetGuild = await client.guilds.fetch(targetGuildId);
  } catch {
    return interaction.editReply(`❌ Bot không có trong server đích (${targetGuildId}). Hãy mời bot vào server đó trước.`);
  }

  const members = db.getUnpulledMembers(sourceGuildId);

  if (members.length === 0) {
    return interaction.editReply('📭 Không có thành viên nào cần kéo.');
  }

  const initialEmbed = new EmbedBuilder()
    .setTitle('🚀 Đang Khởi Động Kéo Thành Viên...')
    .setDescription(`Mục tiêu: **${members.length}** thành viên ➔ **${targetGuild.name}**\nĐang cấu hình chống dính Rate Limit của Discord...`)
    .setColor(0xf59e0b)
    .setTimestamp();

  await interaction.editReply({ embeds: [initialEmbed] });

  let success = 0;
  let failed = 0;
  let alreadyIn = 0;
  const errors = [];
  let processed = 0;
  let baseDelay = 1200; // Tốc độ cơ bản 1.2s

  for (const member of members) {
    let accessToken = member.access_token;

    // 1. Thử refresh token nếu token đã hết hạn
    if (member.token_expires_at && member.token_expires_at < Math.floor(Date.now() / 1000)) {
      if (member.refresh_token) {
        try {
          const refreshed = await oauth.refreshToken(member.refresh_token);
          accessToken = refreshed.access_token;
          db.saveMember({
            ...member,
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token || member.refresh_token,
            token_expires_at: refreshed.expires_in
              ? Math.floor(Date.now() / 1000) + refreshed.expires_in
              : member.token_expires_at,
          });
        } catch (refreshErr) {
          errors.push(`${member.username}: Hết hạn token, không refresh được`);
          failed++;
          processed++;
          continue;
        }
      } else {
        errors.push(`${member.username}: Token hết hạn và không có refresh token`);
        failed++;
        processed++;
        continue;
      }
    }

    // 2. Kéo member với cơ chế Auto-Retry khi dính Rate Limit (429)
    let retryCount = 0;
    const maxRetries = 3;
    let added = false;

    while (retryCount < maxRetries && !added) {
      try {
        const result = await targetGuild.members.add(member.user_id, {
          accessToken: accessToken,
        });

        if (result) {
          success++;
        } else {
          alreadyIn++;
        }

        added = true;
        db.markAsPulled(member.user_id);

      } catch (err) {
        const errMsg = err.message || '';
        const retryAfter = err.retryAfter || (err.rawError && err.rawError.retry_after);

        // Phát hiện bị Discord chặn nhịp (Rate Limit 429)
        if (err.status === 429 || retryAfter || errMsg.toLowerCase().includes('rate limit')) {
          const waitMs = retryAfter ? (retryAfter * 1000) + 500 : 5000;
          console.log(`[RateLimit] Discord 429: Chờ ${waitMs}ms trước khi thử lại cho ${member.username}...`);
          await sleep(waitMs);
          retryCount++;
          baseDelay = Math.min(baseDelay + 300, 3000); // Tăng giãn cách nhịp nhẹ để tránh dính tiếp
        } else if (errMsg.includes('already a member') || err.code === 204) {
          alreadyIn++;
          added = true;
          db.markAsPulled(member.user_id);
        } else {
          errors.push(`${member.username}: ${errMsg}`);
          failed++;
          break;
        }
      }
    }

    processed++;

    // Cập nhật tiến độ mượt mà kèm % và thời gian ước tính (ETA)
    if (processed % 5 === 0 || processed === members.length) {
      const pct = Math.round((processed / members.length) * 100);
      const remainingCount = members.length - processed;
      const etaSec = Math.ceil((remainingCount * baseDelay) / 1000);
      const etaText = etaSec > 60 ? `~${Math.ceil(etaSec / 60)} phút` : `~${etaSec} giây`;

      const progressEmbed = new EmbedBuilder()
        .setTitle('🚀 Đang Kéo Thành Viên (Smart Engine)...')
        .setDescription(
          `Tiến độ: **${processed}/${members.length}** (${pct}%)\n` +
          `⏱️ Ước tính còn: **${etaText}**\n\n` +
          `✅ Thành công: **${success}** | 📌 Đã có: **${alreadyIn}** | ❌ Lỗi: **${failed}**`
        )
        .setColor(0xf59e0b)
        .setTimestamp();

      await interaction.editReply({ embeds: [progressEmbed] }).catch(() => {});
    }

    // Giãn cách nhịp thông minh
    await sleep(baseDelay);
  }

  // Kết quả cuối cùng
  const resultEmbed = new EmbedBuilder()
    .setTitle('📊 Hoàn Tất Kéo Thành Viên!')
    .setColor(failed === 0 ? 0x10b981 : 0xf59e0b)
    .addFields(
      { name: '✅ Thành công', value: `${success}`, inline: true },
      { name: '📌 Đã có sẵn', value: `${alreadyIn}`, inline: true },
      { name: '❌ Thất bại', value: `${failed}`, inline: true },
    )
    .setFooter({ text: `Server đích: ${targetGuild.name}` })
    .setTimestamp();

  if (errors.length > 0) {
    const errorText = errors.slice(0, 10).join('\n');
    resultEmbed.addFields({
      name: '⚠️ Chi tiết lỗi',
      value: `\`\`\`\n${errorText}${errors.length > 10 ? `\n... và ${errors.length - 10} lỗi khác` : ''}\n\`\`\``,
    });
  }

  await interaction.editReply({ embeds: [resultEmbed] });
}


// ===== /stats =====
async function handleStats(interaction) {
  const stats = db.getStats();
  const byGuild = db.getStatsByGuild();

  const embed = new EmbedBuilder()
    .setTitle('📊 Thống Kê Verify')
    .setColor(0x5865F2)
    .addFields(
      { name: '👥 Tổng đã verify', value: `${stats.total}`, inline: true },
      { name: '⏳ Chờ kéo', value: `${stats.pending}`, inline: true },
      { name: '✅ Đã kéo', value: `${stats.pulled}`, inline: true },
    )
    .setTimestamp();

  if (byGuild.length > 0) {
    const guildList = byGuild
      .map(g => `\`${g.source_guild_id}\`: **${g.count}** thành viên`)
      .join('\n');
    embed.addFields({ name: '🏠 Theo Server Nguồn (chưa kéo)', value: guildList });
  }

  await interaction.reply({ embeds: [embed] });
}

// ===== /reset =====
async function handleReset(interaction) {
  db.resetAll();
  await interaction.reply({
    content: '🔄 Đã reset trạng thái tất cả thành viên. Bạn có thể dùng `/pull` để kéo lại.',
    ephemeral: true,
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { getCommands, handleCommand };
