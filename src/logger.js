const pino = require('pino');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const DEFAULT_LOG_PATH = path.join(PROJECT_ROOT, 'profiles', 'nas-indexer.log');

function createLogger(options = {}) {
  const logFilePath = options.logFilePath || DEFAULT_LOG_PATH;
  const logLevel = process.env.LOG_LEVEL || 'info';
  
  const logDir = path.dirname(logFilePath);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const isDev = process.env.NODE_ENV !== 'production';
  
  const transports = [];
  
  if (isDev) {
    transports.push({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss.l',
        ignore: 'pid,hostname'
      }
    });
  } else {
    transports.push({
      target: 'pino/file',
      options: { destination: 1 }
    });
  }
  
  transports.push({
    target: 'pino/file',
    options: { destination: logFilePath }
  });
  
  return pino({
    level: logLevel,
    timestamp: pino.stdTimeFunctions.isoTime
  }, pino.transport({ targets: transports }));
}

const logger = createLogger();

module.exports = { logger, createLogger };