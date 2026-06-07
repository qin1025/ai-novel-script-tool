# AI 小说转剧本工具

面向题目三“AI 小说转剧本工具”的本地静态实现。作者可以粘贴或导入三章以上小说文本，工具会自动拆分章节、场景、角色、动作和对白，并输出可编辑的 YAML 剧本初稿。

## 功能

- 识别中文章节标题，例如 `第一章 雨夜`。
- 自动识别 UTF-8 与 GBK/GB18030 TXT，避免中文网文导入乱码。
- 大体量 TXT 导入后只在输入框和输出框显示预览，生成和下载仍使用完整全文，避免浏览器卡顿。
- 支持 OpenAI-compatible API 增强模式，用模型识别人名、角色身份、场景、对白归属。
- API 转换按章节显示真实进度、当前章节和完成百分比。
- 转换过程中可以取消任务；当前请求会立即停止等待，后续章节不再发送。
- 取消后保留已经完成的章节，可继续预览、校验并下载部分 YAML。
- 使用可展开的章节摘要卡片汇总每章摘要、场景、角色和 Beat。
- 提供柔和鼠标跟随光晕与卡片轻微倾斜效果，触屏和减少动态效果模式自动禁用。
- 从小说正文中抽取动作 beat 和对白 beat。
- 汇总说话人，生成全局角色表。
- 输出符合文档约定的 YAML 结构。
- 对少于三章的文本给出校验提示。
- 支持复制、下载 YAML 和下载 Schema 文档。
- 提供可展开章节摘要，快速查看每章摘要、场景、角色和 Beat 分布。

## 使用

推荐双击 `start-tool.bat` 使用。它会启动本地 HTTP 服务并打开工具页面。

```text
D:\ai-novel-script-tool\start-tool.bat
```

如果直接双击 `index.html` 后无法转换，通常是浏览器拦截了本地 `type="module"` 脚本，或缓存了旧版脚本。请改用 `start-tool.bat` 或手动启动本地静态服务。

长篇小说导入后，工具只会先读取文本并显示预览。点击“生成 YAML”后才会转换剧本；右侧 YAML 框可能只显示预览。点击“下载”得到的是完整 YAML 文件。

## API 增强模式

API 参数不在使用界面填写。项目必须具备可用 API 配置，不再降级为规则式本地转换。先编辑项目根目录的 `api-config.json`，再打开工具页面：

```json
{
  "baseUrl": "https://api.xiaomimimo.com/v1",
  "apiKey": "",
  "model": "mimo-v2.5-pro",
  "authHeader": "api-key",
  "maxChapters": 3,
  "requestBody": {
    "stream": false,
    "max_completion_tokens": 8192,
    "thinking": { "type": "disabled" },
    "response_format": { "type": "json_object" }
  }
}
```

点击“生成 YAML”后，工具会按检测到的章节调用 `/chat/completions`，要求模型返回 JSON，再由本地转换成 YAML。未设置 `maxChapters` 时默认转换全部章节；设置后只转换前 N 章。页面只显示当前使用“用户 API”还是“内置默认 API”、模型名、鉴权方式和章节上限，不显示 API Key。

### 默认 API 与用户 API

- `api-config.json` 中存在非空 `apiKey` 时，优先使用用户自己的 API。
- `apiKey` 为空时，自动解码并使用 `api-secret.enc` 中的内置默认 API。
- 两者都不可用或 Base URL、模型配置不完整时，页面会阻止生成并显示配置错误。
- 解码后的 API Key 只保存在 `server.py` 运行内存中，不会生成明文文件。

`api-secret.enc` 使用无第三方依赖的轻量混淆，目的是避免默认 API Key 直接以明文显示、被文本搜索或意外提交。由于解码逻辑随程序一起发布，它不能阻止有能力分析程序的用户恢复密钥。

更换内置默认 API 时运行：

```bash
python tools/generate_api_secret.py
```

脚本会要求输入新的默认 API Key，并覆盖项目根目录的 `api-secret.enc`。

生成期间，页面会显示当前处理章节和实际完成比例。点击“取消任务”会停止当前浏览器请求并阻止后续章节继续处理；已经完整生成的章节会被组装为部分 YAML，并在元数据中记录 `conversion_status: "cancelled"`、已完成章节数和计划章节数。当前上游请求可能仍会在本地代理或模型服务端执行到返回。

`start-tool.bat` 会启动 `server.py`。API Key 只由本机服务读取，浏览器端不会保存或发送密钥配置；请求会先发到本机 `/api/chat/completions`，再由本机转发到外部模型接口。这样可以避免很多第三方接口的浏览器跨域限制。

如需控制 API 消耗，可以设置 `maxChapters`。例如 `3` 表示只转换前 3 个检测到的章节；缺省、`0` 或非法值表示不限制。

### MiMo 2.5

当前 `api-config.json` 已按 MiMo 2.5 模板创建，并默认使用 `api-secret.enc` 中的内置 API：

```text
Base URL: https://api.xiaomimimo.com/v1
Model: mimo-v2.5-pro
鉴权: api-key
```

如需覆盖内置 API，只需要在 `api-config.json` 中填入自己的 API Key。工具会调用 `/chat/completions`，并按配置文件附带：

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
api-config.example.json
api-config.json
api-secret.enc
api_secret.py
tools/
  generate_api_secret.py
docs/
  YAML_SCHEMA.md
  superpowers/specs/2026-06-05-ai-novel-script-tool-design.md
```
