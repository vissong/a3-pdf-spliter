// PDF 预览系统 JavaScript

// 全局变量
let pdfDoc = null;
let currentPage = 1;
let totalPages = 0;
let scale = 1.0;
let currentFile = null;

// 分割线检测相关变量
let lineDetectionEnabled = false;
let detectedLines = [];
let detectionSensitivity = 0.3; // 检测敏感度 (0.1 - 1.0)，默认50%
let isDragging = false;
let dragLineIndex = -1;
let dragStartX = 0;

// 用于优化拖动性能的变量
let pdfImageData = null; // 保存PDF页面的图像数据

// PDF拆分相关变量
let splitPdfData = null;
let splitInProgress = false;

// 清晰度设置
let qualityMode = 'high'; // 'standard', 'high', 'ultra'
const qualitySettings = {
    standard: { scale: 2.0, name: '标准', icon: 'fas fa-video' },
    high: { scale: 4.0, name: '高清', icon: 'fas fa-hd-video' },
    ultra: { scale: 6.0, name: '超清', icon: 'fas fa-gem' }
};

// DOM 元素
const fileInput = document.getElementById('fileInput');
const uploadArea = document.getElementById('uploadArea');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const removeFile = document.getElementById('removeFile');
const previewSection = document.getElementById('previewSection');
const pdfCanvas = document.getElementById('pdfCanvas');
const ctx = pdfCanvas.getContext('2d');

// 控制按钮
const zoomIn = document.getElementById('zoomIn');
const zoomOut = document.getElementById('zoomOut');
const zoomLevel = document.getElementById('zoomLevel');
const prevPage = document.getElementById('prevPage');
const nextPage = document.getElementById('nextPage');
const currentPageSpan = document.getElementById('currentPage');
const totalPagesSpan = document.getElementById('totalPages');
const detectLinesBtn = document.getElementById('detectLinesBtn');
const splitPdfBtn = document.getElementById('splitPdfBtn');
const qualityBtn = document.getElementById('qualityBtn');

// 设置 PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// 初始化事件监听器
function initEventListeners() {
    // 文件输入事件
    fileInput.addEventListener('change', handleFileSelect);
    
    // 拖拽事件
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);
    
    // 移除文件按钮
    removeFile.addEventListener('click', handleRemoveFile);
    
    // 缩放控制
    zoomIn.addEventListener('click', () => changeZoom(0.1));
    zoomOut.addEventListener('click', () => changeZoom(-0.1));
    
    // 页面控制
    prevPage.addEventListener('click', () => changePage(-1));
    nextPage.addEventListener('click', () => changePage(1));

    // 分割线检测按钮
    detectLinesBtn.addEventListener('click', toggleLineDetection);

    // PDF拆分按钮
    splitPdfBtn.addEventListener('click', splitPdfByLines);

    // Canvas鼠标事件（用于拖动调整分割线）
    pdfCanvas.addEventListener('mousedown', handleCanvasMouseDown);
    pdfCanvas.addEventListener('mousemove', handleCanvasMouseMove);
    pdfCanvas.addEventListener('mouseup', handleCanvasMouseUp);
    pdfCanvas.addEventListener('mouseleave', handleCanvasMouseUp);



    // 清晰度切换按钮
    qualityBtn.addEventListener('click', toggleQualityMode);
}

// 处理文件选择
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file && file.type === 'application/pdf') {
        processFile(file);
    } else {
        alert('请选择有效的 PDF 文件！');
    }
}

// 处理拖拽悬停
function handleDragOver(event) {
    event.preventDefault();
    uploadArea.classList.add('dragover');
}

// 处理拖拽离开
function handleDragLeave(event) {
    event.preventDefault();
    uploadArea.classList.remove('dragover');
}

// 处理文件拖拽
function handleDrop(event) {
    event.preventDefault();
    uploadArea.classList.remove('dragover');
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        if (file.type === 'application/pdf') {
            processFile(file);
        } else {
            alert('请选择有效的 PDF 文件！');
        }
    }
}

