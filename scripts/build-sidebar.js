#!/usr/bin/env node

/**
 * サイドバー生成スクリプト
 * 
 * このスクリプトは、ドキュメントコンテンツからサイドバーを生成し、
 * 静的JSONファイルとして出力します。
 * 
 * 拡張機能:
 * - 複数のプロジェクトに対応（apps/ディレクトリ内の全プロジェクト）
 * - 言語とバージョンを動的に検出
 * - JSONファイルの圧縮
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';
import { saveCompressedJson, parseMarkdownFile } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 基本設定
const config = {
  appsDir: path.join(rootDir, 'apps'),
  baseUrl: '/docs/sample-docs',
};

/**
 * メイン処理
 */
async function main() {
  try {
    console.log('サイドバーの生成を開始します...');
    
    // appsディレクトリ内のプロジェクトを検出
    const projects = await detectProjects();
    
    if (projects.length === 0) {
      console.warn('ドキュメントプロジェクトが見つかりませんでした。');
      return;
    }
    
    // 各プロジェクトに対して処理を実行
    for (const project of projects) {
      console.log(`プロジェクト ${project.name} の処理を開始します...`);
      
      // 出力ディレクトリの作成
      await fs.mkdir(project.outputDir, { recursive: true });
      
      // 言語とバージョンの組み合わせごとにサイドバーを生成
      for (const lang of project.languages) {
        for (const version of project.versions) {
          console.log(`  ${lang}/${version} のサイドバーを生成中...`);
          
          try {
            // サイドバーを生成
            const sidebar = await generateSidebarForVersion(project, lang, version);
            
            // サイドバーをJSONとして保存（圧縮版も含む）
            const outputPath = path.join(project.outputDir, `sidebar-${lang}-${version}.json`);
            await saveCompressedJson(outputPath, sidebar);
          } catch (error) {
            console.error(`  ${lang}/${version} のサイドバー生成中にエラーが発生しました:`, error);
          }
        }
      }
    }
    
    console.log('サイドバーの生成が完了しました');
  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  }
}

/**
 * appsディレクトリ内のプロジェクトを検出する
 */
async function detectProjects() {
  const projects = [];
  
  try {
    // appsディレクトリ内のディレクトリを取得
    const entries = await fs.readdir(config.appsDir, { withFileTypes: true });
    const projectDirs = entries.filter(entry => entry.isDirectory());
    
    for (const dir of projectDirs) {
      const projectName = dir.name;
      const projectPath = path.join(config.appsDir, projectName);
      
      // src/content/docs ディレクトリが存在するかチェック
      const contentPath = path.join(projectPath, 'src', 'content', 'docs');
      try {
        await fs.access(contentPath);
      } catch (error) {
        // ドキュメントディレクトリがない場合はスキップ
        console.log(`${projectName} にはドキュメントディレクトリがありません。スキップします。`);
        continue;
      }
      
      // 言語ディレクトリを検出
      const languages = await detectLanguages(contentPath);
      
      if (languages.length === 0) {
        console.log(`${projectName} に言語ディレクトリが見つかりませんでした。スキップします。`);
        continue;
      }
      
      // 各言語ディレクトリ内のバージョンを検出
      const versions = await detectVersions(contentPath, languages[0]);
      
      if (versions.length === 0) {
        console.log(`${projectName} にバージョンディレクトリが見つかりませんでした。スキップします。`);
        continue;
      }
      
      // 出力ディレクトリを設定
      const outputDir = path.join(projectPath, 'public', 'sidebar');
      
      // プロジェクト情報を追加
      projects.push({
        name: projectName,
        path: projectPath,
        contentPath,
        outputDir,
        languages,
        versions
      });
      
      console.log(`プロジェクト ${projectName} を検出しました:`);
      console.log(`  言語: ${languages.join(', ')}`);
      console.log(`  バージョン: ${versions.join(', ')}`);
    }
  } catch (error) {
    console.error('プロジェクト検出中にエラーが発生しました:', error);
  }
  
  return projects;
}

/**
 * ドキュメントディレクトリ内の言語ディレクトリを検出する
 */
