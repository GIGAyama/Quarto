/**
 * @fileoverview
 * このファイルは、Google Apps Script (GAS) を使ってWebアプリケーションを
 * 公開するためのサーバーサイド（裏側）のコードです。
 * 主な役割は、ユーザーがアプリのURLにアクセスしたときに、
 * ゲーム本体が書かれている 'index.html' ファイルをブラウザに送ることです。
 */

/**
 * Webアプリケーションにブラウザからアクセスがあった時（GETリクエスト）に
 * 自動的に実行される、GASで決められている特別な名前の関数です。
 *
 * @param {object} e - アクセスに関する情報が入ったイベントオブジェクト（今回は使いません）。
 * @return {HtmlOutput} - ブラウザに表示するためのHTMLコンテンツを返します。
 */
function doGet(e) {
  // HtmlServiceを使って、'index.html'ファイルの内容を読み込み、
  // Webページとして表示するための準備をします。
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('クアルト') // ブラウザのタブに表示されるタイトルを設定します。
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0'); // スマートフォンなどの画面サイズに合わせるための設定を追加します。
}
