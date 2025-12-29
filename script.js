// PDF 预览系统 JavaScript

// 全局变量
let pdfDoc = null;
let totalPages = 0;
let scale = 1.0;
let currentFile = null;

// 多页面相关变量
let canvasMap = {}; // { pageNum: canvas }
let ctxMap = {}; // { pageNum: context }

// 分割线检测相关变量 - 改为映射结构
let detectedLinesMap = {}; // { pageNum: [...lines] }
let pageDetectionState = {}; // { pageNum: { enabled, sensitivity } }
let pdfImageDataMap = {}; // { pageNum: imageData }

// 拖动相关变量
let isDragging = false;
let dragPageNum = -1;
let dragLineIndex = -1;

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
const previewContainer = document.getElementById('previewContainer');

// 控制按钮
const zoomIn = document.getElementById('zoomIn');
const zoomOut = document.getElementById('zoomOut');
const zoomLevel = document.getElementById('zoomLevel');
const detectAllLinesBtn = document.getElementById('detectAllLinesBtn');
const splitPdfBtn = document.getElementById('splitPdfBtn');
const qualityBtn = document.getElementById('qualityBtn');
const globalDetectionInfo = document.getElementById('globalDetectionInfo');
const detectedCount = document.getElementById('detectedCount');
const totalPagesCount = document.getElementById('totalPagesCount');

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

    // 全部检测按钮
    detectAllLinesBtn.addEventListener('click', detectLinesForAllPages);

    // PDF拆分按钮
    splitPdfBtn.addEventListener('click', splitAllPagesClientSide);

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
        // 显示加载提示
        previewContainer.innerHTML = '<div style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin" style="font-size: 3rem; color: #667eea;"></i><p style="margin-top: 20px; font-size: 1.2rem;">正在加载PDF文件...</p></div>';
        previewSection.style.display = 'block';
        
        const arrayBuffer = await file.arrayBuffer();
        pdfDoc = await pdfjsLib.getDocument(arrayBuffer).promise;
        totalPages = pdfDoc.numPages;
        
        console.log(`PDF加载成功，共 ${totalPages} 页`);
        
        // 清空预览容器
        previewContainer.innerHTML = '';
        
        // 重置数据结构
        canvasMap = {};
        ctxMap = {};
        detectedLinesMap = {};
        pageDetectionState = {};
        pdfImageDataMap = {};
        
        // 更新全局检测信息
        totalPagesCount.textContent = totalPages;
        detectedCount.textContent = '0';
        globalDetectionInfo.style.display = 'block';
        
        // 创建所有页面的容器和canvas
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            createPageWrapper(pageNum);
        }
        
        // 渲染所有页面
        await renderAllPages();

        // 更新控制按钮状态
        updateControls();
        
        console.log('所有页面渲染完成');
        
    } catch (error) {
        console.error('加载 PDF 失败:', error);
        alert('加载 PDF 文件失败，请确保文件完整且未损坏。');
        previewSection.style.display = 'none';
    }
}

// 创建页面包装器
function createPageWrapper(pageNum) {
    const wrapper = document.createElement('div');
    wrapper.className = 'page-wrapper';
    wrapper.id = `page-wrapper-${pageNum}`;
    
    // 页面头部
    const header = document.createElement('div');
    header.className = 'page-header';
    header.innerHTML = `
        <div class="page-number">
            <i class="fas fa-file-pdf"></i> 第 ${pageNum} 页
        </div>
        <div class="page-status not-detected" id="page-status-${pageNum}">
            <i class="fas fa-exclamation-circle"></i> 未检测
        </div>
    `;
    
    // Canvas容器
    const canvasContainer = document.createElement('div');
    canvasContainer.className = 'page-canvas-container';
    
    const canvas = document.createElement('canvas');
    canvas.className = 'page-canvas';
    canvas.id = `page-canvas-${pageNum}`;
    canvasContainer.appendChild(canvas);
    
    // 页面控制按钮
    const controls = document.createElement('div');
    controls.className = 'page-controls';
    controls.innerHTML = `
        <button class="control-btn" id="detect-btn-${pageNum}" title="检测本页的垂直分割线">
            <i class="fas fa-search"></i> 检测分割线
        </button>
    `;
    
    // 组装页面
    wrapper.appendChild(header);
    wrapper.appendChild(canvasContainer);
    wrapper.appendChild(controls);
    
    previewContainer.appendChild(wrapper);
    
    // 保存canvas和context引用
    canvasMap[pageNum] = canvas;
    ctxMap[pageNum] = canvas.getContext('2d');
    
    // 初始化检测状态
    pageDetectionState[pageNum] = {
        enabled: false,
        sensitivity: 0.3
    };
    detectedLinesMap[pageNum] = [];
    
    // 添加检测按钮事件
    const detectBtn = document.getElementById(`detect-btn-${pageNum}`);
    detectBtn.addEventListener('click', () => toggleLineDetectionForPage(pageNum));
    
    // 添加canvas鼠标事件
    canvas.addEventListener('mousedown', (e) => handleCanvasMouseDown(e, pageNum));
    canvas.addEventListener('mousemove', (e) => handleCanvasMouseMove(e, pageNum));
    canvas.addEventListener('mouseup', (e) => handleCanvasMouseUp(e, pageNum));
    canvas.addEventListener('mouseleave', (e) => handleCanvasMouseUp(e, pageNum));
}