// 处理文件
function processFile(file) {
    currentFile = file;
    
    // 显示文件信息
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    fileInfo.style.display = 'block';
    
    // 加载 PDF
    loadPDF(file);
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 加载 PDF
async function loadPDF(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        pdfDoc = await pdfjsLib.getDocument(arrayBuffer).promise;
        totalPages = pdfDoc.numPages;
        currentPage = 1;
        
        // 更新页面信息
        totalPagesSpan.textContent = totalPages;
        currentPageSpan.textContent = currentPage;
        
        // 显示预览区域
        previewSection.style.display = 'block';
        
        // 渲染第一页
        renderPage(currentPage);

        // 更新控制按钮状态
        updateControls();

        // 自动开始分割线检测
        setTimeout(() => {
            autoDetectLines();
        }, 500);
        
    } catch (error) {
        console.error('加载 PDF 失败:', error);
        alert('加载 PDF 文件失败，请确保文件完整且未损坏。');
    }
}

// 渲染页面
async function renderPage(pageNum) {
    try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: scale });
        
        // 设置 canvas 尺寸
        pdfCanvas.height = viewport.height;
        pdfCanvas.width = viewport.width;
        
        // 渲染页面
        const renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };
        
        await page.render(renderContext).promise;

        // 保存PDF页面的图像数据，用于拖动时的优化
        pdfImageData = ctx.getImageData(0, 0, pdfCanvas.width, pdfCanvas.height);

        // 如果启用了分割线检测，重新绘制检测结果
        if (lineDetectionEnabled && detectedLines.length > 0) {
            drawDetectedLines();
        }

    } catch (error) {
        console.error('渲染页面失败:', error);
        alert('渲染页面失败！');
    }
}

// 改变缩放
function changeZoom(delta) {
    const newScale = scale + delta;
    if (newScale >= 0.5 && newScale <= 3.0) {
        scale = newScale;
        zoomLevel.textContent = Math.round(scale * 100) + '%';
        renderPage(currentPage);

        // 如果启用了分割线检测，重新检测
        if (lineDetectionEnabled) {
            setTimeout(() => {
                detectVerticalLines();
                updateDetectionInfo();
            }, 100); // 等待页面渲染完成
        }
    }
}

// 改变页面
function changePage(delta) {
    const newPage = currentPage + delta;
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        currentPageSpan.textContent = currentPage;
        renderPage(currentPage);
        updateControls();

        // 如果启用了分割线检测，重新检测当前页面
        if (lineDetectionEnabled) {
            setTimeout(() => {
                detectVerticalLines();
                updateDetectionInfo();
            }, 100); // 等待页面渲染完成
        }
    }
}

// 更新控制按钮状态
function updateControls() {
    prevPage.disabled = currentPage <= 1;
    nextPage.disabled = currentPage >= totalPages;
    zoomOut.disabled = scale <= 0.5;
    zoomIn.disabled = scale >= 3.0;
}

// 移除文件
function handleRemoveFile() {
    currentFile = null;
    pdfDoc = null;
    fileInput.value = '';
    fileInfo.style.display = 'none';
    previewSection.style.display = 'none';

    // 清空 canvas
    ctx.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);

    // 重置变量
    currentPage = 1;
    totalPages = 0;
    scale = 1.0;
    zoomLevel.textContent = '100%';

    // 清理图像数据
    pdfImageData = null;

    // 清理拆分相关数据
    splitPdfData = null;
    splitInProgress = false;
    splitPdfBtn.style.display = 'none';

    // 隐藏拆分相关面板
    const splitProgress = document.getElementById('splitProgress');
    const splitResult = document.getElementById('splitResult');

    if (splitProgress) {
        splitProgress.remove();
    }

    if (splitResult) {
        splitResult.remove();
    }
}



// 切换分割线检测功能
function toggleLineDetection() {
    lineDetectionEnabled = !lineDetectionEnabled;

    if (lineDetectionEnabled) {
        detectLinesBtn.textContent = '关闭检测';
        detectLinesBtn.classList.add('line-detection-active');
        detectLinesBtn.innerHTML = '<i class="fas fa-eye-slash"></i> 关闭检测';

        // 执行分割线检测
        detectVerticalLines();

        // 显示检测信息
        showDetectionInfo();

        // 如果检测到分割线，显示拆分按钮
        if (detectedLines.length > 0) {
            splitPdfBtn.style.display = 'inline-flex';
        }
    } else {
        detectLinesBtn.textContent = '检测分割线';
        detectLinesBtn.classList.remove('line-detection-active');
        detectLinesBtn.innerHTML = '<i class="fas fa-search"></i> 检测分割线';

        // 清除检测结果
        detectedLines = [];

        // 重新渲染页面（清除红线）
        renderPage(currentPage);

        // 隐藏检测信息
        hideDetectionInfo();

        // 隐藏拆分按钮
        splitPdfBtn.style.display = 'none';
    }
}

