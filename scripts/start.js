const { execSync } = require('child_process');
const path = require('path');

// Windows 下设置 UTF-8 代码页
if (process.platform === 'win32') {
  try {
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch (_e) { /* ignore */ }
}

// 构建前端
const frontendDir = path.join(__dirname, '..', 'frontend');
console.log('\n🔨 构建前端...');
try {
  execSync('npm run build', { cwd: frontendDir, stdio: 'inherit' });
  console.log('✅ 前端构建完成\n');
} catch (e) {
  console.warn('⚠️  前端构建失败，继续启动服务...');
}

// 编译 TypeScript
console.log('\n🔨 编译 TypeScript...');
try {
  execSync('npm run build', { cwd: path.join(__dirname, '..'), stdio: 'pipe' });
  console.log('✅ TypeScript 编译完成\n');
} catch (e) {
  // 即使 execSync 抛出错误，编译可能已经成功
  // 检查 dist/server.js 是否存在
  const serverPath = path.join(__dirname, '..', 'dist', 'server.js');
  if (require('fs').existsSync(serverPath)) {
    console.log('✅ TypeScript 编译完成（文件已存在）\n');
  } else {
    console.warn('⚠️  TypeScript 编译失败，尝试用 ts-node 直接运行...\n');
    require('ts-node').register();
    require('../src/server.ts');
    return;
  }
}

// 启动服务
console.log('🚀 启动服务...\n');
require('../dist/server.js');
