# 数据来源、复现与素材接入

应用默认使用 `public/data/exercises.json`，无需上级目录。数据来自 `hasaneyldrm/exercises-dataset` 的固定提交 `7455efae41b330c265e7cd4b78dfa848e7ce5ebd`。完整版权信息见根目录 `THIRD_PARTY_NOTICES.md` 和 `licenses/`。

## 复现文字数据包

从上游的对应版本取得 `data/exercises.json` 后执行：

```bash
node scripts/prepare-data.mjs /path/to/upstream/data/exercises.json
```

脚本验证源文件 SHA-256，只保留原始中英文说明、步骤和应用所用元数据，不下载媒体。ID 是稳定字符串，不要用数组下标替代。更新源版本时须先核对许可、数据差异和核心动作约束，再更新固定校验值并运行测试。

保留的 `image`、`gif_url`、`media_id`、`attribution` 只是元数据；不意味着文件存在或已授权。应用的中文名称和核心动作产品标签位于 `src/data/`，不是专业认证。

## 为什么默认没有图片

上游 MIT 明确不覆盖 Gym visual 媒体，源仓库获准收录不等于下游也获准再分发。此仓库只分发可依 MIT 使用的文字/元数据，不分发该媒体；默认不会请求图片或 GIF。

## 已授权素材

1. 确认授权适用你的项目、部署和使用方式；公开源码再分发往往需要单独许可。
2. 将合法取得的媒体放在 `public/images/` 和 `public/videos/`，文件名对应数据中的相对路径。
3. 在未跟踪的 `.env.local` 中设置 `VITE_ENABLE_EXERCISE_MEDIA=true`，重启开发服务或重新构建。
4. 保留素材要求的署名，核对最终产物；即使目录被 Git 忽略，Vite 仍会将 `public` 中素材复制到构建目录。

应用只允许同站点的受限相对媒体路径；缺失文件显示文字教学。不要把外部任意 URL、密钥或用户资料写入数据包。不要使用自动下载脚本绕过素材授权。
