// ==================================================
// 📘 現場レスキューAI : Main Controller
// ==================================================

// Loggerが参照する設定も含めて定義
// 注意: config.js で既に定義されているため、ここでは再定義しない
// const PROPS = PropertiesService.getScriptProperties();
// const CONFIG = ...; 

/**
 * エントリーポイント: Webhook受信
 */
function doPost(e) {
  if (!e || !e.postData) return ContentService.createTextOutput("Invalid Request");

  try {
    const json = JSON.parse(e.postData.contents);

    // LINEからのリクエスト
    if (json.events) {
      handleLineEvents(json);
    }
    // Chatworkからのリクエスト
    else if (json.webhook_event) {
      handleChatworkEvent(json);
    }

  } catch (err) {
    console.error("JSON Error:", err);
    // エラーログ記録 (logger.js)
    if (typeof logError === 'function') {
      logError('Main', 'Webhook', err);
    }
  }
  return ContentService.createTextOutput("OK");
}

// ==================================================
// 1. LINE Handler
// ==================================================
function handleLineEvents(json) {
  const events = json.events;
  for (const event of events) {
    if (event.type !== 'message') continue;

    const replyToken = event.replyToken;
    const userId = event.source.userId;
    const messageType = event.message.type;
    const messageId = event.message.id;

    // ★ローディングアニメーションを表示
    showLineLoadingAnimation(userId);

    try {
      const cache = CacheService.getScriptCache();

      // --- A. 画像が送られてきた場合 ---
      if (messageType === 'image') {
        // 画像IDをキャッシュに保存（有効期限10分）
        // ※Base64データは大きすぎてキャッシュ(100KB制限)に入らないため、IDのみを保持する
        cache.put('PENDING_LINE_IMAGE_ID_' + userId, messageId, 600);
        replyToLine(replyToken, "画像を読み込みました。\n続けて、どのようなトラブルか状況を教えてください。");
      }

      // --- B. テキストが送られてきた場合 ---
      else if (messageType === 'text') {
        const userQuery = event.message.text;

        // --- リセットコマンド判定 ---
        if (isResetCommand(userQuery)) {
          resetMiiboConversation(userId);
          replyToLine(replyToken, '🔄 【システム】会話の履歴と設定を初期化しました。最初からご相談内容を入力してください。');
          const userName = getLineDisplayName(userId);
          logConversation('LINE', userId, userName, 'system-reset', '[システムコマンド: リセット]', '[履歴・ステート初期化完了]', '');
          return;
        }

        // 直前の画像があるか確認
        const pendingImageId = cache.get('PENDING_LINE_IMAGE_ID_' + userId);
        let base64Image = null;

        if (pendingImageId) {
          // テキストが来たタイミングで初めてModalを呼び出し、Base64を取得する
          base64Image = callModalToProcessImage('line', pendingImageId, userId);
          cache.remove('PENDING_LINE_IMAGE_ID_' + userId);

          if (!base64Image) {
            console.warn("Failed to fetch pending image from Modal.");
          }
        }

        // miiboへ問い合わせ
        const answer = callMiiboApi(userId, userQuery, base64Image);

        // ★修正: ここでMarkdown整形関数を通す
        const formattedAnswer = cleanMarkdownForLine(answer);

        // 整形済みの回答を返信
        replyToLine(replyToken, formattedAnswer);

        // ユーザー表示名を取得
        const userName = getLineDisplayName(userId);

        // ログ保存
        logConversation('LINE', userId, userName, 'miibo-session', userQuery, answer, base64Image ? 'image_attached' : '');
      }

      // --- C. その他（スタンプなど） ---
      else {
        replyToLine(replyToken, "すみません、テキストか写真以外は対応していません。");
      }

    } catch (e) {
      logError('Main', userId, e);
      replyToLine(replyToken, "⚠️ システムエラーが発生しました。\n時間を置いて再度お試しください。");
    }
  }
}

/**
 * LINE向けにMarkdown記号を除去してプレーンテキスト化する
 */
function cleanMarkdownForLine(text) {
  return stripMarkdown(text);
}

/**
 * Markdown記号を除去してプレーンテキスト化する共通関数
 */