// 检测垂直线条
function detectVerticalLines() {
    if (!pdfCanvas || !ctx) return;

    // 获取canvas图像数据
    const imageData = ctx.getImageData(0, 0, pdfCanvas.width, pdfCanvas.height);
    const data = imageData.data;
    const width = pdfCanvas.width;
    const height = pdfCanvas.height;

    detectedLines = [];

    // 垂直线检测算法
    const minLineLength = Math.floor(height * 0.3); // 最小线长度为页面高度的30%
    const threshold = Math.floor(255 * (1 - detectionSensitivity)); // 像素阈值

    // 遍历每一列
    for (let x = 0; x < width; x += 2) { // 每隔2像素检测一次，提高性能
        let lineSegments = [];
        let currentSegmentStart = -1;
        let currentSegmentLength = 0;

        // 遍历当前列的每一行
        for (let y = 0; y < height; y++) {
            const pixelIndex = (y * width + x) * 4;
            const r = data[pixelIndex];
            const g = data[pixelIndex + 1];
            const b = data[pixelIndex + 2];

            // 计算灰度值
            const gray = (r + g + b) / 3;

            // 检测是否为线条（暗色像素）
            if (gray < threshold) {
                if (currentSegmentStart === -1) {
                    currentSegmentStart = y;
                    currentSegmentLength = 1;
                } else {
                    currentSegmentLength++;
                }
            } else {
                // 如果当前段足够长，记录为线段
                if (currentSegmentStart !== -1 && currentSegmentLength >= minLineLength) {
                    lineSegments.push({
                        start: currentSegmentStart,
                        end: currentSegmentStart + currentSegmentLength,
                        length: currentSegmentLength
                    });
                }
                currentSegmentStart = -1;
                currentSegmentLength = 0;
            }
        }

        // 检查最后一个线段
        if (currentSegmentStart !== -1 && currentSegmentLength >= minLineLength) {
            lineSegments.push({
                start: currentSegmentStart,
                end: currentSegmentStart + currentSegmentLength,
                length: currentSegmentLength
            });
        }

        // 如果找到足够长的线段，记录为垂直线
        if (lineSegments.length > 0) {
            const totalLength = lineSegments.reduce((sum, segment) => sum + segment.length, 0);
            if (totalLength >= minLineLength) {
                detectedLines.push({
                    x: x,
                    segments: lineSegments,
                    totalLength: totalLength,
                    confidence: Math.min(totalLength / height, 1.0)
                });
            }
        }
    }

    // 过滤和合并相近的线条
    detectedLines = filterAndMergeLines(detectedLines);

    // 绘制检测到的红线
    drawDetectedLines();

    console.log(`检测到 ${detectedLines.length} 条垂直线`);
}

// 过滤和合并相近的线条
function filterAndMergeLines(lines) {
    if (lines.length === 0) return lines;

    // 按x坐标排序
    lines.sort((a, b) => a.x - b.x);

    const mergedLines = [];
    const mergeDistance = 5; // 5像素内的线条将被合并

    let currentGroup = [lines[0]];

    for (let i = 1; i < lines.length; i++) {
        const currentLine = lines[i];
        const lastInGroup = currentGroup[currentGroup.length - 1];

        if (currentLine.x - lastInGroup.x <= mergeDistance) {
            // 合并到当前组
            currentGroup.push(currentLine);
        } else {
            // 处理当前组并开始新组
            if (currentGroup.length > 0) {
                mergedLines.push(mergeLineGroup(currentGroup));
            }
            currentGroup = [currentLine];
        }
    }

    // 处理最后一组
    if (currentGroup.length > 0) {
        mergedLines.push(mergeLineGroup(currentGroup));
    }

    // 只保留置信度较高的线条
    return mergedLines.filter(line => line.confidence > 0.4);
}

