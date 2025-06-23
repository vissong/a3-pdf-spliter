const express = require('express');
const path = require('path');

const app = express();
const port = 3000;

// 静态文件服务
app.use(express.static('.'));

// 默认路由到 index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 启动服务器
app.listen(port, () => {
    console.log(`PDF 预览系统运行在 http://localhost:${port}`);
    console.log('纯前端实现，无需服务器端处理');
});
