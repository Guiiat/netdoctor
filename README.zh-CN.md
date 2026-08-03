# NetDoctor 网络体检工具

**一眼看清网络请求究竟卡在哪一层。** NetDoctor 是一个跨 Windows、macOS、Linux 的命令行工具，
会并发检查 DNS、TCP、TLS、HTTP/重定向和代理环境，并给出可执行的排查建议。运行时零第三方依赖。

[English](./README.md) · [参与贡献](./CONTRIBUTING.md) · [安全策略](./SECURITY.md)

> 当前版本：`0.1.0`，属于早期但可用版本。网络故障会成为诊断结果，不会让程序异常崩溃；
> JSON 报告带有版本化 Schema，适合接入脚本和 CI。

## 它解决什么问题？

“GitHub/npm/pip 连不上”背后可能是 DNS 配错、端口被拦、证书过期、代理变量冲突，
也可能只是服务端要求登录。NetDoctor 把这些层拆开同时检测，告诉你故障发生在哪里、下一步查什么。

- 并发执行系统 DNS、A/AAAA DNS、TCP、TLS、HTTP 和代理端点检查
- 检查 TLS 信任、域名匹配、协议/加密套件和证书剩余天数
- 跟踪 HTTP 状态码和完整重定向链
- 内置 `github`、`npm`、`pypi`、`docker` 预设
- 支持自定义 URL、`主机:端口` 和 IPv6
- 支持彩色终端摘要、纯 JSON 和可分享的 Markdown
- 自动隐藏 URL/代理账号密码、Token 类查询参数、Authorization/Cookie 形态文本和用户主目录
- 明确的退出码，支持适合 CI 的 `--strict`
- 运行时仅使用 Node.js 标准库

## 快速开始

需要 Node.js 22 或更高版本。

```bash
git clone https://github.com/Guiiat/netdoctor.git
cd netdoctor
npm install
npm run build
npm link

netdoctor github
```

未来发布到 npm 后，也可以使用 `npx netdoctor-cli github` 或全局安装。

## 常用命令

```bash
# 同时检查 GitHub 和 npm
netdoctor github npm

# 检查全部内置预设；不传目标时也会执行全部预设
netdoctor all

# 检查自定义 API，输出可供程序解析的 JSON
netdoctor --url https://api.example.com/health --json > diagnosis.json

# 检查 MQTT TLS 服务的 DNS/TCP/TLS
netdoctor --host broker.example.com:8883 --timeout 8000

# 生成可粘贴到 GitHub Issue 的报告
netdoctor pypi --markdown > netdoctor-report.md

# 在 CI 中把 warning 也视为失败
netdoctor npm --strict --json
```

主要参数：

| 参数 | 作用 |
| --- | --- |
| `-p, --preset <名称>` | 添加预设；可以重复或用逗号分隔 |
| `-u, --url <URL>` | 添加 HTTP(S) URL |
| `-H, --host <主机[:端口]>` | 添加主机，默认端口 443 |
| `-t, --timeout <毫秒>` | 单项检查超时，250–60,000，默认 5,000 |
| `--max-redirects <数量>` | 最多跟随 0–20 次重定向，默认 5 |
| `--json` | stdout 只输出一个 JSON 文档 |
| `--markdown`, `--md` | 输出可分享的 Markdown 报告 |
| `--strict` | warning 也返回失败退出码 |
| `--no-color` | 禁用 ANSI 颜色 |
| `--list-presets` | 查看内置预设 |

完整参数请运行 `netdoctor --help`。

## 检查原理

每个目标会并发执行适用的检查：

1. **DNS**：`dns.lookup({ all: true })` 走操作系统解析路径，能体现 hosts、VPN、企业内网 DNS；
   同时执行 A/AAAA 查询，帮助发现系统解析与 DNS 记录不一致。
2. **TCP**：尝试连接目标端口，记录耗时和实际远端地址。
3. **TLS**：对 HTTPS 及常见安全端口（`443`、`8443`、`8883`）检查 SNI、证书信任、
   域名匹配、协议/加密套件及剩余有效期。
4. **HTTP**：只读取响应头，不下载正文；记录最终状态码和每一步重定向。
5. **代理环境**：读取 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY`、`NO_PROXY`，
   并验证代理地址能否解析和建立 TCP 连接。

`docker` 等服务的探测入口可能按设计返回 `401` 或 `404`。预设已经声明这些预期状态，
不会把“服务可达但需要鉴权”误判成宕机。

## 退出码

| 退出码 | 含义 |
| ---: | --- |
| `0` | 没有失败项；默认情况下 warning 不阻塞 |
| `1` | 至少一项失败；或使用 `--strict` 时出现 warning |
| `2` | 参数或目标配置错误 |
| `3` | 工具内部异常 |

常规 DNS、Socket、TLS、HTTP、代理失败都会收进报告，而不是抛出内部异常。

## 隐私与脱敏

> [!WARNING]
> **完成脱敏不代表完成匿名化，公开前必须人工检查报告。** 目标域名、IP、证书名称、重定向地址和
> `NO_PROXY` 条目即使不含凭据，也可能暴露企业内网和基础设施信息。

NetDoctor 在渲染报告前会隐藏：

- URL 用户名/密码和代理凭据
- `token`、`api_key`、`password`、`signature` 等敏感查询参数
- Authorization/Cookie 形态的文本
- 错误信息中的显式密码/Token 赋值
- 当前用户主目录路径

工具不会读取 HTTP 请求体或响应体。自动脱敏是纵深防御措施，不能代替发布前的人工审查。

## 当前代理边界

`0.1.x` 会验证代理变量格式、代理主机 DNS 和 TCP 可达性；目标 DNS/TCP/TLS/HTTP 探测仍是直连，
不会通过代理隧道。报告中会明确写出这一点，避免把“代理端点可达”误解为“请求经过了代理”。
后续版本可扩展 HTTP CONNECT 和 SOCKS 实际传输探测。

## 开发与测试

```bash
npm install
npm run check
npm test
npm run build
```

测试使用 Node.js 自带测试框架和本地临时端口，不依赖公网。提交代码前请阅读
[CONTRIBUTING.md](./CONTRIBUTING.md)。

## 开源协议

[MIT](./LICENSE)
