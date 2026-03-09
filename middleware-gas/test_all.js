// ==================================================
// 🧪 現場レスキューAI : 包括テストスイート
// ==================================================
// 使い方:
//   1. GASエディタでこのファイルを開く
//   2. 「runAllTests」を選択して実行
//   3. 実行ログで結果を確認
//
// テスト分類:
//   - Unit Tests    : 外部API不要。ロジックのみ検証（高速）
//   - Integration   : 実際のAPIを呼び出して疎通確認（低速）
// ==================================================

// --- テストユーティリティ ---

/** テスト結果を蓄積するオブジェクト */
const TEST_RESULTS = { passed: 0, failed: 0, errors: [] };

/**
 * 単一テストのアサーション
 * @param {string} name - テスト名
 * @param {*} actual - 実際の値
 * @param {*} expected - 期待値
 */
function assertEqual(name, actual, expected) {
  if (actual === expected) {
    TEST_RESULTS.passed++;
    console.log(`  ✅ ${name}`);
  } else {
    TEST_RESULTS.failed++;
    const msg = `  ❌ ${name}  — expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)}`;
    console.error(msg);
    TEST_RESULTS.errors.push(msg);
  }
}

/**
 * 真偽値のアサーション
 */
function assertTrue(name, value) {
  assertEqual(name, !!value, true);
}

function assertFalse(name, value) {
  assertEqual(name, !!value, false);
}

/**
 * 文字列に部分一致するか
 */
function assertContains(name, text, substring) {
  if (typeof text === 'string' && text.includes(substring)) {
    TEST_RESULTS.passed++;
    console.log(`  ✅ ${name}`);
  } else {
    TEST_RESULTS.failed++;
    const msg = `  ❌ ${name}  — "${substring}" not found in "${text}"`;
    console.error(msg);
    TEST_RESULTS.errors.push(msg);
  }
}

/**
 * 例外が発生しないことを確認
 */
function assertNoThrow(name, fn) {
  try {
    fn();
    TEST_RESULTS.passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    TEST_RESULTS.failed++;
    const msg = `  ❌ ${name}  — unexpected error: ${e.message}`;
    console.error(msg);
    TEST_RESULTS.errors.push(msg);
  }
}

/**
 * 例外が発生することを確認
 */
function assertThrows(name, fn) {
  try {
    fn();
    TEST_RESULTS.failed++;
    const msg = `  ❌ ${name}  — expected an error but none was thrown`;
    console.error(msg);
    TEST_RESULTS.errors.push(msg);
  } catch (e) {
    TEST_RESULTS.passed++;
    console.log(`  ✅ ${name}  (threw: ${e.message})`);
  }
}

/**
 * assertNull — 値が null であることを確認
 */
function assertNull(name, value) {
  if (value === null) {
    TEST_RESULTS.passed++;
    console.log(`  ✅ ${name}`);
  } else {
    TEST_RESULTS.failed++;
    const msg = `  ❌ ${name}  — expected null, got: ${JSON.stringify(value)}`;
    console.error(msg);
    TEST_RESULTS.errors.push(msg);
  }
}

// --- UrlFetchApp モック ---

/**
 * UrlFetchApp.fetch をモック化するヘルパー
 * @param {number} code - レスポンスコード
 * @param {string|object} body - レスポンスボディ（オブジェクトの場合は JSON.stringify される）
 * @param {function} [interceptor] - 呼び出し時に (url, options) を受け取るコールバック
 * @returns {function} モック解除関数
 */
function mockUrlFetchApp(code, body, interceptor) {
  const original = UrlFetchApp.fetch;
  const bodyStr = typeof body === 'object' ? JSON.stringify(body) : body;

  UrlFetchApp.fetch = function (url, options) {
    if (interceptor) interceptor(url, options);
    return {
      getResponseCode: () => code,
      getContentText: () => bodyStr
    };
  };

  return function restore() {
    UrlFetchApp.fetch = original;
  };
}

/**
 * UrlFetchApp.fetch を順番に異なるレスポンスを返すようモック化する
 * （getChatworkDownloadUrl → Modal本体 の2回呼び出し用）
 * @param {Array<{code: number, body: string|object}>} responses
 * @returns {function} モック解除関数
 */
