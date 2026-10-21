const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI } = process.env;

/**
 * Đổi authorization code lấy access token
 */
async function exchangeCode(code) {
  const response = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return data;
}

/**
 * Refresh access token khi hết hạn
 */
async function refreshToken(refreshToken) {
  const response = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return data;
}

/**
 * Lấy thông tin user từ access token
 */
async function getUser(accessToken) {
  const response = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await response.json();
  if (data.message) throw new Error(data.message);
  return data;
}

/**
 * Tạo OAuth2 authorize URL
 */
function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'identify guilds.join',
    prompt: 'consent',
  });
  if (state) params.set('state', state);
  return `https://discord.com/api/v10/oauth2/authorize?${params}`;
}

module.exports = { exchangeCode, refreshToken, getUser, getAuthUrl };
