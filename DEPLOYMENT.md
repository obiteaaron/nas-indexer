# 群晖 NAS 部署指南

> 本文档介绍如何将 NAS Indexer 部署到群晖 NAS（DS718+ 及类似型号）。

## 系统要求

| 项目 | 要求 |
|------|------|
| 群晖型号 | DS718+ 或其他 x86_64 架构型号 |
| DSM 版本 | 7.0 或更高 |
| Docker | 套件中心安装 Docker 套件 |
| 内存 | 建议 2GB+（Docker 运行 Node.js 22） |

## 部署方案对比

### 方案一：Docker 部署 ✅ 推荐

| 优势 | 劣势 |
|------|------|
| 项目已有完整的 Dockerfile/docker-compose | 需配置 NAS 目录挂载路径 |
| 环境隔离，不影响 NAS 其他服务 | Docker 额外内存开销（约 50-100MB） |
| 群晖 Docker 界面友好，图形化管理 | 需手动构建镜像（或推送到 registry） |
| 健康检查、自动重启已配置 | Node.js 22 镜像体积较大 |
| 更新方便：重新构建即可 | |
| 数据持久化清晰（profiles 目录） | |

### 方案二：Node.js 直接运行

| 优势 | 劣势 |
|------|------|
| 资源占用更低 | DSM 套件中心 Node.js 版本可能不满足（需要 Node 22） |
| 无需挂载配置，直接访问文件 | 需手动管理进程（supervisor/systemd） |
| | 可能与 DSM 系统环境冲突 |
| | 更新维护麻烦 |

### 方案三：pkg 打包成独立二进制

| 优势 | 劣势 |
|------|------|
| 无需 Node.js 环境 | pkg 对 Node.js 22 支持**不完善** |
| 单文件部署简单 | sql.js（SQLite WASM）可能打包兼容问题 |
| | 需验证可行性，有风险 |

---

## Docker 部署详细步骤

### 方法 A：本地构建 → 传输镜像（推荐）

**适合场景**：开发机性能好，群晖 CPU 较弱，避免在 NAS 上编译。

#### 步骤 1：在开发机构建镜像

```bash
# 进入项目目录
cd nas-indexer

# 构建镜像
docker build -t nas-indexer:latest .

# 导出镜像为压缩包
docker save nas-indexer:latest | gzip > nas-indexer.tar.gz
```

#### 步骤 2：传输镜像到群晖

**方式一：通过 DSM 网页上传**
- 打开群晖 File Station
- 上传 `nas-indexer.tar.gz` 到 `/volume1/docker/` 目录

**方式二：通过 SCP 命令**
```bash
scp nas-indexer.tar.gz 用户名@群晖IP:/volume1/docker/
```

#### 步骤 3：在群晖加载镜像

SSH 登录群晖后执行：

```bash
# 加载镜像
docker load < /volume1/docker/nas-indexer.tar.gz

# 验证镜像已加载
docker images | grep nas-indexer
```

#### 步骤 4：创建配置目录

```bash
# 创建数据持久化目录
mkdir -p /volume1/docker/nas-indexer/profiles
```

#### 步骤 5：启动容器

**使用 docker-compose（推荐）**

创建 `/volume1/docker/nas-indexer/docker-compose.yml`：

```yaml
version: "3.3"
services:
  nas-indexer:
    image: nas-indexer:latest
    container_name: nas-indexer
    ports:
      - "3000:3000"
    volumes:
      # 数据持久化（数据库、配置、缓存）
      - /volume1/docker/nas-indexer/profiles:/app/profiles
      # NAS 文件目录挂载（只读，安全）
      # 根据你的实际目录结构调整
      - /volume1:/nas:ro
    environment:
      - PORT=3000
      - NODE_ENV=production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/api/stats"]
      interval: 30s
      timeout: 10s
      retries: 3
```

启动服务：

```bash
cd /volume1/docker/nas-indexer
docker compose up -d
```

**使用 docker run（备选）**

```bash
docker run -d \
  --name nas-indexer \
  --restart unless-stopped \
  -p 3000:3000 \
  -v /volume1/docker/nas-indexer/profiles:/app/profiles \
  -v /volume1:/nas:ro \
  -e PORT=3000 \
  -e NODE_ENV=production \
  nas-indexer:latest
```

#### 步骤 6：验证服务运行

```bash
# 查看容器状态
docker ps | grep nas-indexer

# 查看日志
docker logs nas-indexer

# 测试 API
curl http://localhost:3000/api/stats
```

#### 步骤 7：访问服务

浏览器打开：`http://群晖IP:3000`

---

### 方法 B：在群晖上直接构建

**适合场景**：不想传输镜像，群晖性能足够。

#### 步骤 1：传输源码到群晖

```bash
# 在开发机打包源码（排除 node_modules）
tar --exclude='node_modules' --exclude='dist' --exclude='dist-electron' \
    -czvf nas-indexer-src.tar.gz .

# 上传到群晖
scp nas-indexer-src.tar.gz 用户名@群晖IP:/volume1/docker/
```

