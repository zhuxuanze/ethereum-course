#!/bin/zsh
set -eu
cd -- "${0:A:h}"
if [[ ! -f dist/index.html ]]; then
  print '缺少 dist/。请先运行 npm ci --ignore-scripts 和 npm run build。'
  read '?按回车退出。'
  exit 1
fi
print 'Community Treasury：浏览器本地测试链，使用模拟 ETH。'
print '打开 http://127.0.0.1:8874 后点击 Launch sandbox。按 Ctrl+C 停止服务。'
(sleep 2; open 'http://127.0.0.1:8874') &
if command -v node >/dev/null 2>&1; then
  exec node scripts/serve.mjs
elif command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server 8874 --bind 127.0.0.1 --directory dist
else
  print '请安装 Node.js 20 或以上版本，或使用已发布的私有网页。'
  read '?按回车退出。'
  exit 1
fi
