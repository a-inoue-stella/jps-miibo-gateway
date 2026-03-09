/**
 * Modalへ「画像の場所」を通知し、処理を依頼する
 * （GASのメモリ不足を防ぐため、画像データ自体は送らない）
 */
function callModalToProcessImage(platform, messageOrFileId, userId, roomId = null) {

  let payload = {
    "user": userId,
    "source": platform // 'line' or 'chatwork'
  };

  try {
    // --- A. LINEの場合 ---
    if (platform === 'line') {
      // LINEは ID だけ送れば、Modal側(Python)でダウンロードできる
      payload.id = messageOrFileId;
    }
    // --- B. Chatworkの場合 ---
    else if (platform === 'chatwork') {
      if (!roomId) throw new Error("Chatwork requires roomId.");
      // Chatworkは認証付きURLを発行して、それを送る
      const downloadUrl = getChatworkDownloadUrl(roomId, messageOrFileId);
      payload.url = downloadUrl;
    }
    else {
      throw new Error(`Unknown platform: ${platform}`);
    }

    // セキュリティトークンの追加
    payload.auth_token = CONFIG.INTERNAL_AUTH_TOKEN;

    // Modalへ送信
    // ※ GAS の UrlFetchApp は固定タイムアウト(約60秒)のため timeoutSeconds は指定不可
    const options = {
      'method': 'post',
      'contentType': 'application/json',
      'payload': JSON.stringify(payload),
      'muteHttpExceptions': true
    };

    const response = UrlFetchApp.fetch(CONFIG.MODAL_ENDPOINT_URL, options);
    const code = response.getResponseCode();
    const text = response.getContentText();

    // レスポンスの JSON パース
    let json;
    try {
      json = JSON.parse(text);
    } catch (parseErr) {
      logError('ModalClient', userId, `Modal Response Parse Error (HTTP ${code}): ${text.substring(0, 200)}`);
      return null;
    }

    // HTTP ステータスコードに応じたエラーハンドリング
    if (code === 401) {
      logError('ModalClient', userId, `Modal Auth Error: ${json.error || 'Unauthorized'}`);
      return null;
    }
    if (code === 400) {
      logError('ModalClient', userId, `Modal Bad Request: ${json.error || 'Invalid parameters'}`);
      return null;
    }
    if (code === 413) {
      logError('ModalClient', userId, `Modal Payload Too Large: ${json.error || 'Image too large'}`);
      return null;
    }
    if (code !== 200) {
      logError('ModalClient', userId, `Modal API Error (${code}): ${json.error || text.substring(0, 200)}`);
      return null;
    }

    // 成功レスポンスの確認
    if (json.status === 'success') {
      return json.base64_image;
    } else {
      logError('ModalClient', userId, `Modal Logic Error: ${json.error || 'Unknown error'}`);
      return null;
    }

  } catch (e) {
    logError('ModalClient', userId, e);
    return null;
  }
}

/**
 * ChatworkのダウンロードURLを取得する（画像本体はDLしない）
 * @param {string|number} roomId - チャットルームID
 * @param {string|number} fileId - ファイルID
 * @returns {string} ダウンロードURL
 */
function getChatworkDownloadUrl(roomId, fileId) {
  const url = `https://api.chatwork.com/v2/rooms/${roomId}/files/${fileId}?create_download_url=1`;
  const response = UrlFetchApp.fetch(url, {
    'headers': { 'X-ChatWorkToken': CONFIG.CHATWORK_API_TOKEN },
    'method': 'get',
    'muteHttpExceptions': true
  });

  const code = response.getResponseCode();
  if (code !== 200) {
    throw new Error(`Chatwork File API Error (${code}): ${response.getContentText().substring(0, 200)}`);
  }

  const json = JSON.parse(response.getContentText());
  if (!json.download_url) throw new Error("Failed to get Chatwork download URL: download_url is empty.");

  return json.download_url;
}