function mockUrlFetchAppSequence(responses) {
  const original = UrlFetchApp.fetch;
  let callIndex = 0;

  UrlFetchApp.fetch = function (url, options) {
    const r = responses[callIndex] || responses[responses.length - 1];
    callIndex++;
    const bodyStr = typeof r.body === 'object' ? JSON.stringify(r.body) : r.body;
    return {
      getResponseCode: () => r.code,
      getContentText: () => bodyStr
    };
  };

  return function restore() {
    UrlFetchApp.fetch = original;
  };
}

// ==================================================
// メインエントリーポイント
// ==================================================

/**
 * 全テストを実行する（GASエディタから実行）
 */
function runAllTests() {
  console.log("========================================");
  console.log("🧪 テストスイート開始");
  console.log("========================================");

  // --- Unit Tests（外部API不要） ---
  testResetCommandDetection();
  testCleanMarkdownForLine();
  testFormatForChatwork();
  testMaskPII();
  testChatworkNoiseRemoval();
  testNullGuards();
  testModalClientUnit();

  // --- Integration Tests（API接続が必要） ---
  testMiiboApiConnection();
  testResetMiiboConversation();
  testLogConversationForReset();

  // --- サマリー ---
  console.log("\n========================================");
  console.log("📊 テスト結果サマリー");
  console.log(`   合格: ${TEST_RESULTS.passed}`);
  console.log(`   不合格: ${TEST_RESULTS.failed}`);
  console.log("========================================");

  if (TEST_RESULTS.failed > 0) {
    console.error("\n⚠️ 失敗したテスト:");
    TEST_RESULTS.errors.forEach(e => console.error(e));
  } else {
    console.log("\n🎉 全テスト合格！");
  }
}

/**
 * Unit Testsのみ実行（API接続不要・高速）
 */
function runUnitTestsOnly() {
  console.log("========================================");
  console.log("🧪 Unit Tests のみ実行");
  console.log("========================================");

  testResetCommandDetection();
  testCleanMarkdownForLine();
  testFormatForChatwork();
  testMaskPII();
  testChatworkNoiseRemoval();
  testNullGuards();
  testModalClientUnit();

  console.log("\n========================================");
  console.log(`📊 合格: ${TEST_RESULTS.passed} / 不合格: ${TEST_RESULTS.failed}`);
  console.log("========================================");
  if (TEST_RESULTS.failed === 0) console.log("🎉 全テスト合格！");
}

// ==================================================
// Unit Test 1: リセットコマンド判定
// ==================================================
function testResetCommandDetection() {
  console.log("\n[Unit Test 1] リセットコマンド判定ロジック");

  // --- 正常系: リセットと判定されるべきケース ---
  console.log("  [正常系: リセット判定]"  );
  assertTrue("'リセット' → true", isResetCommand('リセット'));
  assertTrue("'りせっと' → true", isResetCommand('りせっと'));
  assertTrue("' リセット ' (前後空白) → true", isResetCommand(' リセット '));
  assertTrue("'\\tりせっと\\n' (タブ・改行) → true", isResetCommand('\tりせっと\n'));

  // 丁寧表現
  assertTrue("'リセットして' → true", isResetCommand('リセットして'));
  assertTrue("'リセットお願いします' → true", isResetCommand('リセットお願いします'));
  assertTrue("'リセットしてください' → true", isResetCommand('リセットしてください'));
  assertTrue("'りせっとして' → true", isResetCommand('りせっとして'));

  // 会話・履歴が主語
  assertTrue("'会話をリセット' → true", isResetCommand('会話をリセット'));
  assertTrue("'会話リセット' → true", isResetCommand('会話リセット'));
  assertTrue("'履歴リセット' → true", isResetCommand('履歴リセット'));
  assertTrue("'会話をリセットして' → true", isResetCommand('会話をリセットして'));
  assertTrue("'会話リセットお願いします' → true", isResetCommand('会話リセットお願いします'));
  assertTrue("'最初からリセット' → true", isResetCommand('最初からリセット'));

  // --- 異常系: リセットと判定されるべきでないケース ---
  console.log("  [異常系: リセット非判定]"  );

  // 機器名を含むケース
  assertFalse("'HGWをリセットして' → false", isResetCommand('HGWをリセットして'));
  assertFalse("'ルーターをリセット' → false", isResetCommand('ルーターをリセット'));
  assertFalse("'ONUリセット' → false", isResetCommand('ONUリセット'));
  assertFalse("'Merakiをリセットしたい' → false", isResetCommand('Merakiをリセットしたい'));
  assertFalse("'Wi-Fiリセット' → false", isResetCommand('Wi-Fiリセット'));
  assertFalse("'モデムのリセット' → false", isResetCommand('モデムのリセット'));
  assertFalse("'APをリセット' → false", isResetCommand('APをリセット'));
  assertFalse("'スイッチのリセット方法' → false", isResetCommand('スイッチのリセット方法'));

  // 過去形・状況報告
  assertFalse("'リセットした' → false", isResetCommand('リセットした'));
  assertFalse("'リセットしました' → false", isResetCommand('リセットしました'));
  assertFalse("'リセットしてみた' → false", isResetCommand('リセットしてみた'));
  assertFalse("'リセットしたけどダメ' → false", isResetCommand('リセットしたけどダメ'));
  assertFalse("'リセットしたら直る？' → false", isResetCommand('リセットしたら直る？'));
  assertFalse("'リセットされた' → false", isResetCommand('リセットされた'));
  assertFalse("'リセットしたのに' → false", isResetCommand('リセットしたのに'));

  // 疑問形
  assertFalse("'リセットする方法' → false", isResetCommand('リセットする方法'));
  assertFalse("'リセットする手順' → false", isResetCommand('リセットする手順'));
  assertFalse("'リセットするべき？' → false", isResetCommand('リセットするべき？'));
  assertFalse("'リセットできない' → false", isResetCommand('リセットできない'));

  // リセットを含まない
  assertFalse("'reset' → false", isResetCommand('reset'));
  assertFalse("'RESET' → false", isResetCommand('RESET'));
  assertFalse("'' (空文字) → false", isResetCommand(''));
  assertFalse("null → false", isResetCommand(null));
  assertFalse("undefined → false", isResetCommand(undefined));
}

