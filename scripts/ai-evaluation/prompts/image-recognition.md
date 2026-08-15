# Image Recognition Prompt（评测）

## 默认（baseline）

未配置 `promptFile` 时：从 `src/wardrobe/app.ts` 的 `AI_PROMPT` **只读抽取**，与线上一致。

## 实验：purchaseDate（本轮）

文件：`image-recognition.purchaseDate-exp.txt`

相对生产 prompt，仅强化 **订单购买日期** 规则（见该文件第 9 条），不改 category / color / price / season 等其它字段逻辑。

配置见 `config.example.json` 的 `promptFile`。设为空或删除该字段即回到 app.ts baseline。
