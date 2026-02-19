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
    const options = {
      'method': 'post',
      'contentType': 'application/json',
      'payload': JSON.stringify(payload),
      'muteHttpExceptions': true,
      'timeoutSeconds': 120
    };

    const response = UrlFetchApp.fetch(CONFIG.MODAL_ENDPOINT_URL, options);
    const code = response.getResponseCode();
    const text = response.getContentText();

    if (code !== 200) {
      logError('ModalClient', userId, `Modal API Error (${code}): ${text}`);
      return null;
    }

    const json = JSON.parse(text);
    if (json.status === 'success') {
      return json.base64_image;
    } else {
      logError('ModalClient', userId, `Modal Logic Error: ${json.error}`);
      return null;
    }

  } catch (e) {
    logError('ModalClient', userId, e);
    return null;
  }
}

/**
 * ChatworkのダウンロードURLを取得する（画像本体はDLしない）
 */
function getChatworkDownloadUrl(roomId, fileId) {
  const url = `https://api.chatwork.com/v2/rooms/${roomId}/files/${fileId}?create_download_url=1`;
  const response = UrlFetchApp.fetch(url, {
    'headers': { 'X-ChatWorkToken': CONFIG.CHATWORK_API_TOKEN },
    'method': 'get'
  });

  const json = JSON.parse(response.getContentText());
  if (!json.download_url) throw new Error("Failed to get Chatwork download URL.");

  return json.download_url;
}

// ※ getLineMessageContent は不要になったので削除してOKです