// 合并线条组
function mergeLineGroup(group) {
    if (group.length === 1) return group[0];

    // 计算平均x坐标
    const avgX = Math.round(group.reduce((sum, line) => sum + line.x, 0) / group.length);

    // 合并所有线段
    const allSegments = [];
    group.forEach(line => {
        allSegments.push(...line.segments);
    });

    // 计算总长度和置信度
    const totalLength = group.reduce((sum, line) => sum + line.totalLength, 0);
    const avgConfidence = group.reduce((sum, line) => sum + line.confidence, 0) / group.length;

    return {
        x: avgX,
        segments: allSegments,
        totalLength: totalLength,
        confidence: Math.min(avgConfidence * 1.2, 1.0) // 合并后提高置信度
    };
}

// 绘制检测到的红线
function drawDetectedLines() {
    if (!ctx || detectedLines.length === 0) return;

    // 保存当前绘图状态
    ctx.save();

    // 设置红线样式
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;

    // 绘制每条检测到的线
    detectedLines.forEach(line => {
        line.segments.forEach(segment => {
            ctx.beginPath();
            ctx.moveTo(line.x, segment.start);
            ctx.lineTo(line.x, segment.end);
            ctx.stroke();
        });
    });

    // 恢复绘图状态
    ctx.restore();
}

// 只重新绘制分割线，不重新渲染PDF页面（用于拖动优化）
function redrawLinesOnly() {
    if (!ctx || !pdfImageData) return;

    // 恢复原始PDF图像
    ctx.putImageData(pdfImageData, 0, 0);

    // 重新绘制分割线
    if (lineDetectionEnabled && detectedLines.length > 0) {
        drawDetectedLines();
    }
}

// 显示检测信息
function showDetectionInfo() {
    // 检查是否已存在检测信息面板
    let infoPanel = document.getElementById('detectionInfo');
    if (!infoPanel) {
        // 创建检测信息面板
        infoPanel = document.createElement('div');
        infoPanel.id = 'detectionInfo';
        infoPanel.className = 'detection-info';

        // 插入到预览控制区域后面
        const previewHeader = document.querySelector('.preview-header');
        previewHeader.parentNode.insertBefore(infoPanel, previewHeader.nextSibling);
    }

    // 更新检测信息内容
    updateDetectionInfo();
}

// 隐藏检测信息
function hideDetectionInfo() {
    const infoPanel = document.getElementById('detectionInfo');
    if (infoPanel) {
        infoPanel.remove();
    }
}