// ==================================================
// Unit Test 2: LINE向けMarkdown整形
// ==================================================
function testCleanMarkdownForLine() {
  console.log("\n[Unit Test 2] cleanMarkdownForLine 整形テスト");

  // null / 空文字
  assertEqual("null → 空文字", cleanMarkdownForLine(null), "");
  assertEqual("空文字 → 空文字", cleanMarkdownForLine(""), "");

  // 太字変換
  assertEqual("太字 → 【】", cleanMarkdownForLine("これは**重要**です"), "これは【重要】です");

  // 見出し変換
  assertContains("### → ■", cleanMarkdownForLine("### 手順1"), "■ 手順1");
  assertContains("## → ■", cleanMarkdownForLine("## 概要"), "■ 概要");

  // 表 → リスト変換 (2カラム)
  const table2 = "| 項目 | 値 |\n|---|---|\n| CPU | 80% |";
  const result2 = cleanMarkdownForLine(table2);
  assertContains("2カラム表のリスト化", result2, "・項目 : 値");
  assertContains("2カラム表のデータ行", result2, "・CPU : 80%");

  // 連続改行の整理
  assertEqual("3連続改行 → 2改行", cleanMarkdownForLine("A\n\n\nB"), "A\n\nB");
}

// ==================================================
// Unit Test 3: Chatwork向けMarkdown変換
// ==================================================
function testFormatForChatwork() {
  console.log("\n[Unit Test 3] formatForChatwork 変換テスト");

  // null / 空文字
  assertEqual("null → 空文字", formatForChatwork(null), "");
  assertEqual("空文字 → 空文字", formatForChatwork(""), "");

  // 太字 → [info]
  assertContains("太字 → [info]", formatForChatwork("これは**重要**です"), "[info]重要[/info]");

  // 見出し → [title]
  assertContains("### → [title]", formatForChatwork("### 手順1"), "[title]手順1[/title]");
  assertContains("## → [title]", formatForChatwork("## 概要"), "[title]概要[/title]");

  // コードブロック → [code]
  assertContains("``` → [code]", formatForChatwork("```\nconst x = 1;\n```"), "[code]");
}

