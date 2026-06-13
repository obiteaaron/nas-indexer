/**
 * 创建便携版发行包
 * 将编译后的代码和必要文件打包到 dist-release 目录
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const DIST_RELEASE = path.join(PROJECT_ROOT, 'dist-release');

// 清理旧的发行目录
if (fs.existsSync(DIST_RELEASE)) {
  fs.rmSync(DIST_RELEASE, { recursive: true, force: true });
}

// 创建发行目录结构
fs.mkdirSync(DIST_RELEASE, { recursive: true });
fs.mkdirSync(path.join(DIST_RELEASE, 'dist'), { recursive: true });
fs.mkdirSync(path.join(DIST_RELEASE, 'profiles'), { recursive: true });
fs.mkdirSync(path.join(DIST_RELEASE, 'frontend', 'dist'), { recursive: true });

// 复制编译后的代码
console.log('复制 dist 目录...');
copyDir(path.join(PROJECT_ROOT, 'dist'), path.join(DIST_RELEASE, 'dist'));

// 复制 profiles 目录（配置和数据）
console.log('复制 profiles 目录...');
if (fs.existsSync(path.join(PROJECT_ROOT, 'profiles'))) {
  copyDir(path.join(PROJECT_ROOT, 'profiles'), path.join(DIST_RELEASE, 'profiles'));
}

// 复制前端构建产物
console.log('复制 frontend/dist 目录...');
if (fs.existsSync(path.join(PROJECT_ROOT, 'frontend', 'dist'))) {
  copyDir(path.join(PROJECT_ROOT, 'frontend', 'dist'), path.join(DIST_RELEASE, 'frontend', 'dist'));
}

// 复制 package.json（仅保留必要字段）
console.log('创建 package.json...');
const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8'));
const minimalPkg = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  main: 'dist/server.js',
  dependencies: pkg.dependencies
};
fs.writeFileSync(
  path.join(DIST_RELEASE, 'package.json'),
  JSON.stringify(minimalPkg, null, 2)
);

// 创建启动脚本
console.log('创建启动脚本...');
const startBat = `@echo off
cd /d "%~dp0"
echo NAS Indexer v${pkg.version}
echo 正在启动服务...
node dist\\server.js
if errorlevel 1 (
    echo.
    echo 启动失败！请确保 Node.js 已安装。
    echo 下载地址: https://nodejs.org/
    pause
)
`;
fs.writeFileSync(path.join(DIST_RELEASE, 'start.bat'), startBat);

// 创建 README
console.log('创建 README...');
const readme = `# NAS Indexer 便携版

版本: v${pkg.version}

## 使用方法

1. 确保已安装 Node.js (v16 或更高版本)
   - 下载地址: https://nodejs.org/

2. 双击 start.bat 启动服务

3. 打开浏览器访问: http://localhost:3000

## 目录结构

- dist/          - 后端编译代码
- frontend/dist/ - 前端静态文件
- profiles/      - 数据存储目录

## 注意事项

- profiles 目录包含数据库和配置文件，请勿删除
- 如需迁移，请将整个 dist-release 目录复制到新位置
`;
fs.writeFileSync(path.join(DIST_RELEASE, 'README.txt'), readme);

console.log('\n发行包创建完成！');
console.log(`位置: ${DIST_RELEASE}`);
console.log('\n下一步: 将 dist-release 目录打包为 ZIP 分发');

// 递归复制目录
function copyDir(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}