function stripMarkdown(text) {
  if (!text) return "";
  let s = text;

  // コードブロック ```lang\n...``` → 内容のみ
  s = s.replace(/```[^\n]*\n([\s\S]*?)```/g, '$1');

  // インラインコード `code` → code
  s = s.replace(/`([^`]+)`/g, '$1');

  // 太字・斜体 **text**, *text*, __text__, _text_ → text
  s = s.replace(/\*\*(.*?)\*\*/g, '$1');
  s = s.replace(/(?<![\w*])\*([^*]+)\*(?![\w*])/g, '$1');
  s = s.replace(/__(.*?)__/g, '$1');
  s = s.replace(/(?<![\w_])_([^_]+)_(?![\w_])/g, '$1');

  // 見出し ### Title → Title
  s = s.replace(/^#{1,6}\s+(.*)$/gm, '$1');

  // 表組み: 区切り行 |---|---| を削除
  s = s.replace(/^\|[\s-:]+\|[\s-:]+\|.*$/gm, '');
  // 表組み: | A | B | → A : B
  s = s.replace(/^\|[^\S\n]*(.*?)[^\S\n]*\|[^\S\n]*(.*?)[^\S\n]*\|(?:[^\S\n]*(.*?)[^\S\n]*\|)?$/gm, function (_, c1, c2, c3) {
    if (c3) return `${c1} : ${c2} (${c3})`;
    return `${c1} : ${c2}`;
  });

  // リンク [text](url) → text
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // 水平線 --- / *** / ___ → (空行)
  s = s.replace(/^[\s]*([-*_]){3,}[\s]*$/gm, '');

  // 不要な改行の整理（3連続以上 → 2つ）
  s = s.replace(/\n{3,}/g, '\n\n');

  return s.trim();
}

// ==================================================
// 2. Chatwork Handler (ログ保存・自動ID取得・エラー対策版)
// ==================================================
function handleChatworkEvent(json) {
  const event = json.webhook_event;
  const accountId = event.account_id || event.from_account_id;
  if (!accountId) return; // 送信者不明は無視

  const roomId = event.room_id;
  const messageId = event.message_id;
  const rawBody = event.body;
  if (!rawBody) return; // bodyが空の場合は処理しない

  // Bot自身のIDを取得（プロパティになければAPIで自動取得して保存）
  // これにより設定の手間と事故を減らす
  let botId = Number(CONFIG.BOT_ACCOUNT_ID);
  if (!botId) {
    botId = getMyChatworkId();
    if (botId) {
      PropertiesService.getScriptProperties().setProperty('BOT_ACCOUNT_ID', String(botId));
      CONFIG.BOT_ACCOUNT_ID = botId; // メモリ上も更新
    }
  }

  // 1. 自分自身の発言は無視 (無限ループ防止)
  if (botId && accountId === botId) return;

  // 2. 自分宛のメンションまたはリプライがあるか確認
  // botIdが取得できていない場合は、安全のため反応しない（誤爆防止）
  if (botId && !rawBody.includes(`[To:${botId}]`) && !rawBody.includes(`[rp aid=${botId}`)) {
    return;
  }

  // 3. ユーザーIDの定義
  const userId = 'cw_' + accountId;

  // 4. ノイズ除去
  let cleanBody = rawBody
    .replace(/\[(rp|To).*?\].*?(\n|$)/g, '')
    .replace(/\[info\][\s\S]*?\[\/info\]/g, '')
    .trim();

  // リプライ用タグ
  const replyTag = `[rp aid=${accountId} to=${roomId}-${messageId}]`;

  try {
    // ユーザー表示名を先に取得（返信メッセージ・ログ両方で使用）
    const userName = getChatworkDisplayName(accountId, roomId);

    // --- リセットコマンド判定 ---
    if (isResetCommand(cleanBody)) {
      resetMiiboConversation(String(accountId));
      safeSendMessageToChatwork(roomId, `${replyTag}${userName}さん\n🔄 【システム】会話の履歴と設定を初期化しました。最初からご相談内容を入力してください。`);
      logConversation('Chatwork', userId, userName, 'system-reset', '[システムコマンド: リセット]', '[履歴・ステート初期化完了]', '');
      return;
    }

    // 画像IDがあるか確認
    const fileIdMatch = rawBody.match(/\[download:(\d+)\]/);
    const chatworkFileId = fileIdMatch ? fileIdMatch[1] : null;
    // 6. 画像の処理
    let base64Image = null;
    if (chatworkFileId) {
      base64Image = callModalToProcessImage('chatwork', chatworkFileId, userId, roomId);
      if (base64Image) {
        safeSendMessageToChatwork(roomId, `${replyTag}[info]画像を読み込みました。解析を開始します...[/info]`);
      }
    }

    // 7. miiboへ問い合わせ
    const answer = callMiiboApi(String(accountId), cleanBody, base64Image);

    // 8. 結果を返信
    if (answer) {
      const formattedAnswer = formatForChatwork(answer);
      safeSendMessageToChatwork(roomId, `${replyTag}${userName}さん\n${formattedAnswer}`);

      // 会話ログを記録
      logConversation('Chatwork', userId, userName, 'miibo-session', cleanBody, answer, base64Image ? 'image_attached' : '');
    }

  } catch (e) {
    console.error('Error in handleChatworkEvent:', e);
    // エラーログ記録
    if (typeof logError === 'function') logError('ChatworkHandler', userId, e);

    // ユーザーへのエラー通知
    safeSendMessageToChatwork(roomId, `${replyTag}⚠️ システムエラーが発生しました: ${e.message}`);
  }
}

/**
 * Chatwork APIで自分のアカウント情報を取得する
 */
function getMyChatworkId() {
  try {
    const res = UrlFetchApp.fetch('https://api.chatwork.com/v2/me', {
      'headers': { 'X-ChatWorkToken': CONFIG.CHATWORK_API_TOKEN },
      'method': 'get'
    });
    const json = JSON.parse(res.getContentText());
    console.log(`Bot ID detected: ${json.account_id}`);
    return json.account_id;
  } catch (e) {
    console.error("Failed to get bot account ID:", e);
    return 0;
  }
}

/**
 * 安全にChatworkへメッセージを送る（権限エラーなどで落ちないようにする）
 */
function safeSendMessageToChatwork(roomId, text) {
  try {
    sendMessageToChatwork(roomId, text);
  } catch (e) {
    console.error(`Send Message Error (Room: ${roomId}):`, e);
    // ここでエラーを握りつぶすことで、ログ保存などの後続処理を守る
  }
}

// ==================================================
// 3. Helper Functions
// ==================================================

/**
 * LINEユーザーの表示名を取得する
 * @param {string} userId - LINE ユーザーID
 * @returns {string} 表示名（取得失敗時は '不明'）
 */
function getLineDisplayName(userId) {
  try {
    const res = UrlFetchApp.fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
      'headers': {
        'Authorization': `Bearer ${CONFIG.LINE_ACCESS_TOKEN}`
      },
      'method': 'get',
      'muteHttpExceptions': true
    });
    if (res.getResponseCode() !== 200) {
      console.warn(`LINE Profile API returned ${res.getResponseCode()}`);
      return '不明';
    }
    const json = JSON.parse(res.getContentText());
    return json.displayName || '不明';
  } catch (e) {
    console.warn('Failed to get LINE display name:', e);
    return '不明';
  }
}

/**
 * Chatworkユーザーの表示名を取得する
 * @param {number|string} accountId - Chatwork アカウントID
 * @param {number|string} roomId - Chatwork ルームID
 * @returns {string} 表示名（取得失敗時は '不明'）
 */
function getChatworkDisplayName(accountId, roomId) {
  try {
    const res = UrlFetchApp.fetch(`https://api.chatwork.com/v2/rooms/${roomId}/members`, {
      'headers': { 'X-ChatWorkToken': CONFIG.CHATWORK_API_TOKEN },
      'method': 'get',
      'muteHttpExceptions': true
    });
    const members = JSON.parse(res.getContentText());
    const user = members.find(m => m.account_id === Number(accountId));
    return user ? user.name : '不明';
  } catch (e) {
    console.warn('Failed to get Chatwork display name:', e);
    return '不明';
  }
}

