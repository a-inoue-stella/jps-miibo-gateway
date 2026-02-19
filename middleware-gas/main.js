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

    // リセット機能（強制終了）
    if (messageType === 'text') {
      const rawText = event.message.text.trim();
      if (rawText === 'リセット' || rawText === 'クリア' || rawText === '終了') {
        // AIに渡す前に、ここでリセット処理を実行して終了する
        const resetMsg = callDifyChat(userId, rawText);
        replyToLine(replyToken, resetMsg);
        continue; // 次のイベントへ（AIの処理には進ませない）
      }
    }
    // ★ローディングアニメーションを表示
    showLineLoadingAnimation(userId);

    try {
      const cache = CacheService.getScriptCache();

      // --- A. 画像が送られてきた場合 ---
      if (messageType === 'image') {
        // Modalへ処理委譲 (modal_client.js) -> Base64画像を取得
        const base64Image = callModalToProcessImage('line', messageId, userId);

        if (base64Image) {
          // 画像をキャッシュに保存（有効期限10分）
          cache.put('PENDING_IMAGE_' + userId, base64Image, 600);
          replyToLine(replyToken, "画像を読み込みました。\n続けて、どのようなトラブルか状況を教えてください。");
        } else {
          replyToLine(replyToken, "⚠️ 画像の読み込みに失敗しました。もう一度試すか、テキストで詳しく説明してください。");
        }
      }

      // --- B. テキストが送られてきた場合 ---
      else if (messageType === 'text') {
        const userQuery = event.message.text;

        // 直前の画像があるか確認
        const pendingImage = cache.get('PENDING_IMAGE_' + userId);
        if (pendingImage) {
          cache.remove('PENDING_IMAGE_' + userId);
        }

        // miiboへ問い合わせ
        const answer = callMiiboChat(userId, userQuery, pendingImage);

        // ★修正: ここでMarkdown整形関数を通す
        const formattedAnswer = cleanMarkdownForLine(answer);

        // 整形済みの回答を返信
        replyToLine(replyToken, formattedAnswer);

        // ログ保存
        logConversation('LINE', userId, 'miibo-session', userQuery, answer, pendingImage ? 'image_attached' : '');
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
 * LINE向けにMarkdownを整形する（表組みのリスト化・太字除去）
 */
function cleanMarkdownForLine(text) {
  if (!text) return "";
  let formatted = text;

  // 1. 太字 **text** -> 【text】 (強調)
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '【$1】');

  // 2. 見出し ### Title -> ■ Title
  formatted = formatted.replace(/^#{1,6}\s+(.*)$/gm, '\n■ $1');

  // 3. 表組みの除去とリスト化
  // (A) |---|---| のような区切り行を削除
  formatted = formatted.replace(/^\|[\s-]+\|[\s-]+\|.*$/gm, '');
  // (B) | Header | Value | -> ・Header : Value
  // 簡易的に2カラム〜3カラムの表をリスト形式に変換
  formatted = formatted.replace(/^\|\s*(.*?)\s*\|\s*(.*?)\s*\|(?:\s*(.*?)\s*\|)?$/gm, function (match, c1, c2, c3) {
    if (c3) return `・${c1} : ${c2} (${c3})`; // 3カラムの場合
    return `・${c1} : ${c2}`; // 2カラムの場合
  });

  // 4. 不要な改行の整理（3連続以上の改行を2つに）
  formatted = formatted.replace(/\n{3,}/g, '\n\n');

  return formatted.trim();
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

  // 画像IDがあるか確認
  const fileIdMatch = rawBody.match(/\[download:(\d+)\]/);
  const chatworkFileId = fileIdMatch ? fileIdMatch[1] : null;

  try {
    // 5. リセット判定
    const cmd = cleanBody.toLowerCase();
    if (cmd === 'リセット' || cmd === 'clear' || cmd === 'reset') {
      const resetMsg = callDifyChat(userId, 'リセット');
      safeSendMessageToChatwork(roomId, `${replyTag}${resetMsg}`);
      return;
    }

    // 6. 画像の処理
    let base64Image = null;
    if (chatworkFileId) {
      base64Image = callModalToProcessImage('chatwork', chatworkFileId, userId, roomId);
      if (base64Image) {
        safeSendMessageToChatwork(roomId, `${replyTag}[info]画像を読み込みました。解析を開始します...[/info]`);
      }
    }

    // 7. miiboへ問い合わせ
    const answer = callMiiboChat(userId, cleanBody, base64Image);

    // 8. 結果を返信 (Markdown簡易変換あり)
    if (answer) {
      const formattedAnswer = formatForChatwork(answer);
      safeSendMessageToChatwork(roomId, `${replyTag}${formattedAnswer}`);

      // ★追加: 会話ログを記録
      if (typeof logConversation === 'function') {
        logConversation('Chatwork', userId, 'miibo-session', cleanBody, answer, base64Image ? 'image_attached' : '');
      }
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
      })
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

  // ★修正: 正しいURL形式に変更
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    'headers': {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.LINE_ACCESS_TOKEN}`
    },
    'method': 'post',
    'payload': JSON.stringify({
      replyToken: replyToken,
      messages: [{ type: 'text', text: text }]
    })
  });
}

/**
 * Chatworkのメッセージ詳細を取得（ファイル確認用）
 */
function getChatworkMessageDetail(roomId, messageId) {
  const url = `https://api.chatwork.com/v2/rooms/${roomId}/messages/${messageId}`;
  const res = UrlFetchApp.fetch(url, {
    'headers': { 'X-ChatWorkToken': CONFIG.CHATWORK_API_TOKEN },
    'method': 'get'
  });
  return JSON.parse(res.getContentText());
}

/**
 * Chatworkへメッセージ送信
 */
function sendMessageToChatwork(roomId, text) {
  UrlFetchApp.fetch(`https://api.chatwork.com/v2/rooms/${roomId}/messages`, {
    'headers': { 'X-ChatWorkToken': CONFIG.CHATWORK_API_TOKEN },
    'method': 'post',
    'payload': { 'body': text }
  });
}

/**
 * MarkdownをChatwork記法に簡易変換
 */
function formatForChatwork(text) {
  if (!text) return "";
  let formatted = text;

  // 1. 太字 **text** -> [info]text[/info] (強調として利用)
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '[info]$1[/info]');

  // 2. 見出し ### Title -> [title]Title[/title]
  formatted = formatted.replace(/^###\s+(.*)$/gm, '[title]$1[/title]');
  formatted = formatted.replace(/^##\s+(.*)$/gm, '[title]$1[/title]');

  // 3. コードブロック ```code``` -> [code]code[/code]
  formatted = formatted.replace(/```([\s\S]*?)```/g, '[code]$1[/code]');

  return formatted;
}