// 更新检测信息内容
function updateDetectionInfo() {
    const infoPanel = document.getElementById('detectionInfo');
    if (!infoPanel) return;

    const lineCount = detectedLines.length;
    const avgConfidence = lineCount > 0
        ? (detectedLines.reduce((sum, line) => sum + line.confidence, 0) / lineCount * 100).toFixed(1)
        : 0;

    infoPanel.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
            <i class="fas fa-info-circle"></i>
            <strong>分割线检测结果</strong>
        </div>
        <div class="detection-stats">
            检测到 <strong>${lineCount}</strong> 条分割线，平均置信度: <strong>${avgConfidence}%</strong>
        </div>
        <div class="detection-controls">
            <div class="sensitivity-control">
                <label for="sensitivitySlider">检测敏感度:</label>
                <input type="range" id="sensitivitySlider" class="sensitivity-slider"
                       min="0.1" max="1.0" step="0.1" value="${detectionSensitivity}">
                <span id="sensitivityValue">${Math.round(detectionSensitivity * 100)}%</span>
            </div>
            <button class="control-btn" id="redetectBtn" style="font-size: 0.8rem; padding: 5px 10px;">
                <i class="fas fa-redo"></i> 重新检测
            </button>
        </div>
    `;

    // 添加敏感度滑块事件监听器
    const sensitivitySlider = document.getElementById('sensitivitySlider');
    const sensitivityValue = document.getElementById('sensitivityValue');
    const redetectBtn = document.getElementById('redetectBtn');

    if (sensitivitySlider) {
        sensitivitySlider.addEventListener('input', function() {
            detectionSensitivity = parseFloat(this.value);
            sensitivityValue.textContent = Math.round(detectionSensitivity * 100) + '%';
        });
    }

    if (redetectBtn) {
        redetectBtn.addEventListener('click', function() {
            // 重新检测
            detectVerticalLines();
            updateDetectionInfo();
        });
    }
}



// PDF拆分功能
async function splitPdfByLines() {
    if (!pdfDoc || !currentFile || detectedLines.length === 0 || splitInProgress) {
        return;
    }

    try {
        splitInProgress = true;
        splitPdfBtn.disabled = true;
        splitPdfBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 拆分中...';

        // 显示进度条
        showSplitProgress();

        // 选择最佳的分割线
        const splitLine = selectBestSplitLine();
        if (!splitLine) {
            throw new Error('未找到合适的分割线');
        }

        updateProgress(20, '准备拆分...');

        // 使用图像拆分模式
        await splitPdfClientSide(splitLine);

        // 显示拆分结果
        showSplitResult(splitLine);

    } catch (error) {
        console.error('PDF拆分失败:', error);
        alert('PDF拆分失败: ' + error.message);
    } finally {
        splitInProgress = false;
        splitPdfBtn.disabled = false;
        splitPdfBtn.innerHTML = '<i class="fas fa-cut"></i> 拆分PDF';
        hideSplitProgress();
    }
}

// 选择最佳的分割线
function selectBestSplitLine() {
    if (detectedLines.length === 0) return null;

    // 优先选择置信度最高且位置居中的线条
    const centerX = pdfCanvas.width / 2;
    let bestLine = null;
    let bestScore = 0;

    detectedLines.forEach(line => {
        // 计算得分：置信度 + 位置得分（越接近中心得分越高）
        const distanceFromCenter = Math.abs(line.x - centerX);
        const positionScore = 1 - (distanceFromCenter / centerX);
        const totalScore = line.confidence * 0.7 + positionScore * 0.3;

        if (totalScore > bestScore) {
            bestScore = totalScore;
            bestLine = line;
        }
    });

    return bestLine;
}

// 显示拆分进度
function showSplitProgress() {
    let progressPanel = document.getElementById('splitProgress');
    if (!progressPanel) {
        progressPanel = document.createElement('div');
        progressPanel.id = 'splitProgress';
        progressPanel.className = 'split-progress';

        const previewSection = document.getElementById('previewSection');
        previewSection.appendChild(progressPanel);
    }

    progressPanel.innerHTML = `
        <h4><i class="fas fa-cog fa-spin"></i> 正在拆分PDF</h4>
        <div class="progress-bar">
            <div class="progress-fill" id="progressFill"></div>
        </div>
        <div class="progress-text" id="progressText">准备中...</div>
    `;

    progressPanel.style.display = 'block';
}

// 隐藏拆分进度
function hideSplitProgress() {
    const progressPanel = document.getElementById('splitProgress');
    if (progressPanel) {
        progressPanel.style.display = 'none';
    }
}

// 更新进度
function updateProgress(percent, text) {
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');

    if (progressFill) {
        progressFill.style.width = percent + '%';
    }

    if (progressText) {
        progressText.textContent = text;
    }
}

// 显示拆分结果
function showSplitResult(splitLine) {
    let resultPanel = document.getElementById('splitResult');
    if (!resultPanel) {
        resultPanel = document.createElement('div');
        resultPanel.id = 'splitResult';
        resultPanel.className = 'split-result';

        // 将拆分结果插入到预览区域上方
        const previewSection = document.getElementById('previewSection');
        const mainContent = document.querySelector('.main-content');
        mainContent.insertBefore(resultPanel, previewSection);
    }

    const originalFileName = sanitizeClientFilename(currentFile.name.replace('.pdf', ''));
    const splitFileName = `${originalFileName}_split.pdf`;

    resultPanel.innerHTML = `
        <h4><i class="fas fa-check-circle"></i> 拆分完成</h4>
        <div class="split-info">
            <div class="split-stats">
                <div>原页面已拆分为2个A4页面</div>
                <div>分割位置: ${Math.round(splitLine.x / scale)}px (置信度: ${Math.round(splitLine.confidence * 100)}%)</div>
                <div>新文件: ${splitFileName}</div>
            </div>
            <button class="download-split-btn" onclick="downloadSplitPdf('${splitFileName}')">
                <i class="fas fa-download"></i> 下载拆分PDF
            </button>
        </div>
    `;

    resultPanel.style.display = 'block';
}

// 下载拆分后的PDF
function downloadSplitPdf(filename) {
    if (!splitPdfData) {
        alert('没有可下载的拆分PDF数据');
        return;
    }

    try {
        const blob = new Blob([splitPdfData], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log('拆分PDF下载完成:', filename);
    } catch (error) {
        console.error('下载拆分PDF失败:', error);
        alert('下载失败: ' + error.message);
    }
}



// 前端拆分实现（高清晰度版本）
async function splitPdfClientSide(splitLine) {
    // 获取当前页面
    const page = await pdfDoc.getPage(currentPage);
    const originalViewport = page.getViewport({ scale: 1.0 });

    updateProgress(40, '高清渲染页面...');

    // 使用动态清晰度设置
    const currentQuality = qualitySettings[qualityMode];
    const highResolutionScale = currentQuality.scale;
    const highResViewport = page.getViewport({ scale: highResolutionScale });

    console.log(`使用${currentQuality.name}模式渲染，分辨率: ${highResolutionScale}x`);

    // 计算分割位置（基于高分辨率）
    const splitX = Math.round(splitLine.x / scale);
    const highResSplitX = splitX * highResolutionScale;

    // 创建高分辨率canvas
    const leftCanvas = document.createElement('canvas');
    const rightCanvas = document.createElement('canvas');
    const leftCtx = leftCanvas.getContext('2d');
    const rightCtx = rightCanvas.getContext('2d');

    // 启用高质量渲染设置
    leftCtx.imageSmoothingEnabled = true;
    leftCtx.imageSmoothingQuality = 'high';
    rightCtx.imageSmoothingEnabled = true;
    rightCtx.imageSmoothingQuality = 'high';

    // 设置高分辨率canvas尺寸
    const leftWidth = highResSplitX;
    const rightWidth = highResViewport.width - highResSplitX;

    leftCanvas.width = leftWidth;
    leftCanvas.height = highResViewport.height;
    rightCanvas.width = rightWidth;
    rightCanvas.height = highResViewport.height;

    // 设置canvas的CSS尺寸以保持正确的显示比例
    leftCanvas.style.width = (leftWidth / highResolutionScale) + 'px';
    leftCanvas.style.height = (highResViewport.height / highResolutionScale) + 'px';
    rightCanvas.style.width = (rightWidth / highResolutionScale) + 'px';
    rightCanvas.style.height = (highResViewport.height / highResolutionScale) + 'px';

    updateProgress(50, '渲染左半部分...');

    // 渲染左半部分（高分辨率）
    leftCtx.save();
    leftCtx.beginPath();
    leftCtx.rect(0, 0, leftWidth, highResViewport.height);
    leftCtx.clip();

    await page.render({
        canvasContext: leftCtx,
        viewport: highResViewport
    }).promise;

    leftCtx.restore();

    updateProgress(60, '渲染右半部分...');

    // 渲染右半部分（高分辨率）
    rightCtx.save();
    rightCtx.translate(-highResSplitX, 0);

    await page.render({
        canvasContext: rightCtx,
        viewport: highResViewport
    }).promise;

    rightCtx.restore();

    updateProgress(70, '创建高质量PDF...');

    // 创建新的PDF文档
    const pdfDoc_new = await PDFLib.PDFDocument.create();

    // A4尺寸 (595 x 842 points)
    const a4Width = 595;
    const a4Height = 842;

    // 将高分辨率canvas转换为高质量图片
    const leftImageData = leftCanvas.toDataURL('image/png', 1.0); // 最高质量
    const rightImageData = rightCanvas.toDataURL('image/png', 1.0); // 最高质量

    updateProgress(80, '嵌入左页图像...');

    // 添加左页
    const leftPage = pdfDoc_new.addPage([a4Width, a4Height]);
    const leftImage = await pdfDoc_new.embedPng(leftImageData);

    // 计算左页图像尺寸，最大化填充页面同时保持比例
    const leftOriginalRatio = leftCanvas.width / leftCanvas.height;
    const a4Ratio = a4Width / a4Height;

    let leftFinalWidth, leftFinalHeight;
    if (leftOriginalRatio > a4Ratio) {
        // 图像更宽，以宽度为准
        leftFinalWidth = a4Width - 20; // 留10px边距
        leftFinalHeight = leftFinalWidth / leftOriginalRatio;
    } else {
        // 图像更高，以高度为准
        leftFinalHeight = a4Height - 20; // 留10px边距
        leftFinalWidth = leftFinalHeight * leftOriginalRatio;
    }

    leftPage.drawImage(leftImage, {
        x: (a4Width - leftFinalWidth) / 2,
        y: (a4Height - leftFinalHeight) / 2,
        width: leftFinalWidth,
        height: leftFinalHeight,
    });

    updateProgress(90, '嵌入右页图像...');

    // 添加右页
    const rightPage = pdfDoc_new.addPage([a4Width, a4Height]);
    const rightImage = await pdfDoc_new.embedPng(rightImageData);

    // 计算右页图像尺寸
    const rightOriginalRatio = rightCanvas.width / rightCanvas.height;

    let rightFinalWidth, rightFinalHeight;
    if (rightOriginalRatio > a4Ratio) {
        rightFinalWidth = a4Width - 20;
        rightFinalHeight = rightFinalWidth / rightOriginalRatio;
    } else {
        rightFinalHeight = a4Height - 20;
        rightFinalWidth = rightFinalHeight * rightOriginalRatio;
    }

    rightPage.drawImage(rightImage, {
        x: (a4Width - rightFinalWidth) / 2,
        y: (a4Height - rightFinalHeight) / 2,
        width: rightFinalWidth,
        height: rightFinalHeight,
    });

    updateProgress(100, '完成高清拆分');

    // 生成PDF数据
    splitPdfData = await pdfDoc_new.save();

    console.log(`${currentQuality.name}清晰度拆分完成:`, {
        leftSize: `${leftCanvas.width}x${leftCanvas.height}`,
        rightSize: `${rightCanvas.width}x${rightCanvas.height}`,
        resolution: `${highResolutionScale}x`,
        quality: currentQuality.name,
        mode: qualityMode
    });
}













// 切换清晰度模式
function toggleQualityMode() {
    const modes = Object.keys(qualitySettings);
    const currentIndex = modes.indexOf(qualityMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    qualityMode = modes[nextIndex];

    const currentQuality = qualitySettings[qualityMode];

    // 更新按钮显示
    qualityBtn.innerHTML = `<i class="${currentQuality.icon}"></i> ${currentQuality.name}模式`;
    qualityBtn.title = `当前: ${currentQuality.name}清晰度 (${currentQuality.scale}x)`;

    // 更新按钮样式
    qualityBtn.classList.remove('quality-ultra');
    if (qualityMode === 'ultra') {
        qualityBtn.classList.add('quality-ultra');
    }

    // 显示清晰度信息
    showQualityInfo();

    console.log(`切换到${currentQuality.name}清晰度模式 (${currentQuality.scale}x)`);
}

// 显示清晰度信息
function showQualityInfo() {
    // 移除现有的信息面板
    const existingInfo = document.getElementById('qualityInfo');
    if (existingInfo) {
        existingInfo.remove();
    }

    const currentQuality = qualitySettings[qualityMode];
    const infoPanel = document.createElement('div');
    infoPanel.id = 'qualityInfo';
    infoPanel.className = qualityMode === 'ultra' ? 'quality-info quality-warning' : 'quality-info';

    let warningText = '';
    if (qualityMode === 'ultra') {
        warningText = '<br><strong>⚠️ 注意：</strong>超清模式处理时间较长，适合小文件使用';
    }

    infoPanel.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <i class="${currentQuality.icon}"></i>
            <strong>清晰度: ${currentQuality.name}模式 (${currentQuality.scale}x分辨率)</strong>
        </div>
        <div style="margin-top: 5px; font-size: 0.85rem;">
            分辨率越高，拆分后的PDF文档越清晰，但处理时间也会相应增加${warningText}
        </div>
    `;

    // 插入到预览控制区域后面
    const previewHeader = document.querySelector('.preview-header');
    if (previewHeader && previewSection.style.display !== 'none') {
        previewHeader.parentNode.insertBefore(infoPanel, previewHeader.nextSibling);

        // 3秒后自动隐藏
        setTimeout(() => {
            if (infoPanel && infoPanel.parentNode) {
                infoPanel.remove();
            }
        }, 3000);
    }
}



