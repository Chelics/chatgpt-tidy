# 开发指南

## 准备环境

使用 Node.js 22.12 或更高版本及 npm。自动测试工作流使用 Node.js 24。打包命令还需要系统提供 `zip` 和 `unzip`，可在 macOS 或 Linux 中执行。

```sh
git clone https://github.com/Chelics/chatgpt-tidy.git
cd chatgpt-tidy
npm ci
```

## 目录结构

```text
chatgpt-tidy/
  manifest.json       Chrome Manifest V3 配置
  content.js          导航面板、消息识别与项目管理
  content.css         注入页面的项目隐藏与定位样式
tests/
  extension.test.cjs  jsdom 回归测试
  fixtures/           匿名化页面样本
scripts/
  package.cjs         扩展打包脚本
docs/                开发与隐私文档
CHANGELOG.md         历史变更及验证记录
```

## 运行测试

```sh
npm test
```

测试先检查 `content.js` 语法，再在 jsdom 模拟页面中执行实际扩展脚本，覆盖目录跳转、新消息、切换对话、历史节点卸载、项目隐藏与恢复、存储数据过滤和全文预览。

这些检查不等同于真实浏览器兼容性验证。修改消息识别、滚动或侧栏逻辑后，还需加载扩展，在登录的 ChatGPT 页面检查以下流程：

1. 打开多轮对话，点击第一条和最后一条提问，检查全文预览。
2. 滚动加载较早历史，再跳转到不同位置。
3. 切换对话，并通过浏览器前进和后退切换页面，检查目录是否隔离。
4. 隐藏一个项目，刷新确认仍隐藏，再打开该项目并恢复。
5. 检查深色模式、窄窗口和键盘操作。
6. 拖动导航按钮，刷新检查位置保留，缩小窗口检查面板边界。
7. 创建新对话并发送首问，检查地址变化期间目录不会反复闪回加载提示。

## 打包扩展

```sh
npm run package
```

脚本检查 `package.json` 与 Manifest 的版本一致，然后生成 `dist/chatgpt-tidy-<版本号>.zip`。压缩包仅包含扩展的三个运行文件和仓库许可证，不包含开发依赖、测试或本地设置。

打包后逐文件比较压缩包与源码，并将验证后的压缩包同步到根目录的 `chatgpt-tidy.zip`。

解压后，在 Chrome 扩展管理页加载包内的 `chatgpt-tidy` 文件夹。`dist/` 和 ZIP 文件不提交到源码仓库。

## 提交修改

保留扩展仅在 ChatGPT 页面运行的范围，避免记录或上传对话正文。提交页面样本前，将真实名称、项目 ID、对话链接和账号信息替换为示例值。

修改后运行测试与打包命令，并在提交说明中记录实际完成的浏览器验证。发布新版本时，同时更新 Manifest、`package.json`、锁文件及更新日志。
