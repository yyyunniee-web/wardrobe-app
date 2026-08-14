# 开发与发版流程

本文约定长期迭代时的标准流程。业务实现细节见 `docs/product/`；具体发版内容写入 `docs/versions/`。

---

## Stable 版本

稳定版是可回滚的基线，例如：

- 产品版本：`v1.0.0-stable`
- Git tag：`v1.3.0-stable`
- Commit：`685ad99`

原则：

- 线上验证通过后再打 stable 相关 tag / 写入版本记录
- 重大重构或高风险功能（如打卡 AI 识衣）应基于当前 stable 开分支或至少保证可回滚到该 commit

回滚示例：

```bash
git fetch origin tag v1.3.0-stable
git checkout v1.3.0-stable
# 若需让 main 回到该点（须明确确认后再 push）：
# git checkout main && git reset --hard v1.3.0-stable && git push origin main
```

---

## 新功能开发

推荐流程：

```text
stable
  ↓
开发功能（可基于 main 或 feature 分支）
  ↓
自测 / 真机回归（含 PWA）
  ↓
beta（可选：预发或带 -beta 的 tag / 文档）
  ↓
稳定后发布 stable（更新版本记录 + Git tag + 确认 Vercel）
```

说明：

- **不要**在未记录的临时改动上连续堆多个不相关大功能
- 发版前更新文档，再打 tag，保证「文档 ↔ commit ↔ 线上」可对齐
- 仅文档变更可单独提交；业务变更勿夹带无关重构

---

## 每次版本必须记录

在 `docs/versions/` 新增（或更新）对应文件，建议复制 `VERSION_TEMPLATE.md`，并至少包含：

| 字段 | 说明 |
|------|------|
| 新增功能 | 本版本新能力 |
| 优化内容 | 体验 / 性能 / 文案等改进 |
| Bug 修复 | 已修问题 |
| 已知问题 | 未修或可接受的限制 |
| Git commit | 完整或短 hash |
| Git tag | 如 `v1.x.x-stable` / `-beta` |

可选同步：

- 里程碑能力总览 → `docs/product/`
- 下一阶段规划 → `docs/roadmap/`

---

## 发版检查清单

1. 工作区干净，目标分支已推送  
2. 填写 `docs/versions/vX.Y.Z.md`  
3. `git tag` 并 `git push origin <tag>`  
4. 确认 Vercel Production 部署成功  
5. 手机 PWA 强刷或重装主屏幕图标后冒烟测试  

---

## 目录职责速查

| 路径 | 职责 |
|------|------|
| `docs/product/` | 产品能力说明、大版本快照 |
| `docs/versions/` | 每次发版记录 |
| `docs/roadmap/` | 未来规划（未排期也可） |
| `notes/` | 临时笔记，结论成熟后迁入 docs |
| `scripts/` | 开发辅助脚本，非运行时依赖 |