/**
 * LINEにローディングアニメーションを表示する（修正版）
 * ユーザーIDを指定して、5〜20秒程度のアニメーションを表示
 */
function showLineLoadingAnimation(userId) {
  try {
    // ★修正: 正しいURL形式に変更
    UrlFetchApp.fetch('https://api.line.me/v2/bot/chat/loading/start', {
      'headers': {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.LINE_ACCESS_TOKEN}`
      },
      'method': 'post',
      'payload': JSON.stringify({
        chatId: userId,
        loadingSeconds: 20 // 実際には返信時点で消えるので長めに設定
      }),
      'muteHttpExceptions': true
    });
  } catch (e) {
    // ローディング表示のエラーはメイン処理を止めないよう、ログだけ残して握りつぶす
    console.warn("Loading Animation Failed:", e);
  }
}

/**
 * LINEに返信する（修正版）
 */
function replyToLine(replyToken, text) {
  if (!text) text = " "; // 空文字エラー防止

  // ★修正: muteHttpExceptionsを有効化し、トークン無効によるエラーでスクリプトが停止しないようにする
  try {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
      'headers': {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.LINE_ACCESS_TOKEN}`
      },
      'method': 'post',
      'payload': JSON.stringify({
        replyToken: replyToken,
        messages: [{ type: 'text', text: text }]
      }),
      'muteHttpExceptions': true
    });
  } catch (e) {
    console.warn("Reply to LINE failed:", e);
  }
}