// ==================================================
// Unit Test 4: PII マスキング
// ==================================================
function testMaskPII() {
  console.log("\n[Unit Test 4] maskPII マスキングテスト");

  // null / 空文字 / 非文字列
  assertEqual("null → 空文字", maskPII(null), "");
  assertEqual("空文字 → 空文字", maskPII(""), "");
  assertEqual("数値はそのまま", maskPII(12345), 12345);

  // メールアドレス
  assertEqual(
    "メールマスク",
    maskPII("連絡先は test@example.com です"),
    "連絡先は [EMAIL_MASKED] です"
  );

  // 電話番号（ハイフンあり）
  assertContains(
    "携帯番号マスク (ハイフンあり)",
    maskPII("電話: 090-1234-5678"),
    "[PHONE_MASKED]"
  );

  // 電話番号（ハイフンなし）
  assertContains(
    "固定電話マスク (ハイフンなし)",
    maskPII("TEL: 0312345678"),
    "[PHONE_MASKED]"
  );

  // PIIなし
  assertEqual(
    "PIIなしはそのまま",
    maskPII("HGWのランプが赤く点滅しています"),
    "HGWのランプが赤く点滅しています"
  );

  // 複合パターン
  const mixed = "田中 test@a.com 090-1111-2222";
  const maskedMixed = maskPII(mixed);
  assertContains("複合: メールマスク", maskedMixed, "[EMAIL_MASKED]");
  assertContains("複合: 電話マスク", maskedMixed, "[PHONE_MASKED]");
}

// ==================================================
// Unit Test 5: Chatworkノイズ除去
// ==================================================
function testChatworkNoiseRemoval() {
  console.log("\n[Unit Test 5] Chatwork ノイズ除去ロジック");

  // main.js の handleChatworkEvent と同じ正規表現を再現
  function removeNoise(rawBody) {
    return rawBody
      .replace(/\[(rp|To).*?\].*?(\n|$)/g, '')
      .replace(/\[info\][\s\S]*?\[\/info\]/g, '')
      .trim();
  }

  // メンションタグの除去
  assertEqual(
    "Toタグ除去",
    removeNoise("[To:12345] ボットさん\nルーターが壊れました"),
    "ルーターが壊れました"
  );

  // リプライタグの除去
  assertEqual(
    "rpタグ除去",
    removeNoise("[rp aid=12345 to=100-200] 前の発言\nWi-Fi不調です"),
    "Wi-Fi不調です"
  );

  // infoブロックの除去
  assertEqual(
    "infoブロック除去",
    removeNoise("質問です[info]引用テキスト[/info]"),
    "質問です"
  );

  // 複合パターン
  assertEqual(
    "複合ノイズ除去",
    removeNoise("[To:999] bot\n[info]引用[/info]\n本文です"),
    "本文です"
  );
}

// ==================================================
// Unit Test 6: Null ガード・境界値テスト
// ==================================================
function testNullGuards() {
  console.log("\n[Unit Test 6] Null ガード・境界値テスト");

  // cleanMarkdownForLine
  assertNoThrow("cleanMarkdownForLine(undefined)", function () { cleanMarkdownForLine(undefined); });
  assertNoThrow("cleanMarkdownForLine(null)", function () { cleanMarkdownForLine(null); });

  // formatForChatwork
  assertNoThrow("formatForChatwork(undefined)", function () { formatForChatwork(undefined); });
  assertNoThrow("formatForChatwork(null)", function () { formatForChatwork(null); });

  // maskPII
  assertNoThrow("maskPII(undefined)", function () { maskPII(undefined); });
  assertNoThrow("maskPII(null)", function () { maskPII(null); });
  assertNoThrow("maskPII(0)", function () { maskPII(0); });

  // replyToLine — 空テキストでもクラッシュしないこと
  // ※実際のAPI呼び出しで400が返るが、muteHttpExceptionsで吸収される
  assertNoThrow("replyToLine(null, null)", function () { replyToLine(null, null); });
  assertNoThrow("replyToLine('dummy', '')", function () { replyToLine('dummy', ''); });
}

// ==================================================
// Integration Test 1: miibo API 疎通
// ==================================================
function testMiiboApiConnection() {
  console.log("\n[Integration Test 1] miibo API 疎通テスト");

  const testUid = "test_runner_" + new Date().getTime();
  const response = callMiiboApi(testUid, "接続テスト");

  assertTrue("callMiiboApi が文字列を返す", typeof response === 'string');
  assertFalse("エラーメッセージでない", response.startsWith("⚠️"));
  console.log(`  ℹ️ miibo応答: "${response.substring(0, 80)}..."`);
}

