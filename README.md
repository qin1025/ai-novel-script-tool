# AI 小说转剧本工具

面向题目三“AI 小说转剧本工具”的本地静态实现。作者可以粘贴或导入三章以上小说文本，工具会自动拆分章节、场景、角色、动作和对白，并输出可编辑的 YAML 剧本初稿。

## 功能

- 识别中文章节标题，例如 `第一章 雨夜`。
- 从小说正文中抽取动作 beat 和对白 beat。
- 汇总说话人，生成全局角色表。
- 输出符合文档约定的 YAML 结构。
- 对少于三章的文本给出校验提示。
- 支持复制、下载 YAML 和下载 Schema 文档。
- 提供结构图，快速查看章节、场景和 beat 分布。

## 使用

推荐双击 `start-tool.bat` 使用。它会启动本地 HTTP 服务并打开工具页面。

```text
D:\ai-novel-script-tool\start-tool.bat
```

如果直接双击 `index.html` 后无法转换，通常是浏览器拦截了本地 `type="module"` 脚本。请改用 `start-tool.bat` 或手动启动本地静态服务。

## YAML Schema

Schema 说明和设计原因见：

```text
docs/YAML_SCHEMA.md
```

核心顶层字段：

- `schema_version`
- `title`
- `source`
- `metadata`
- `characters`
- `chapters`

## 测试

如果本机 Node.js 可用，可以运行：

```bash
npm test
```

当前 Codex 桌面环境中系统 `node.exe` 被限制，已通过内置 Node REPL 执行同一测试文件验证通过。

## 文件结构

```text
index.html
styles.css
src/
  app.js
  converter.js
tests/
  converter.test.mjs
docs/
  YAML_SCHEMA.md
  superpowers/specs/2026-06-05-ai-novel-script-tool-design.md
```