// 渲染所有页面
async function renderAllPages() {
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        await renderPage(pageNum);
    }
}

// 渲染单个页面
async function renderPage(pageNum) {
    try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: scale });
        
        const canvas = canvasMap[pageNum];
        const ctx = ctxMap[pageNum];
        
        if (!canvas || !ctx) {
            console.error(`Canvas not found for page ${pageNum}`);
            return;
        }
        
        // 设置 canvas 尺寸
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        // 渲染页面
        const renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };
        
        await page.render(renderContext).promise;

        // 保存PDF页面的图像数据
        pdfImageDataMap[pageNum] = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // 如果该页启用了分割线检测，重新绘制检测结果
        if (pageDetectionState[pageNum]?.enabled && detectedLinesMap[pageNum]?.length > 0) {
            drawDetectedLinesForPage(pageNum);
        }

    } catch (error) {
        console.error(`渲染页面 ${pageNum} 失败:`, error);
    }
}

// 改变缩放
function changeZoom(delta) {
    const newScale = scale + delta;
    if (newScale >= 0.5 && newScale <= 3.0) {
        scale = newScale;
        zoomLevel.textContent = Math.round(scale * 100) + '%';
        
        // 重新渲染所有页面
        renderAllPages().then(() => {
            // 对已检测的页面重新检测分割线
            for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
                if (pageDetectionState[pageNum]?.enabled) {
                    setTimeout(() => {
                        detectLinesForPage(pageNum);
                    }, 100);
                }
            }
        });
    }
}

// 更新控制按钮状态
function updateControls() {
    zoomOut.disabled = scale <= 0.5;
    zoomIn.disabled = scale >= 3.0;
    
    // 更新拆分按钮状态
    updateSplitButtonStatus();
}