// ==================================================
// Integration Test 2: リセットAPI疎通
// ==================================================
function testResetMiiboConversation() {
  console.log("\n[Integration Test 2] resetMiiboConversation 疎通テスト");

  const testUid = "test_reset_" + new Date().getTime();

  // まず会話を開始
  const setupResponse = callMiiboApi(testUid, "テスト会話開始");
  assertTrue("事前会話が成功", typeof setupResponse === 'string' && !setupResponse.startsWith("⚠️"));

  // リセット実行
  const result = resetMiiboConversation(testUid);
  assertTrue("resetMiiboConversation が true を返す", result === true);

  // リセット後に空の utterance で会話開始されたことを確認
  // （リセット直後に通常の問い合わせが正常に動くか）
  const afterReset = callMiiboApi(testUid, "リセット後のテスト");
  assertTrue("リセット後も会話可能", typeof afterReset === 'string' && !afterReset.startsWith("⚠️"));

  console.log(`  ℹ️ リセット後応答: "${afterReset.substring(0, 80)}..."`);
}

// ==================================================
// Integration Test 3: リセット時のログ記録
// ==================================================
function testLogConversationForReset() {
  console.log("\n[Integration Test 3] リセット時ログ記録テスト");

  assertNoThrow("logConversation (リセット用) が例外なく完了", function () {
    logConversation(
      'LINE',
      'test_user_reset',
      'テストユーザー',
      'system-reset',
      '[システムコマンド: リセット]',
      '[履歴・ステート初期化完了]',
      ''
    );
  });

  // シートに書き込まれたか確認
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.LOG_SHEET_LINE);
    if (sheet) {
      const lastRow = sheet.getLastRow();
      const lastData = sheet.getRange(lastRow, 1, 1, 8).getValues()[0];
      assertEqual("ログのセッションID", lastData[4], "system-reset");
      assertContains("ログのユーザークエリ", lastData[5], "リセット");
      assertContains("ログのAI回答", lastData[6], "初期化完了");
      console.log("  ℹ️ ログシートの最終行を確認しました");
    } else {
      console.warn("  ⚠️ ログシートが存在しません（initializeLogSheets を先に実行してください）");
    }
  } catch (e) {
    console.warn("  ⚠️ ログシート確認スキップ:", e.message);
  }
}

// ==================================================
// Unit Test 7: modal_client.js
// ==================================================