#### 步骤 2：解压并构建

SSH 登录群晖：

```bash
# 创建目录
mkdir -p /volume1/docker/nas-indexer
cd /volume1/docker/nas-indexer

# 解压源码
tar -xzvf nas-indexer-src.tar.gz

# 构建镜像（需要较长时间）
docker build -t nas-indexer:latest .
```

#### 步骤 3：启动容器

参考方法 A 的步骤 5。

---

## 目录挂载说明

| 容器路径 | 群晖路径 | 说明 |
|----------|----------|------|
| `/app/profiles` | `/volume1/docker/nas-indexer/profiles` | 数据库、配置、缓存存储 |
| `/nas` | `/volume1` 或 `/volume1/video` | 待扫描的 NAS 文件目录 |

**重要提示**：
- NAS 文件目录建议使用 `:ro`（只读）挂载，防止误删除
- 如果需要文件管理功能（重命名、删除等），去掉 `:ro`

**多目录挂载示例**：

```yaml
volumes:
  - /volume1/docker/nas-indexer/profiles:/app/profiles
  - /volume1/video:/nas/video:ro
  - /volume1/music:/nas/music:ro
  - /volume1/photo:/nas/photo:ro
```

然后在应用配置中设置扫描路径为 `/nas/video`、`/nas/music` 等。

---

## 端口配置

默认端口 3000，如需更改：

```yaml
ports:
  - "8080:3000"  # 外部访问 8080，内部仍为 3000
```

或修改环境变量：

```yaml
environment:
  - PORT=8080
ports:
  - "8080:8080"
```

---

## 更新部署

### 更新镜像

```bash
# 方法 A：重新构建并传输
# 在开发机
docker build -t nas-indexer:latest .
docker save nas-indexer:latest | gzip > nas-indexer.tar.gz
scp nas-indexer.tar.gz 用户名@群晖IP:/volume1/docker/

# 在群晖
docker load < /volume1/docker/nas-indexer.tar.gz
```

### 重启容器

```bash
cd /volume1/docker/nas-indexer
docker compose down
docker compose up -d
```

或：

```bash
docker restart nas-indexer
```

---

## 数据备份

### 备份 profiles 目录

```bash
# 在群晖上执行
tar -czvf nas-indexer-backup.tar.gz /volume1/docker/nas-indexer/profiles
```

### 或通过应用内置功能

应用支持一键备份 Profiles（ZIP 压缩包），可在网页界面下载。

---

## 常见问题

### Q1：容器启动失败

检查日志：
```bash
docker logs nas-indexer
```

常见原因：
- 端口冲突：更改端口映射
- 目录不存在：确保挂载路径正确
- 内存不足：群晖内存建议 2GB+

### Q2：无法扫描 NAS 文件

检查：
- 挂载路径是否正确
- 目录权限是否可读
- 应用配置中扫描路径是否为容器内路径（如 `/nas/video`）

### Q3：数据库丢失

确保 profiles 目录正确挂载持久化，不要使用容器内部临时存储。

### Q4：群晖架构不兼容

DS718+ 是 x86_64 架构，完全兼容。
ARM 架构群晖（如 DS218）需要重新构建 ARM 版镜像，或检查 Node.js 官方镜像是否支持。

---

## 通过群晖 Docker 界面管理

群晖 Docker 套件提供图形化界面：

1. **镜像管理**：可在「映像」页面查看、删除镜像
2. **容器管理**：可在「容器」页面启动、停止、重启、查看日志
3. **网络配置**：可配置端口映射、网络模式
4. **存储配置**：可查看和管理挂载卷

推荐使用 docker-compose 配置文件启动，但后续可用图形界面监控和管理。

---

## SSH 远程部署（可选）

如果本地已配置 SSH 密钥认证到群晖，可远程执行：

```bash
# 传输镜像
scp nas-indexer.tar.gz admin@192.168.1.x:/volume1/docker/

# 远程加载并启动
ssh admin@192.168.1.x "docker load < /volume1/docker/nas-indexer.tar.gz && \
  cd /volume1/docker/nas-indexer && docker compose up -d"
```

---

## 资源占用参考

| 项目 | 占用 |
|------|------|
| 镜像大小 | 约 200-300MB |
| 容器内存 | 约 50-100MB（空闲） |
| 运行时内存 | 扫描时可能增加 50-100MB |
| CPU | 扫描时较高，空闲时很低 |

DS718+（2GB 内存）完全足够运行。

---

## 总结

| 方案 | 适用场景 | 推荐度 |
|------|----------|--------|
| **Docker** | 群晖 Docker 可用，希望稳定易维护 | ⭐⭐⭐⭐⭐ |
| Node.js 直接运行 | Docker 资源紧张，有 Node.js 运维经验 | ⭐⭐ |
| pkg 打包 | 资源极度受限，愿意承担兼容风险 | ⭐ |

**Docker 是最佳方案**——项目已做好 Docker 支持，群晖 Docker 管理界面成熟，部署、更新、监控都很方便。