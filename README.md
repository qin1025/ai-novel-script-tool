# AI 小说转剧本工具

面向题目三“AI 小说转剧本工具”的本地静态实现。作者可以粘贴或导入三章以上小说文本，工具会自动拆分章节、场景、角色、动作和对白，并输出可编辑的 YAML 剧本初稿。

## 功能

- 识别中文章节标题，例如 `第一章 雨夜`。
- 自动识别 UTF-8 与 GBK/GB18030 TXT，避免中文网文导入乱码。
- 大体量 TXT 导入后只在输入框和输出框显示预览，生成和下载仍使用完整全文，避免浏览器卡顿。
- 支持 OpenAI-compatible API 增强模式，用模型识别人名、角色身份、场景、对白归属。
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

如果直接双击 `index.html` 后无法转换，通常是浏览器拦截了本地 `type="module"` 脚本，或缓存了旧版脚本。请改用 `start-tool.bat` 或手动启动本地静态服务。

长篇小说导入后，工具只会先读取文本并显示预览。点击“生成 YAML”后才会转换剧本；右侧 YAML 框可能只显示预览。点击“下载”得到的是完整 YAML 文件。

## API 增强模式

勾选“API 增强”后填写：

```text
Base URL: 你的 OpenAI-compatible 接口地址，例如 https://api.example.com/v1
API Key: 你的密钥
Model: 你的模型名
章节数: 本次交给 API 处理的章节数量
```

点击“生成 YAML”后，工具会按章节调用 `/chat/completions`，要求模型返回 JSON，再由本地转换成 YAML。API Key 只在当前页面内使用，不写入 README 或 YAML；Base URL、Model、章节数会保存在浏览器本地设置里。

`start-tool.bat` 会启动 `server.py`，API 请求会先发到本机 `/api/chat/completions`，再由本机转发到外部模型接口。这样可以避免很多第三方接口的浏览器跨域限制。

### MiMo 2.5

小米 MiMo 2.5 可以直接点“MiMo 2.5”预设，工具会自动填入：

```text
服务: MiMo 2.5
Base URL: https://api.xiaomimimo.com/v1
Model: mimo-v2.5-pro
鉴权: api-key
```

你只需要填写自己的 API Key，然后设置本次处理章节数。工具会调用 `/chat/completions`，并按 MiMo 文档附带：

```json
{
  "stream": false,
  "max_completion_tokens": 8192,
  "thinking": { "type": "disabled" },
  "response_format": { "type": "json_object" }
}
```

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

API 模式会额外在 `metadata` 中写入：

- `api_model`
- `api_processed_chapter_count`

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
