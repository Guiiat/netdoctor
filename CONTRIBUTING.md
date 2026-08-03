# Contributing to NetDoctor / 参与贡献

Thanks for improving NetDoctor. Small, focused changes with tests are easiest to review.

感谢你帮助改进 NetDoctor。范围清晰、带测试的小提交最容易被审查和合并。

## Development setup / 开发环境

Requirements: Node.js 22+ and npm.

```bash
git clone https://github.com/Guiiat/netdoctor.git
cd netdoctor
npm install
npm run check
npm test
```

依赖要求：Node.js 22+ 与 npm。请勿在运行时依赖中随意加入大型网络库；如果标准库无法满足需求，
请在 Issue 中先说明体积、安全性和跨平台权衡。

## Before opening a pull request / 提交 PR 前

1. Open or reference an issue for behavior changes.
2. Keep each pull request focused on one problem.
3. Add or update tests. Tests must not depend on public internet services.
4. Run `npm run check && npm test` on your platform.
5. Update both READMEs when changing user-visible behavior.
6. Never add real credentials, internal hostnames, or unsanitized diagnostic fixtures.

1. 行为变化建议先创建或关联 Issue。
2. 每个 PR 只解决一个明确问题。
3. 添加或更新测试，测试不得依赖公网服务。
4. 在本机运行 `npm run check && npm test`。
5. 用户可见行为变化需同步更新中英文 README。
6. 不得提交真实凭据、内部域名或未脱敏的诊断样例。

## Design rules / 设计约束

- A failed network operation is a diagnostic result, not a process crash.
- Structured stdout must stay clean: `--json` emits one JSON document and no ANSI codes.
- Every newly exposed string must pass through the redaction boundary.
- Checks should honor the configured timeout and close sockets/timers.
- Windows, macOS, and Linux are first-class platforms.
- JSON schema changes must remain additive or increment `schemaVersion`.

## Reporting bugs / 报告问题

Include the command (with secrets removed), operating system, Node.js version, expected behavior,
and a `--json` or `--markdown` report after reviewing it for internal hostnames. Security issues must
follow [SECURITY.md](./SECURITY.md), not a public issue.

请提供已脱敏的命令、系统、Node.js 版本、预期行为和检查过的结构化报告。安全问题请按
[SECURITY.md](./SECURITY.md) 私下报告，不要创建公开 Issue。
