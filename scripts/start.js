const { execSync } = require('child_process');
const path = require('path');

// Windows 下设置 UTF-8 代码页
if (process.platform === 'win32') {
  try {
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch (e) {}
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

// 启动服务
require('../src/server.js');