// 前端文件名清理函数
function sanitizeClientFilename(filename) {
    if (!filename) return 'document';

    // 移除或替换不安全的字符，保持中文字符
    let safeName = filename
        .replace(/[<>:"/\\|?*]/g, '_')   // 替换文件系统不允许的字符
        .replace(/\s+/g, '_')           // 替换空格为下划线
        .replace(/_{2,}/g, '_')         // 合并多个下划线
        .trim();

    // 确保文件名不为空
    if (!safeName || safeName === '_') {
        safeName = 'document';
    }

    // 限制文件名长度（考虑中文字符）
    if (safeName.length > 50) {
        safeName = safeName.substring(0, 50);
    }

    return safeName;
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    initEventListeners();

    // 初始化清晰度按钮显示
    const currentQuality = qualitySettings[qualityMode];
    qualityBtn.innerHTML = `<i class="${currentQuality.icon}"></i> ${currentQuality.name}模式`;
    qualityBtn.title = `当前: ${currentQuality.name}清晰度 (${currentQuality.scale}x)`;

    console.log('PDF 预览系统已初始化');
    console.log(`默认清晰度: ${currentQuality.name}模式 (${currentQuality.scale}x)`);
    console.log('图像拆分模式，自动检测分割线，支持拖动调整');
});

// 自动检测分割线
async function autoDetectLines() {
    if (!pdfDoc || !currentFile) {
        return;
    }

    console.log('开始自动检测分割线...');

    // 更新按钮状态
    detectLinesBtn.innerHTML = '<i class="fas fa-sync fa-spin"></i> 检测中...';
    detectLinesBtn.disabled = true;

    try {
        // 直接使用现有的detectVerticalLines函数，它会从主canvas获取数据
        // 确保主canvas已经渲染了当前页面
        await renderPage(currentPage);

        // 执行分割线检测算法
        detectVerticalLines();

        console.log(`检测到 ${detectedLines.length} 条分割线`);

        if (detectedLines.length > 0) {
            lineDetectionEnabled = true;
            detectLinesBtn.innerHTML = '<i class="fas fa-check"></i> 检测完成';
            detectLinesBtn.title = '已检测到分割线，可拖动调整位置';

            // 显示拆分按钮
            splitPdfBtn.style.display = 'inline-block';

            // 显示提示信息
            showDetectionInfo();
        } else {
            detectLinesBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> 未检测到';
            detectLinesBtn.title = '未检测到明显的分割线，请手动调整敏感度';
            console.log('未检测到明显的分割线');
        }

    } catch (error) {
        console.error('自动检测失败:', error);
        detectLinesBtn.innerHTML = '<i class="fas fa-times"></i> 检测失败';
        detectLinesBtn.title = '自动检测失败，请重试';
    } finally {
        detectLinesBtn.disabled = false;
    }
}



// Canvas鼠标事件处理
function handleCanvasMouseDown(event) {
    if (!lineDetectionEnabled || detectedLines.length === 0) return;

    const rect = pdfCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;

    // 检查是否点击在分割线附近（容差10像素）
    for (let i = 0; i < detectedLines.length; i++) {
        const lineX = detectedLines[i].x * scale;
        if (Math.abs(x - lineX) <= 10) {
            isDragging = true;
            dragLineIndex = i;
            dragStartX = x;
            pdfCanvas.style.cursor = 'col-resize';
            break;
        }
    }
}

function handleCanvasMouseMove(event) {
    if (!lineDetectionEnabled || detectedLines.length === 0) return;

    const rect = pdfCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;

    if (isDragging && dragLineIndex >= 0) {
        // 拖动分割线
        const newX = x / scale;
        detectedLines[dragLineIndex].x = Math.max(10, Math.min(newX, pdfCanvas.width / scale - 10));

        // 只重新绘制分割线，不重新渲染整个PDF页面
        redrawLinesOnly();
    } else {
        // 检查鼠标是否在分割线附近，改变光标样式
        let nearLine = false;
        for (let i = 0; i < detectedLines.length; i++) {
            const lineX = detectedLines[i].x * scale;
            if (Math.abs(x - lineX) <= 10) {
                nearLine = true;
                break;
            }
        }
        pdfCanvas.style.cursor = nearLine ? 'col-resize' : 'default';
    }
}

function handleCanvasMouseUp(event) {
    if (isDragging) {
        isDragging = false;
        dragLineIndex = -1;
        pdfCanvas.style.cursor = 'default';

        // 拖动结束后进行一次完整的重新绘制，确保最终状态正确
        if (lineDetectionEnabled && detectedLines.length > 0) {
            redrawLinesOnly();
        }

        console.log('分割线位置已调整');
    }
}
