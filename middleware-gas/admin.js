/**
 * スプレッドシートが開かれた時に実行される（メニュー追加）
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('🚀 システム管理')
    .addItem('1. 設定値のチェック', 'checkConfigWithUi')
    .addItem('2. 【初回のみ】ログシート初期構築', 'initializeLogSheets')
    .addItem('3. 【設定】APIキー登録', 'showConfigDialog')
    .addSeparator()
    .addItem('🧹 古い会話メモリの削除', 'cleanupOldPropertiesWithConfirm')
    .addToUi();
}

/**
 * UI付きの設定チェック
 */
function checkConfigWithUi() {
  // config.gs の checkConfig を呼び出す（コンソール出力用）
  checkConfig();

  // UIにも表示
  const ui = SpreadsheetApp.getUi();
  const missing = [];
  if (!CONFIG.LINE_ACCESS_TOKEN) missing.push('LINE_ACCESS_TOKEN');
  if (!CONFIG.MIIBO_API_KEY) missing.push('MIIBO_API_KEY');
  if (!CONFIG.MODAL_ENDPOINT_URL) missing.push('MODAL_ENDPOINT_URL');

  if (missing.length > 0) {
    ui.alert('⚠️ 設定不足', '以下の項目が未設定です:\n' + missing.join('\n'), ui.ButtonSet.OK);
  } else {
    ui.alert('✅ 設定OK', '必要な環境変数は全てセットされています。', ui.ButtonSet.OK);
  }
}

/**
 * 確認ダイアログ付きのクリーンアップ実行
 */
function cleanupOldPropertiesWithConfirm() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'メモリ解放（メンテナンス）',
    '最終アクセスから30日以上経過したユーザーの会話履歴（ID）を削除します。\n実行してよろしいですか？',
    ui.ButtonSet.YES_NO
  );

  if (response == ui.Button.YES) {
    cleanupOldProperties();
    ui.alert('完了', 'メンテナンスが完了しました。詳細は実行ログを確認してください。', ui.ButtonSet.OK);
  }
}

/**
 * メンテナンス本処理: 最終アクセスから30日以上経過したセッション情報を削除する
 */
function cleanupOldProperties() {
  const props = PropertiesService.getScriptProperties();
  const allData = props.getProperties();
  const now = new Date().getTime();
  const EXPIRE_MS = 30 * 24 * 60 * 60 * 1000; // 30日

  let deletedCount = 0;

  // 保存されている全データをチェック
  for (let key in allData) {
    // タイムスタンプキー（LAST_ACCESS_...）を探す
    if (key.startsWith('LAST_ACCESS_')) {
      const lastTime = parseInt(allData[key]);

      // 期限切れなら削除
      if ((now - lastTime) > EXPIRE_MS) {
        const userId = key.replace('LAST_ACCESS_', '');
        props.deleteProperty(key);                // 時間記録を削除
        props.deleteProperty('SESSION_' + userId); // 会話IDを削除
        deletedCount++;
      }
    }
  }

  console.log(`🧹 メンテナンス完了: ${deletedCount} 件の古いデータを削除しました。`);
}