async function detectLanguages(contentPath) {
  try {
    const entries = await fs.readdir(contentPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  } catch (error) {
    console.error('言語ディレクトリの検出中にエラーが発生しました:', error);
    return [];
  }
}

/**
 * 言語ディレクトリ内のバージョンディレクトリを検出する
 */
async function detectVersions(contentPath, language) {
  try {
    const langPath = path.join(contentPath, language);
    const entries = await fs.readdir(langPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  } catch (error) {
    console.error('バージョンディレクトリの検出中にエラーが発生しました:', error);
    return [];
  }
}

/**
 * 指定された言語とバージョンのサイドバーを生成する
 */
async function generateSidebarForVersion(project, lang, version) {
  // ドキュメントファイルを検索
  const pattern = `${lang}/${version}/**/*.{md,mdx}`;
  
  const files = await glob(pattern, { cwd: project.contentPath });
  
  // ドキュメント情報を収集
  const docs = [];
  
  for (const file of files) {
    try {
      const filePath = path.join(project.contentPath, file);
      const { frontmatter: data } = await parseMarkdownFile(filePath);
      
      // スラグを生成（ファイルパスから拡張子を除去）
      const slug = file.replace(/\.[^.]+$/, '');
      
      docs.push({
        slug,
        data
      });
    } catch (error) {
      console.warn(`ファイルの処理中にエラーが発生しました: ${file}`, error);
    }
  }
  
  // カテゴリごとにドキュメントを整理
  const categories = {};
  
  // カテゴリの順序マッピング（デフォルト値）
  const categoryOrder = {
    'guide': 1,
    'api': 2,
    'examples': 3,
    'reference': 4,
    'advanced': 5,
    'plugins': 6,
    'migration': 7,
    'faq': 8
  };
  
  docs.forEach(doc => {
    // フロントマターからカテゴリを取得（指定されていない場合はパスから取得）
    const parts = doc.slug.split('/');
    const pathCategory = parts.length >= 3 ? parts[2] : 'uncategorized';
    const category = doc.data.category || pathCategory;
    
    // カテゴリの順序を取得（フロントマターから、または定義済みマッピングから）
    const order = doc.data.categoryOrder !== undefined 
      ? doc.data.categoryOrder 
      : (categoryOrder[category] || 999);
    
    if (!categories[category]) {
      categories[category] = {
        docs: [],
        order: order,
        title: undefined // 後で設定
      };
    }
    
    // カテゴリの順序を更新（複数のドキュメントで同じカテゴリが使用されている場合、最小の順序を使用）
    if (order < categories[category].order) {
      categories[category].order = order;
    }
    
    categories[category].docs.push(doc);
  });
  
  // カテゴリごとにドキュメントを順序で並べ替え
  Object.keys(categories).forEach(category => {
    categories[category].docs.sort((a, b) => {
      const orderA = a.data.order || 999;
      const orderB = b.data.order || 999;
      return orderA - orderB;
    });
  });
  
  // カテゴリを順序で並べ替え
  const sortedCategories = Object.entries(categories).sort((a, b) => {
    return a[1].order - b[1].order;
  });
  
  // プロジェクト固有のベースURLを取得
  const baseUrl = await getProjectBaseUrl(project);
  
  // サイドバー項目の生成
  return sortedCategories.map(([category, { docs }]) => {
    // カテゴリ名の翻訳を試みる（翻訳キーが存在しない場合はカテゴリ名をそのまま使用）
    // 実際の翻訳処理はフロントエンドで行うため、ここではカテゴリ名をそのまま使用
    const title = category.charAt(0).toUpperCase() + category.slice(1);
    
    return {
      title,
      items: docs.map(doc => {
        const slugParts = doc.slug.split('/').slice(2);
        let fullPath;
        if (baseUrl === '/') {
          fullPath = `/${lang}/${version}/${slugParts.join('/')}`;
        } else {
          fullPath = `${baseUrl}/${lang}/${version}/${slugParts.join('/')}`;
        }
        return {
          title: doc.data.title,
          href: fullPath
        };
      })
    };
  });
}

/**
 * プロジェクト固有のベースURLを取得する
 */
async function getProjectBaseUrl(project) {
  let projectSpecificBase = config.baseUrl;
  
  // プロジェクト名が 'sample-docs' でない場合、ベースURLにプロジェクト名を追加
  // config.baseUrl が /docs/sample-docs で、project.name が my-project の場合、
  // projectSpecificBase は /docs/sample-docs/my-project となる。
  if (project.name !== 'sample-docs') {
    // path.join はURL結合に向かないため、手動で結合
    const base = config.baseUrl.endsWith('/') ? config.baseUrl.slice(0, -1) : config.baseUrl;
    projectSpecificBase = `${base}/${project.name}`;
  }
  
  const configPath = path.join(project.path, 'astro.config.mjs');
  let astroBase = '';

  try {
    const configFileContent = await fs.readFile(configPath, 'utf-8');
    // export default defineConfig({ base: '/foo' }) や export default { base: "/bar" } や base: '.' に対応
    const baseMatch = configFileContent.match(/base\s*:\s*['"]((?:\/[^\\s'"]*|\.)*)['"]/);
    if (baseMatch && baseMatch[1]) {
      astroBase = baseMatch[1];
      if (astroBase === '.') { // '.' はルートを示すので空文字列に
        astroBase = '';
      }
      // astroBase が空でなく、かつ '/' で始まらない場合は '/' を追加
      if (astroBase && !astroBase.startsWith('/')) {
        astroBase = '/' + astroBase;
      }
      // astroBase が '/' より長く、かつ末尾が '/' の場合は削除 (例: /foo/ -> /foo)
      if (astroBase.length > 1 && astroBase.endsWith('/')) {
        astroBase = astroBase.slice(0, -1);
      }
      if (astroBase) {
        console.log(`  プロジェクト ${project.name} の astro.config.mjs から base='${astroBase}' を読み込みました。`);
      }
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      // astro.config.mjs が存在しないのは通常ケースなので、警告ログは出さない
      // console.log(`  astro.config.mjs が見つかりませんでした: ${project.name} (${configPath})`);
    } else {
      console.warn(`  プロジェクト ${project.name} の astro.config.mjs の読み込み/解析中にエラー: ${error.message}`);
    }
  }

  let finalBaseUrl = projectSpecificBase;
  if (astroBase && astroBase !== '/') { // astroBase が有効で、かつ単なる '/' でない場合
    // projectSpecificBase の末尾スラッシュを削除
    if (finalBaseUrl.endsWith('/')) {
      finalBaseUrl = finalBaseUrl.slice(0, -1);
    }
    // astroBase は先頭スラッシュが保証されているか、空文字列
    finalBaseUrl = finalBaseUrl + astroBase;
  }
  
  // 最終的なURLの末尾スラッシュを削除（ただしルート '/' の場合はそのまま）
  if (finalBaseUrl.endsWith('/') && finalBaseUrl !== '/') {
     finalBaseUrl = finalBaseUrl.slice(0, -1);
  }

  return finalBaseUrl;
}

// スクリプトの実行
main();
