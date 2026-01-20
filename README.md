# StreamNote - 实时转录原型

这是 StreamNote 项目的最小可用原型（MVP），用于验证核心功能：实时语音转文字。

## 功能特性

### 当前版本（v0.1 - 最小原型）
- ✅ 实时语音识别（Web Speech API）
- ✅ 连续转录（自动重启）
- ✅ 时间戳显示
- ✅ 词数统计
- ✅ 会话计时
- ✅ 临时结果显示（灰色斜体）
- ✅ 自动滚动

### 即将实现
- ⏳ 关键术语识别
- ⏳ 术语高亮
- ⏳ 界面优化（行数控制、信息密度）

## 快速开始

### 1. 直接打开
```bash
# 在浏览器中打开 index.html
open index.html  # macOS
# 或者直接双击文件
```

### 2. 使用本地服务器（推荐）
```bash
# Python 3
python3 -m http.server 8000

# Node.js
npx serve

# 然后访问 http://localhost:8000
```

### 3. 使用方式
1. 点击"开始转录"按钮
2. 允许浏览器访问麦克风
3. 开始说话，实时转录会自动显示
4. 点击"停止转录"结束会话

## 浏览器支持

| 浏览器 | 支持情况 | 说明 |
|--------|----------|------|
| Chrome | ✅ 完全支持 | 推荐使用 |
| Edge | ✅ 完全支持 | 基于 Chromium |
| Safari | ⚠️ 部分支持 | 需要 iOS 14.5+ / macOS 11+ |
| Firefox | ❌ 不支持 | 暂无 Web Speech API |

**推荐：** Chrome 或 Edge（最新版本）

## 技术实现

### Web Speech API
```javascript
const recognition = new webkitSpeechRecognition();
recognition.continuous = true;        // 持续识别
recognition.interimResults = true;    // 显示临时结果
recognition.lang = 'zh-CN';           // 中文识别
```

### 核心流程
1. **音频捕获** - 浏览器原生麦克风 API
2. **语音识别** - Web Speech API（Google 后端）
3. **结果处理** - 区分最终/临时结果
4. **界面更新** - DOM 操作 + 自动滚动

### 性能指标
- **转录延迟：** ~500-1000ms（取决于网络）
- **连续性：** 自动重启机制保持连续
- **错误处理：** 完整的错误捕获和提示

## 文件结构

```
streamnote/
├── index.html      # 主页面
├── app.js          # JavaScript 逻辑
├── styles.css      # 样式
└── README.md       # 本文档
```

## 已知问题

1. **网络依赖** - Web Speech API 需要联网（Google 服务）
2. **隐私考虑** - 音频数据发送到 Google 服务器
3. **语言切换** - 需要手动修改 `lang` 参数（app.js 第 26 行）
4. **Safari 兼容性** - 部分功能可能不稳定

## 下一步计划

### Phase 1.1 - 界面优化（本周）
- [ ] 限制可见行数（10-12行）
- [ ] 文本滚动优化
- [ ] 响应式设计改进
- [ ] 视觉稳定性提升

### Phase 1.2 - 术语识别（下周）
- [ ] TF-IDF 算法实现
- [ ] 术语字典集成
- [ ] 高亮逻辑开发
- [ ] 高亮比例控制

### Phase 1.3 - 系统集成（第三周）
- [ ] 端到端性能测试
- [ ] 延迟优化
- [ ] 错误处理完善
- [ ] 用户测试准备

## 开发笔记

### 2026-01-20
- ✅ 创建最小原型
- ✅ Web Speech API 集成
- ✅ 基础 UI 实现
- ✅ 实时转录功能验证

### 测试记录
- **中文识别：** 准确率较高，适合课堂场景
- **英文识别：** 需要切换 lang 参数
- **延迟：** 符合预期（<1秒）
- **连续性：** 自动重启机制有效

## Git 初始化

```bash
cd streamnote
git init
git add .
git commit -m "feat: initial commit - minimal viable prototype"
```

## 许可证

本项目为学术项目，仅用于学习和研究目的。

---

**版本：** v0.1  
**最后更新：** 2026-01-20  
**作者：** 冯锦炜