// 移除文件
function handleRemoveFile() {
    currentFile = null;
    pdfDoc = null;
    fileInput.value = '';
    fileInfo.style.display = 'none';
    previewSection.style.display = 'none';

    // 清空预览容器
    previewContainer.innerHTML = '';

    // 重置变量
    totalPages = 0;
    scale = 1.0;
    zoomLevel.textContent = '100%';
    
    // 清理多页面数据
    canvasMap = {};
    ctxMap = {};
    detectedLinesMap = {};
    pageDetectionState = {};
    pdfImageDataMap = {};

    // 清理拆分相关数据
    splitPdfData = null;
    splitInProgress = false;
    splitPdfBtn.style.display = 'none';
    globalDetectionInfo.style.display = 'none';

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



// 切换单个页面的分割线检测
function toggleLineDetectionForPage(pageNum) {
    const state = pageDetectionState[pageNum];
    state.enabled = !state.enabled;
    
    const detectBtn = document.getElementById(`detect-btn-${pageNum}`);
    const statusDiv = document.getElementById(`page-status-${pageNum}`);
    
    if (state.enabled) {
        // 启用检测
        detectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 检测中...';
        detectBtn.disabled = true;
        statusDiv.className = 'page-status detecting';
        statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 检测中';
        
        // 执行检测
        setTimeout(() => {
            detectLinesForPage(pageNum);
            
            // 更新按钮状态
            const lines = detectedLinesMap[pageNum];
            if (lines && lines.length > 0) {
                detectBtn.innerHTML = '<i class="fas fa-check"></i> 已检测';
                detectBtn.classList.add('line-detection-active');
                statusDiv.className = 'page-status detected';
                statusDiv.innerHTML = `<i class="fas fa-check-circle"></i> 已检测 (${lines.length}条线)`;
            } else {
                detectBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> 未检测到';
                detectBtn.classList.remove('line-detection-active');
                statusDiv.className = 'page-status not-detected';
                statusDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> 未检测到分割线';
            }
            
            // 无论是否检测到，都显示检测信息面板（包含敏感度调节器）
            showDetectionInfoForPage(pageNum);
            
            detectBtn.disabled = false;
            updateGlobalDetectionCount();
            updateSplitButtonStatus();
        }, 100);
    } else {
        // 关闭检测
        detectBtn.innerHTML = '<i class="fas fa-search"></i> 检测分割线';
        detectBtn.classList.remove('line-detection-active');
        statusDiv.className = 'page-status not-detected';
        statusDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> 未检测';
        
        // 清除检测结果
        detectedLinesMap[pageNum] = [];
        
        // 重新渲染页面（清除红线）
        renderPage(pageNum);
        
        // 隐藏检测信息
        hideDetectionInfoForPage(pageNum);
        
        updateGlobalDetectionCount();
        updateSplitButtonStatus();
    }
}

// 检测指定页面的垂直线条
function detectLinesForPage(pageNum) {
    const canvas = canvasMap[pageNum];
    const ctx = ctxMap[pageNum];
    const sensitivity = pageDetectionState[pageNum]?.sensitivity || 0.3;
    
    if (!canvas || !ctx) return;

    // 获取canvas图像数据
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = canvas.width;
    const height = canvas.height;

    let detectedLines = [];

    // 垂直线检测算法
    const minLineLength = Math.floor(height * 0.3); // 最小线长度为页面高度的30%
    const threshold = Math.floor(255 * (1 - sensitivity)); // 像素阈值

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
    
    // 保存检测结果
    detectedLinesMap[pageNum] = detectedLines;

    // 绘制检测到的红线
    drawDetectedLinesForPage(pageNum);

    console.log(`页面 ${pageNum} 检测到 ${detectedLines.length} 条垂直线`);
}

// 检测所有页面的分割线
async function detectLinesForAllPages() {
    detectAllLinesBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 检测中...';
    detectAllLinesBtn.disabled = true;
    
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        if (!pageDetectionState[pageNum].enabled) {
            // 自动启用检测
            toggleLineDetectionForPage(pageNum);
            // 等待一小段时间让检测完成
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }
    
    detectAllLinesBtn.innerHTML = '<i class="fas fa-check"></i> 检测完成';
    setTimeout(() => {
        detectAllLinesBtn.innerHTML = '<i class="fas fa-search"></i> 全部检测';
        detectAllLinesBtn.disabled = false;
    }, 2000);
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

// 绘制指定页面检测到的红线
function drawDetectedLinesForPage(pageNum) {
    const ctx = ctxMap[pageNum];
    const lines = detectedLinesMap[pageNum];
    
    if (!ctx || !lines || lines.length === 0) return;

    // 保存当前绘图状态
    ctx.save();

    // 设置红线样式
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;

    // 绘制每条检测到的线
    lines.forEach(line => {
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
function redrawLinesOnlyForPage(pageNum) {
    const ctx = ctxMap[pageNum];
    const imageData = pdfImageDataMap[pageNum];
    
    if (!ctx || !imageData) return;

    // 恢复原始PDF图像
    ctx.putImageData(imageData, 0, 0);

    // 重新绘制分割线
    if (pageDetectionState[pageNum]?.enabled && detectedLinesMap[pageNum]?.length > 0) {
        drawDetectedLinesForPage(pageNum);
    }
}

// 显示指定页面的检测信息
function showDetectionInfoForPage(pageNum) {
    const wrapper = document.getElementById(`page-wrapper-${pageNum}`);
    if (!wrapper) return;
    
    // 检查是否已存在检测信息面板
    let infoPanel = document.getElementById(`page-detection-info-${pageNum}`);
    if (!infoPanel) {
        // 创建检测信息面板
        infoPanel = document.createElement('div');
        infoPanel.id = `page-detection-info-${pageNum}`;
        infoPanel.className = 'page-detection-info detected';
        
        // 插入到页面控制按钮后面
        const controls = wrapper.querySelector('.page-controls');
        controls.parentNode.insertBefore(infoPanel, controls.nextSibling);
    }

    // 更新检测信息内容
    updateDetectionInfoForPage(pageNum);
}

// 隐藏指定页面的检测信息
function hideDetectionInfoForPage(pageNum) {
    const infoPanel = document.getElementById(`page-detection-info-${pageNum}`);
    if (infoPanel) {
        infoPanel.remove();
    }
}

// 更新指定页面的检测信息内容
function updateDetectionInfoForPage(pageNum) {
    const infoPanel = document.getElementById(`page-detection-info-${pageNum}`);
    if (!infoPanel) return;

    const lines = detectedLinesMap[pageNum] || [];
    const lineCount = lines.length;
    const avgConfidence = lineCount > 0
        ? (lines.reduce((sum, line) => sum + line.confidence, 0) / lineCount * 100).toFixed(1)
        : 0;
    
    const sensitivity = pageDetectionState[pageNum]?.sensitivity || 0.3;

    // 根据是否检测到分割线显示不同的消息
    let resultMessage = '';
    if (lineCount > 0) {
        resultMessage = `<strong>检测结果:</strong> ${lineCount} 条分割线，平均置信度: ${avgConfidence}%`;
        infoPanel.className = 'page-detection-info detected';
    } else {
        resultMessage = `
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                <i class="fas fa-info-circle" style="color: #856404;"></i>
                <strong style="color: #856404;">未检测到分割线</strong>
            </div>
            <div style="font-size: 0.85rem; color: #666; margin-bottom: 8px;">
                建议：<br>
                • 提高敏感度（40%-60%）检测细线<br>
                • 降低敏感度（10%-30%）检测粗线
            </div>
        `;
        infoPanel.className = 'page-detection-info';
        infoPanel.style.background = '#fff3cd';
        infoPanel.style.borderColor = '#ffc107';
        infoPanel.style.color = '#333';
    }

    infoPanel.innerHTML = `
        <div style="margin-bottom: 8px;">
            ${resultMessage}
        </div>
        <div class="page-detection-controls">
            <div class="page-sensitivity-control">
                <label>检测敏感度:</label>
                <input type="range" class="sensitivity-slider" id="sensitivity-${pageNum}"
                       min="0.1" max="1.0" step="0.1" value="${sensitivity}">
                <span id="sensitivity-value-${pageNum}">${Math.round(sensitivity * 100)}%</span>
            </div>
            <button class="control-btn" style="font-size: 0.75rem; padding: 4px 8px;" onclick="redetectPage(${pageNum})">
                <i class="fas fa-redo"></i> 重新检测
            </button>
        </div>
    `;

    // 添加敏感度滑块事件监听器
    const sensitivitySlider = document.getElementById(`sensitivity-${pageNum}`);
    const sensitivityValue = document.getElementById(`sensitivity-value-${pageNum}`);

    if (sensitivitySlider) {
        sensitivitySlider.addEventListener('input', function() {
            pageDetectionState[pageNum].sensitivity = parseFloat(this.value);
            sensitivityValue.textContent = Math.round(this.value * 100) + '%';
        });
    }
}

// 重新检测指定页面（全局函数，供HTML onclick调用）
function redetectPage(pageNum) {
    const detectBtn = document.getElementById(`detect-btn-${pageNum}`);
    const statusDiv = document.getElementById(`page-status-${pageNum}`);
    
    // 显示检测中状态
    detectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 检测中...';
    detectBtn.disabled = true;
    statusDiv.className = 'page-status detecting';
    statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 检测中';
    
    // 延迟执行检测，让UI更新
    setTimeout(() => {
        detectLinesForPage(pageNum);
        
        // 更新状态
        const lines = detectedLinesMap[pageNum];
        if (lines && lines.length > 0) {
            detectBtn.innerHTML = '<i class="fas fa-check"></i> 已检测';
            detectBtn.classList.add('line-detection-active');
            statusDiv.className = 'page-status detected';
            statusDiv.innerHTML = `<i class="fas fa-check-circle"></i> 已检测 (${lines.length}条线)`;
        } else {
            detectBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> 未检测到';
            detectBtn.classList.remove('line-detection-active');
            statusDiv.className = 'page-status not-detected';
            statusDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> 未检测到分割线';
        }
        
        // 更新检测信息面板
        updateDetectionInfoForPage(pageNum);
        
        detectBtn.disabled = false;
        updateGlobalDetectionCount();
        updateSplitButtonStatus();
    }, 100);
}

// 更新全局检测计数
function updateGlobalDetectionCount() {
    let count = 0;
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        if (pageDetectionState[pageNum]?.enabled && detectedLinesMap[pageNum]?.length > 0) {
            count++;
        }
    }
    detectedCount.textContent = count;
}

// 更新拆分按钮状态
function updateSplitButtonStatus() {
    let detectedPages = 0;
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        if (pageDetectionState[pageNum]?.enabled && detectedLinesMap[pageNum]?.length > 0) {
            detectedPages++;
        }
    }
    
    if (detectedPages > 0) {
        splitPdfBtn.style.display = 'inline-flex';
        splitPdfBtn.innerHTML = `<i class="fas fa-cut"></i> 拆分PDF (${detectedPages}/${totalPages}页)`;
    } else {
        splitPdfBtn.style.display = 'none';
    }
}



// 批量拆分多页PDF
async function splitAllPagesClientSide() {
    if (!pdfDoc || !currentFile || splitInProgress) {
        return;
    }

    try {
        splitInProgress = true;
        splitPdfBtn.disabled = true;
        splitPdfBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 拆分中...';

        // 显示进度条
        showSplitProgress();

        // 检查哪些页面需要拆分
        const pagesToSplit = [];
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            pagesToSplit.push({
                pageNum: pageNum,
                hasDetection: pageDetectionState[pageNum]?.enabled && detectedLinesMap[pageNum]?.length > 0
            });
        }

        // 如果有页面未检测，询问用户
        const undetectedPages = pagesToSplit.filter(p => !p.hasDetection).length;
        if (undetectedPages > 0) {
            const confirm = window.confirm(
                `有 ${undetectedPages} 页未检测到分割线，将使用页面中心线作为默认分割线。是否继续？`
            );
            if (!confirm) {
                throw new Error('用户取消操作');
            }
        }

        updateProgress(10, '准备拆分...');

        // 创建新的PDF文档
        const pdfDoc_new = await PDFLib.PDFDocument.create();
        const a4Width = 595;
        const a4Height = 842;

        // 遍历所有页面进行拆分
        for (let i = 0; i < pagesToSplit.length; i++) {
            const { pageNum, hasDetection } = pagesToSplit[i];
            const progress = 10 + (i / pagesToSplit.length) * 80;
            
            updateProgress(progress, `正在处理第 ${pageNum}/${totalPages} 页...`);

            // 获取分割线
            let splitLine;
            if (hasDetection) {
                splitLine = selectBestSplitLineForPage(pageNum);
            } else {
                // 使用页面中心线作为默认分割线
                const canvas = canvasMap[pageNum];
                splitLine = {
                    x: canvas.width / 2,
                    confidence: 0.5
                };
            }

            // 渲染并拆分该页
            await splitSinglePage(pageNum, splitLine, pdfDoc_new, a4Width, a4Height);
        }

        updateProgress(95, '生成PDF文档...');

        // 生成PDF数据
        splitPdfData = await pdfDoc_new.save();

        updateProgress(100, '拆分完成！');

        // 显示拆分结果
        showSplitResultForAllPages(pagesToSplit.length);

    } catch (error) {
        console.error('PDF拆分失败:', error);
        if (error.message !== '用户取消操作') {
            alert('PDF拆分失败: ' + error.message);
        }
    } finally {
        splitInProgress = false;
        splitPdfBtn.disabled = false;
        const detectedPages = Object.values(pageDetectionState).filter(s => s.enabled).length;
        splitPdfBtn.innerHTML = `<i class="fas fa-cut"></i> 拆分PDF (${detectedPages}/${totalPages}页)`;
        setTimeout(() => hideSplitProgress(), 2000);
    }
}

// 选择指定页面的最佳分割线
function selectBestSplitLineForPage(pageNum) {
    const lines = detectedLinesMap[pageNum];
    const canvas = canvasMap[pageNum];
    
    if (!lines || lines.length === 0) return null;

    // 优先选择置信度最高且位置居中的线条
    const centerX = canvas.width / 2;
    let bestLine = null;
    let bestScore = 0;

    lines.forEach(line => {
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

// 拆分单个页面
async function splitSinglePage(pageNum, splitLine, pdfDoc_new, a4Width, a4Height) {
    // 获取当前页面
    const page = await pdfDoc.getPage(pageNum);
    const originalViewport = page.getViewport({ scale: 1.0 });

    // 使用动态清晰度设置
    const currentQuality = qualitySettings[qualityMode];
    const highResolutionScale = currentQuality.scale;
    const highResViewport = page.getViewport({ scale: highResolutionScale });

    // 计算分割位置（基于高分辨率）
    const splitX = splitLine.x / scale;
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

    // 渲染右半部分（高分辨率）
    rightCtx.save();
    rightCtx.translate(-highResSplitX, 0);

    await page.render({
        canvasContext: rightCtx,
        viewport: highResViewport
    }).promise;

    rightCtx.restore();

    // 将高分辨率canvas转换为高质量图片
    const leftImageData = leftCanvas.toDataURL('image/png', 1.0);
    const rightImageData = rightCanvas.toDataURL('image/png', 1.0);

    // 添加左页
    const leftPage = pdfDoc_new.addPage([a4Width, a4Height]);
    const leftImage = await pdfDoc_new.embedPng(leftImageData);

    // 计算左页图像尺寸
    const leftOriginalRatio = leftCanvas.width / leftCanvas.height;
    const a4Ratio = a4Width / a4Height;

    let leftFinalWidth, leftFinalHeight;
    if (leftOriginalRatio > a4Ratio) {
        leftFinalWidth = a4Width - 20;
        leftFinalHeight = leftFinalWidth / leftOriginalRatio;
    } else {
        leftFinalHeight = a4Height - 20;
        leftFinalWidth = leftFinalHeight * leftOriginalRatio;
    }

    leftPage.drawImage(leftImage, {
        x: (a4Width - leftFinalWidth) / 2,
        y: (a4Height - leftFinalHeight) / 2,
        width: leftFinalWidth,
        height: leftFinalHeight,
    });

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

// 显示多页拆分结果
function showSplitResultForAllPages(originalPages) {
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
    const newPageCount = originalPages * 2;

    resultPanel.innerHTML = `
        <h4><i class="fas fa-check-circle"></i> 拆分完成</h4>
        <div class="split-info">
            <div class="split-stats">
                <div><strong>原始页数:</strong> ${originalPages} 页</div>
                <div><strong>拆分后页数:</strong> ${newPageCount} 页</div>
                <div><strong>新文件名:</strong> ${splitFileName}</div>
                <div style="margin-top: 8px; color: #666;">每页已拆分为左右两个A4页面</div>
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



// 注：splitPdfClientSide 函数已被 splitAllPagesClientSide 和 splitSinglePage 替代













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

    console.log('PDF 多页预览系统已初始化');
    console.log(`默认清晰度: ${currentQuality.name}模式 (${currentQuality.scale}x)`);
    console.log('支持多页预览、独立检测、批量拆分');
});

// 注：autoDetectLines 函数已被 detectLinesForAllPages 替代，不再需要自动检测单页



// Canvas鼠标事件处理 - 支持多页面
function handleCanvasMouseDown(event, pageNum) {
    const canvas = canvasMap[pageNum];
    const lines = detectedLinesMap[pageNum];
    
    if (!pageDetectionState[pageNum]?.enabled || !lines || lines.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;

    // 检查是否点击在分割线附近（容差10像素）
    for (let i = 0; i < lines.length; i++) {
        if (Math.abs(x - lines[i].x) <= 10) {
            isDragging = true;
            dragPageNum = pageNum;
            dragLineIndex = i;
            canvas.style.cursor = 'col-resize';
            break;
        }
    }
}

function handleCanvasMouseMove(event, pageNum) {
    const canvas = canvasMap[pageNum];
    const lines = detectedLinesMap[pageNum];
    
    if (!pageDetectionState[pageNum]?.enabled || !lines || lines.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;

    if (isDragging && dragPageNum === pageNum && dragLineIndex >= 0) {
        // 拖动分割线
        const newX = x;
        lines[dragLineIndex].x = Math.max(10, Math.min(newX, canvas.width - 10));

        // 只重新绘制分割线，不重新渲染整个PDF页面
        redrawLinesOnlyForPage(pageNum);
    } else {
        // 检查鼠标是否在分割线附近，改变光标样式
        let nearLine = false;
        for (let i = 0; i < lines.length; i++) {
            if (Math.abs(x - lines[i].x) <= 10) {
                nearLine = true;
                break;
            }
        }
        canvas.style.cursor = nearLine ? 'col-resize' : 'default';
    }
}

function handleCanvasMouseUp(event, pageNum) {
    const canvas = canvasMap[pageNum];
    
    if (isDragging && dragPageNum === pageNum) {
        isDragging = false;
        dragPageNum = -1;
        dragLineIndex = -1;
        canvas.style.cursor = 'default';

        // 拖动结束后进行一次完整的重新绘制，确保最终状态正确
        if (pageDetectionState[pageNum]?.enabled && detectedLinesMap[pageNum]?.length > 0) {
            redrawLinesOnlyForPage(pageNum);
        }

        console.log(`页面 ${pageNum} 分割线位置已调整`);
    }
}
