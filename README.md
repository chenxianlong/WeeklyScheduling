# WeeklyScheduling

一个面向组织内部的开源一周工作安排系统，覆盖部门填报、冲突校验、管理员审核、周安排编辑、网页发布，以及电脑版和手机版 PDF 导出。

## 功能特性

- 部门账号登录与角色权限控制
- 草稿保存、提交审核、退回修改和删除
- 时间重叠提醒与同一地点冲突拦截
- 跨部门填报情况只读汇总
- 管理员审核、编辑、删除与正式发布
- 历史发布版本留存
- 电脑版 A4 横向 PDF 与手机版竖向 PDF
- 部门、地点、账号、学年学期和周次配置
- 用户通知邮箱绑定与填报退回邮件通知
- 审计日志与基于 SQLite 的会话存储
- 旧 Laravel/MySQL 数据迁移工具

## 技术栈

- Node.js、Express、TypeScript
- SQLite、better-sqlite3、Drizzle ORM
- React、Vite、Tailwind CSS
- Playwright PDF
- Vitest

## 快速开始

环境要求：Node.js 20 或更高版本。

```bash
cp .env.example .env
npm install
npx playwright install chromium
```

编辑 `.env`，至少设置以下三项：

```dotenv
SESSION_SECRET=请替换为随机长字符串
SEED_ADMIN_PASSWORD=至少12位的独立强密码
SEED_STAFF_PASSWORD=至少12位的独立强密码
```

然后初始化并启动：

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

- Web：`http://localhost:5173`
- API：`http://localhost:3000/api`
- 初始管理员账号：`admin`
- 示例填报账号：`office`、`academic`、`it-center`、`student-affairs`
- 密码来自本地 `.env`，仓库不提供固定密码

首次登录后，请在“系统管理 → 用户账号”中为每个账号设置独立密码。

## 配置

常用环境变量见 [.env.example](.env.example)：

- `ORGANIZATION_NAME`：界面、PDF 和下载文件名中显示的组织名称
- `EMAIL_ALLOWED_DOMAIN`：允许用户绑定的组织邮箱域名
- `DATABASE_PATH`：SQLite 数据库路径
- `MEETING_SCHEDULE_ACADEMIC_YEAR`：默认学年
- `MEETING_SCHEDULE_SEMESTER`：默认学期
- `PDF_STORAGE_PATH`：PDF 输出目录
- `PLAYWRIGHT_CHROMIUM_PATH`：可选的 Chromium 可执行文件路径

部门、地点、账号及学期周次也可在系统管理界面维护。

### 退回邮件通知

管理员可在“系统管理 → 用户账号”中绑定用户的组织邮箱。管理员退回填报后，系统会把通知写入持久化邮件队列，邮件包含学期周次、部门、退回原因和修改入口；投递失败不会阻断审核操作，并会自动重试。

在 `.env` 中配置 SMTP 服务。敏感凭据不得提交到仓库：

```dotenv
EMAIL_ALLOWED_DOMAIN=example.org
SMTP_HOST=smtp.example.org
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=notifications@example.org
SMTP_PASSWORD=邮箱客户端专用密码或授权码
SMTP_FROM=notifications@example.org
```

未配置 SMTP 时通知会保留在队列中，配置并重启服务后自动尝试发送。

## 生产构建

```bash
npm run build
NODE_ENV=production npm start
```

生产环境必须使用独立强随机 `SESSION_SECRET`，通过 HTTPS 暴露服务，并妥善备份 SQLite 数据库和 `storage/pdf`。不要提交 `.env`、SQLite 数据库、PDF、备份或日志。

## 旧数据迁移

在 `.env` 中配置 `LEGACY_MYSQL_*`。先运行预检：

```bash
npm run migrate:legacy
```

确认数量后，设置至少 12 位的 `MIGRATION_DEFAULT_PASSWORD` 并正式导入：

```bash
npm run migrate:legacy -- --apply
```

迁移完成后应立即为导入账号重置独立密码。

## 开发检查

```bash
npm run typecheck
npm test
npm run build
```

## 安全

请勿在公开 Issue 中披露漏洞细节。报告方式见 [SECURITY.md](SECURITY.md)。示例数据均为虚构内容，不包含原部署单位的账号、密码、数据库或服务器配置。

## 许可证

本项目采用 [MIT License](LICENSE)。
