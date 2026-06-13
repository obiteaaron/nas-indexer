import pino, { Logger } from 'pino';
import fs from 'fs';
import path from 'path';

interface LoggerOptions {
  logFilePath?: string;
}

const PROJECT_ROOT: string = path.join(__dirname, '..');
const DEFAULT_LOG_PATH: string = path.join(PROJECT_ROOT, 'profiles', 'nas-indexer.log');

function createLogger(options: LoggerOptions = {}): Logger {
  const logFilePath: string = options.logFilePath ?? DEFAULT_LOG_PATH;
  const logLevel: string = process.env.LOG_LEVEL ?? 'info';

  const logDir: string = path.dirname(logFilePath);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const isDev: boolean = process.env.NODE_ENV !== 'production';

  const transports: pino.TransportTargetOptions[] = [];

  if (isDev) {
    transports.push({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: undefined,  // 已使用本地时间，无需转换
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

  // 本地时区时间戳函数（返回 JSON 片段格式）
  const localTime = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    return `,"time":"${year}-${month}-${day} ${hour}:${minute}:${second}.${ms}"`;
  };

  return pino({
    level: logLevel,
    timestamp: localTime
  }, pino.transport({ targets: transports }));
}

const logger: Logger = createLogger();

export { logger, createLogger, LoggerOptions };