/**
 * Chatworkのメッセージ詳細を取得（ファイル確認用）
 */
function getChatworkMessageDetail(roomId, messageId) {
  try {
    const url = `https://api.chatwork.com/v2/rooms/${roomId}/messages/${messageId}`;
    const res = UrlFetchApp.fetch(url, {
      'headers': { 'X-ChatWorkToken': CONFIG.CHATWORK_API_TOKEN },
      'method': 'get',
      'muteHttpExceptions': true
    });
    if (res.getResponseCode() !== 200) {
      console.error(`Chatwork Message API Error: ${res.getResponseCode()}`);
      return null;
    }
    return JSON.parse(res.getContentText());
  } catch (e) {
    console.error('Failed to get Chatwork message detail:', e);
    return null;
  }
}

/**
 * Chatworkへメッセージ送信
 */
function sendMessageToChatwork(roomId, text) {
  UrlFetchApp.fetch(`https://api.chatwork.com/v2/rooms/${roomId}/messages`, {
    'headers': { 'X-ChatWorkToken': CONFIG.CHATWORK_API_TOKEN },
    'method': 'post',
    'payload': { 'body': text },
    'muteHttpExceptions': true
  });
}

/**
 * Chatwork向けにMarkdown記号を除去してプレーンテキスト化する
 */
function formatForChatwork(text) {
  return stripMarkdown(text);
}

/**
 * ユーザーの入力が「会話リセット」の意図かどうかを判定する
 * - 「リセット」or「りせっと」を含むこと
 * - 機器名（HGW, ルーター, ONU, Meraki 等）を含まないこと
 * - 疑問形（？, ますか）や過去形（した, された, しました）でないこと
 * @param {string} text - ユーザーの入力テキスト
 * @returns {boolean}
 */
function isResetCommand(text) {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  // 「リセット」or「りせっと」を含むか
  if (!/リセット|りせっと/.test(trimmed)) return false;

  // 除外: 機器名を含む場合は機器操作の文脈と判断
  const devicePattern = /HGW|hgw|ルーター|ルータ|ONU|onu|Meraki|meraki|メラキ|モデム|AP|アクセスポイント|スイッチ|ハブ|Wi-?Fi|WiFi|NW機器|ファイアウォール|FW|YAMAHA|ヤマハ|D-?Link/i;
  if (devicePattern.test(trimmed)) return false;

  // 除外: 疑問形・過去形（機器リセットの相談や状況報告）
  const questionOrPastPattern = /リセットし(た|ました|てみた|ても|たら|たけど|たが|たのに)|リセットされ(た|ました|ている|てる)|リセットできな|リセットする(べき|方法|手順)|[？?]$/;
  if (questionOrPastPattern.test(trimmed)) return false;

  return true;
}