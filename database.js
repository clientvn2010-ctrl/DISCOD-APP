const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'members.db');

let db = null;

/** Khởi tạo database (phải gọi trước khi dùng) */
async function init() {
  const SQL = await initSqlJs();

  // Load existing DB file nếu có
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Tạo bảng
  db.run(`
    CREATE TABLE IF NOT EXISTS verified_members (
      user_id TEXT PRIMARY KEY,
      username TEXT,
      discriminator TEXT,
      avatar TEXT,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      token_expires_at INTEGER,
      source_guild_id TEXT,
      verified_at INTEGER DEFAULT (strftime('%s','now')),
      pulled INTEGER DEFAULT 0,
      pulled_at INTEGER
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_source_guild ON verified_members(source_guild_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_pulled ON verified_members(pulled)`);

  save();
  console.log('[✓] Database khởi tạo thành công');
}

/** Lưu DB ra file */
function save() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

/** Helper: chạy SELECT và trả về array of objects */
function queryAll(sql, params = {}) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/** Helper: chạy SELECT và trả về 1 object */
function queryOne(sql, params = {}) {
  const rows = queryAll(sql, params);
  return rows[0] || null;
}

// ===== Exported Functions =====

function saveMember(data) {
  db.run(`
    INSERT OR REPLACE INTO verified_members
      (user_id, username, discriminator, avatar, access_token, refresh_token, token_expires_at, source_guild_id, verified_at, pulled, pulled_at)
    VALUES
      ($user_id, $username, $discriminator, $avatar, $access_token, $refresh_token, $token_expires_at, $source_guild_id, strftime('%s','now'), 0, NULL)
  `, {
    $user_id: data.user_id,
    $username: data.username,
    $discriminator: data.discriminator,
    $avatar: data.avatar,
    $access_token: data.access_token,
    $refresh_token: data.refresh_token,
    $token_expires_at: data.token_expires_at,
    $source_guild_id: data.source_guild_id,
  });
  save();
}

function getUnpulledMembers(guildId) {
  if (guildId) {
    return queryAll(
      `SELECT * FROM verified_members WHERE pulled = 0 AND source_guild_id = $guild_id`,
      { $guild_id: guildId }
    );
  }
  return queryAll(`SELECT * FROM verified_members WHERE pulled = 0`);
}

function markAsPulled(userId) {
  db.run(
    `UPDATE verified_members SET pulled = 1, pulled_at = strftime('%s','now') WHERE user_id = $user_id`,
    { $user_id: userId }
  );
  save();
}

function getStats() {
  return queryOne(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN pulled = 0 THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN pulled = 1 THEN 1 ELSE 0 END) as pulled
    FROM verified_members
  `);
}

function getStatsByGuild() {
  return queryAll(`
    SELECT source_guild_id, COUNT(*) as count
    FROM verified_members
    WHERE pulled = 0
    GROUP BY source_guild_id
  `);
}

function getAllMembers() {
  return queryAll(`SELECT * FROM verified_members ORDER BY verified_at DESC`);
}

function getMember(userId) {
  return queryOne(
    `SELECT * FROM verified_members WHERE user_id = $user_id`,
    { $user_id: userId }
  );
}

function resetAll() {
  db.run(`UPDATE verified_members SET pulled = 0, pulled_at = NULL`);
  save();
}

function close() {
  if (db) {
    save();
    db.close();
  }
}

module.exports = {
  init,
  saveMember,
  getUnpulledMembers,
  markAsPulled,
  getStats,
  getStatsByGuild,
  getAllMembers,
  getMember,
  resetAll,
  close,
};
