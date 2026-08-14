# 版本记录模板

> 复制本文件为 `docs/versions/vX.Y.Z.md`（或 `vX.Y.Z-stable.md`）后填写。  
> 对应 Git tag / commit 请一并记录，便于回滚。

---

## 版本号

- 产品版本：`vX.Y.Z`
- Git tag：（如有）
- Git commit：

## 发布时间

- YYYY-MM-DD

## 本版本目标

- （一句话：本版本要解决什么 / 交付什么）

## 新增功能

- 

## 优化功能

- 

## 修复问题

- 

## 已知问题

- 

## 回滚版本

- 建议回滚到：`vX.Y.Z` / tag `…` / commit `…`
- 回滚命令示例：

```bash
git fetch origin tag <tag-name>
git checkout <tag-name>
# 若需让 main 回到该点（需明确确认后再 push）：
# git checkout main && git reset --hard <tag-name> && git push origin main
```
