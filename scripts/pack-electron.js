#!/usr/bin/env node

/**
 * Electron 一键打包脚本
 *
 * 使用方法:
 *   node scripts/pack-electron.js            # 打包当前平台
 *   node scripts/pack-electron.js --win      # 打包 Windows
 *   node scripts/pack-electron.js --mac      # 打包 macOS
 *   node scripts/pack-electron.js --linux    # 打包 Linux
 *   node scripts/pack-electron.js --all      # 打包全平台
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PLATFORMS = {
  win: '--win',
  mac: '--mac',
  linux: '--linux',
  all: '--win --mac --linux'
};

function runCommand(command, description) {
  console.log(`\n📦 ${description}...`);
  console.log(`   执行: ${command}`);

  try {
    execSync(command, { stdio: 'inherit', cwd: process.cwd() });
    console.log(`   ✅ ${description}完成`);
    return true;
  } catch (error) {
    console.error(`   ❌ ${description}失败`);
    console.error(error.message);
    return false;
  }
}

function main() {
  const args = process.argv.slice(2);
  const platformArg = args.find(arg => arg.startsWith('--'));
  const platform = platformArg ? platformArg.replace('--', '') : null;

  console.log('========================================');
  console.log('   NAS Indexer Electron 打包脚本');
  console.log('========================================');
  console.log(`   目标平台: ${platform || '当前平台'}`);
  console.log(`   工作目录: ${process.cwd()}`);
  console.log('========================================\n');

  // 步骤 1: 编译后端 TypeScript
  if (!runCommand('npm run build', '编译后端 TypeScript')) {
    process.exit(1);
  }

  // 步骤 2: 编译前端 Vue
  console.log('\n📦 编译前端 Vue...');
  try {
    // 尝试在 frontend 目录下编译
    execSync('npm run build', { stdio: 'inherit', cwd: path.join(process.cwd(), 'frontend') });
    console.log('   ✅ 编译前端 Vue 完成');
  } catch (error) {
    console.log('   ❌ 编译前端 Vue 失败');
    process.exit(1);
  }

  // 步骤 3: 编译 Electron 主进程
  if (!runCommand('tsc -p electron/tsconfig.json', '编译 Electron 主进程')) {
    process.exit(1);
  }

  // 步骤 4: 运行 electron-builder
  const builderArgs = platform ? PLATFORMS[platform] : '';
  const builderCommand = builderArgs
    ? `electron-builder ${builderArgs}`
    : 'electron-builder';

  if (!runCommand(builderCommand, '打包 Electron 应用')) {
    process.exit(1);
  }

  // 输出结果
  console.log('\n========================================');
  console.log('   ✅ 打包完成！');
  console.log('========================================');
  console.log('   输出目录: release/');
  console.log('   查看文件: ls release/');
  console.log('========================================\n');

  // 写入打包日志
  const logPath = path.join(process.cwd(), 'build-log.txt');
  const logContent = `
打包时间: ${new Date().toLocaleString()}
目标平台: ${platform || '当前平台'}
输出目录: release/
`;
  fs.writeFileSync(logPath, logContent);
  console.log(`   日志已写入: ${logPath}`);
}

main();