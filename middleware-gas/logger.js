// ==================================================
// 📘 現場レスキューAI : Logging System (Secure)
// ==================================================

/**
 * 会話ログをスプレッドシートに記録する（PIIマスク適用済み）
 * @param {string} platform - 'LINE' or 'Chatwork'
 * @param {string} userId - ユーザーID
 * @param {string} userName - ユーザー表示名
 * @param {string} sessionId - miiboのセッションID
 * @param {string} userQuery - ユーザーの質問
 * @param {string} aiAnswer - AIの回答
 * @param {string} fileId - (Optional) 画像ファイルID
 */
function logConversation(platform, userId, userName, sessionId, userQuery, aiAnswer, fileId = '') {
  // プラットフォームに応じてシートを切り替え
  const sheetName = (platform === 'LINE') ? CONFIG.LOG_SHEET_LINE : CONFIG.LOG_SHEET_CHATWORK;
  const now = new Date();

  // ★修正: 個人情報(PII)をマスキング処理
  // ユーザーの質問だけでなく、AIがオウム返しした場合に備えて回答もマスクする
  const safeQuery = maskPII(userQuery);
  const safeAnswer = maskPII(aiAnswer);

  // 書き込みデータ
  // [Timestamp, Platform, UserID, UserName, SessionID, UserQuery, AIAnswer, ImageAttached]
  const rowData = [
    now,
    platform,
    userId,
    userName,
    sessionId,
    safeQuery,   // マスク済みデータ
    safeAnswer,  // マスク済みデータ
    fileId
  ];

  appendRowWithLock(sheetName, rowData);
}

/**
 * システムエラーをログに記録し、管理者にメール通知する
 * @param {string} module - エラー発生箇所
 * @param {string} userId - ユーザーID
 * @param {Error|string} error - エラーオブジェクト
 */
function logError(module, userId, error) {
  const sheetName = CONFIG.LOG_SHEET_ERROR;
  const now = new Date();

  const errorMessage = (error instanceof Error) ? error.message : error;
  const stackTrace = (error instanceof Error) ? error.stack : '';

  // 1. スプレッドシートに記録
  const rowData = [
    now,
    module,
    userId,
    errorMessage,
    stackTrace
  ];
  console.error(`[${module}] Error: ${errorMessage}`);
  appendRowWithLock(sheetName, rowData);

  // 2. 管理者へ緊急メール通知
  const ADMIN_EMAIL = PROPS.getProperty('ADMIN_EMAIL');
  if (!ADMIN_EMAIL) {
    console.warn("ADMIN_EMAIL が未設定のため、メール通知をスキップしました。");
    return;
  }

  try {
    const subject = `【緊急】現場レスキューAI エラー通知 (${module})`;
    const body = `
システムでエラーが発生しました。確認してください。

■ 発生時刻: ${now.toLocaleString()}
■ 発生箇所: ${module}
■ ユーザー: ${userId}
■ エラー内容:
${errorMessage}

■ スタックトレース:
${stackTrace}
    `;

    // メール送信（割り当て制限に注意：1日100通まで）
    // エラーが頻発した場合のスパム防止のため、開発中はコメントアウトしても良い
    MailApp.sendEmail({
      to: ADMIN_EMAIL,
      subject: subject,
      body: body
    });
  } catch (e) {
    console.warn("Mail Notification Failed:", e);
  }
}

/**
 * 排他制御付きで行を追加する（書き込み競合防止）
 */
function appendRowWithLock(sheetName, rowData) {
  const lock = LockService.getScriptLock();
  let lockAcquired = false;

  try {
    // 最大10秒間ロック取得を試行
    lockAcquired = lock.tryLock(10000);
    if (lockAcquired) {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let sheet = ss.getSheetByName(sheetName);

      // シートがない場合の安全策（setup.jsで作成済みのはずだが念のため）
      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
      }

      sheet.appendRow(rowData);
      SpreadsheetApp.flush(); // 即時反映
    } else {
      console.error(`Could not obtain lock for sheet: ${sheetName}`);
    }
  } catch (e) {
    console.error(`Failed to write to sheet: ${e.toString()}`);
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}

/**
 * 個人情報（PII）を検知してマスキングする
 * - 電話番号 (日本の主要フォーマット)
 * - メールアドレス
 */
function maskPII(text) {
  if (!text) return "";
  if (typeof text !== 'string') return text;

  let masked = text;

  // 1. メールアドレスのマスキング
  // 例: test@example.com -> [EMAIL_MASKED]
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  masked = masked.replace(emailRegex, '[EMAIL_MASKED]');

  // 2. 電話番号のマスキング (日本国内向け強化版)
  // 固定電話(03-xxxx, 06-xxxx)、携帯(090-xxxx)、フリーダイヤル(0120-xxxx)など
  // ハイフンあり・なし両方に対応させつつ、単なる桁数の多い数字(IDなど)はなるべく避ける調整
  const phoneRegex = /(?:\b0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}\b)/g;
  masked = masked.replace(phoneRegex, '[PHONE_MASKED]');

  return masked;
}