function testModalClientUnit() {
  console.log("\n[Unit Test 7] modal_client.js — callModalToProcessImage / getChatworkDownloadUrl");

  // --- 7-1: LINE — 正常系 ---
  {
    const restore = mockUrlFetchApp(200, { status: 'success', base64_image: 'data:image/jpeg;base64,ABC==' });
    try {
      const result = callModalToProcessImage('line', 'msg_001', 'user_test_001');
      assertEqual('LINE 正常レスポンスで base64_image が返る', result, 'data:image/jpeg;base64,ABC==');
    } finally { restore(); }
  }

  // --- 7-2: LINE — ペイロード構造確認 ---
  {
    let captured = null;
    const restore = mockUrlFetchApp(200, { status: 'success', base64_image: 'ok' }, function (url, opts) {
      captured = JSON.parse(opts.payload);
    });
    try {
      callModalToProcessImage('line', 'msg_002', 'user_test_002');
      assertEqual('LINE ペイロードに source=line', captured.source, 'line');
      assertEqual('LINE ペイロードに id=msg_002', captured.id, 'msg_002');
      assertEqual('LINE ペイロードに user=user_test_002', captured.user, 'user_test_002');
      assertTrue('LINE ペイロードに auth_token が存在', !!captured.auth_token);
    } finally { restore(); }
  }

  // --- 7-3: Chatwork — roomId 未指定 → try-catch内で捕捉され null 返却 ---
  {
    const result = callModalToProcessImage('chatwork', 'file_001', 'user_cw');
    assertNull('Chatwork roomId なしで null が返る', result);
  }

  // --- 7-4: Chatwork — 正常系（2段階モック: CW API → Modal API） ---
  {
    const restore = mockUrlFetchAppSequence([
      { code: 200, body: { download_url: 'https://example.com/dl/file_001' } },
      { code: 200, body: { status: 'success', base64_image: 'data:image/jpeg;base64,CWIMG==' } }
    ]);
    try {
      const result = callModalToProcessImage('chatwork', 'file_001', 'user_cw', '12345');
      assertEqual('Chatwork 正常レスポンスで base64_image が返る', result, 'data:image/jpeg;base64,CWIMG==');
    } finally { restore(); }
  }

  // --- 7-5: 未知の platform でエラー（null 返却） ---
  {
    const result = callModalToProcessImage('slack', 'msg_001', 'user_test');
    assertNull('未知 platform は null を返す', result);
  }

  // --- 7-6: HTTP 401 (Auth Error) → null ---
  {
    const restore = mockUrlFetchApp(401, { error: 'Unauthorized', status: 'failed', error_code: 'AUTH_FAILED' });
    try {
      const result = callModalToProcessImage('line', 'msg_001', 'user_test');
      assertNull('HTTP 401 で null が返る', result);
    } finally { restore(); }
  }

  // --- 7-7: HTTP 400 (Bad Request) → null ---
  {
    const restore = mockUrlFetchApp(400, { error: 'Missing param', status: 'failed', error_code: 'MISSING_PARAM' });
    try {
      const result = callModalToProcessImage('line', 'msg_001', 'user_test');
      assertNull('HTTP 400 で null が返る', result);
    } finally { restore(); }
  }

  // --- 7-8: HTTP 413 (Payload Too Large) → null ---
  {
    const restore = mockUrlFetchApp(413, { error: 'Too large', status: 'failed', error_code: 'PAYLOAD_TOO_LARGE' });
    try {
      const result = callModalToProcessImage('line', 'msg_001', 'user_test');
      assertNull('HTTP 413 で null が返る', result);
    } finally { restore(); }
  }

  // --- 7-9: HTTP 500 (Server Error) → null ---
  {
    const restore = mockUrlFetchApp(500, { error: 'Internal error', status: 'failed', error_code: 'INTERNAL_ERROR' });
    try {
      const result = callModalToProcessImage('line', 'msg_001', 'user_test');
      assertNull('HTTP 500 で null が返る', result);
    } finally { restore(); }
  }

  // --- 7-10: JSON パース失敗 → null ---
  {
    const restore = mockUrlFetchApp(200, 'this is not json {{{}');
    try {
      const result = callModalToProcessImage('line', 'msg_001', 'user_test');
      assertNull('JSON パース失敗時に null が返る', result);
    } finally { restore(); }
  }

  // --- 7-11: 成功だが status !== 'success' → null ---
  {
    const restore = mockUrlFetchApp(200, { status: 'error', error: 'Something went wrong' });
    try {
      const result = callModalToProcessImage('line', 'msg_001', 'user_test');
      assertNull('status が success でない場合 null が返る', result);
    } finally { restore(); }
  }

  // --- 7-12: getChatworkDownloadUrl — download_url が空 → 例外 ---
  {
    const restore = mockUrlFetchApp(200, { download_url: '' });
    try {
      assertThrows('CW download_url 空文字列でエラー', function () {
        getChatworkDownloadUrl('12345', 'file_001');
      });
    } finally { restore(); }
  }

  // --- 7-13: getChatworkDownloadUrl — API エラー → 例外 ---
  {
    const restore = mockUrlFetchApp(403, 'Forbidden');
    try {
      assertThrows('CW File API が 403 でエラー', function () {
        getChatworkDownloadUrl('12345', 'file_001');
      });
    } finally { restore(); }
  }
}

// ==================================================
// 個別実行用エントリーポイント
// ==================================================

/** LINE リセットフローのE2Eシミュレーション */
function testSimulateLineReset() {
  console.log("========================================");
  console.log("🧪 LINE リセットフロー E2E シミュレーション");
  console.log("========================================");

  const dummyEvent = {
    events: [{
      type: "message",
      message: { type: "text", id: "test_001", text: "リセット" },
      source: { userId: "test_line_reset_" + new Date().getTime() },
      replyToken: "00000000000000000000000000000000"
    }]
  };

  assertNoThrow("handleLineEvents (リセット) がクラッシュしない", function () {
    handleLineEvents(dummyEvent);
  });

  console.log("✅ LINE リセットフロー完了（replyToLine は無効トークンでエラーになりますが正常です）");
}

/** Chatwork リセットフローのE2Eシミュレーション */
function testSimulateChatworkReset() {
  console.log("========================================");
  console.log("🧪 Chatwork リセットフロー E2E シミュレーション");
  console.log("========================================");

  const botId = Number(CONFIG.BOT_ACCOUNT_ID) || 123456;

  const dummyPayload = {
    webhook_event: {
      from_account_id: 999999,
      account_id: 999999,
      room_id: 12345678,
      message_id: "test_msg_001",
      body: `[To:${botId}] ボット\nリセット`
    }
  };

  assertNoThrow("handleChatworkEvent (リセット) がクラッシュしない", function () {
    handleChatworkEvent(dummyPayload);
  });

  console.log("✅ Chatwork リセットフロー完了（送信先ルームが存在しないためAPIエラーは正常です）");
}
