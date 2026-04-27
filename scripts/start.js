const { execSync } = require('child_process');

// Windows 下设置 UTF-8 代码页
if (process.platform === 'win32') {
  try {
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch (e) {
    // 忽略错误
  }
}

// 启动服务
require('../src/server.js');
