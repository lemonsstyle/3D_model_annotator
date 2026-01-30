// 全局变量
let scene, camera, renderer, controls, mixer;
let annotations = [];
let modelGroup; // 添加一个组来包含模型和相关对象
let modelMesh; // 存储模型网格以便于后续修改
let hasVertexColors = false; // 是否有顶点颜色
let isAddingAnnotation = false; // 是否正在添加标注
let isSettingCenter = false; // 是否正在设置旋转中心
let raycaster = new THREE.Raycaster(); // 射线投射器，用于检测点击位置
let mouse = new THREE.Vector2(); // 存储鼠标位置
let selectedAnnotation = null; // 当前选中的标注
let currentModelPath = ''; // 当前加载的模型路径
let lastFrameTime = 0; // 用于限制帧率
let isLargeModel = false; // 是否是大模型
let annotationsVisible = true; // 标注是否可见
let centerMarker = null; // 旋转中心标记
let isPerformanceMode = false; // 跟踪性能模式状态
let originalPixelRatio; // 存储原始像素比
let initialCameraPosition = null; // 初始相机位置
let initialCameraTarget = new THREE.Vector3(0, 0, 0); // 初始相机目标点

// 可用的模型列表 - 将通过API动态获取
let availableModels = [];

// DOM元素
const container = document.getElementById('model-container');

// 添加加载指示器
const loadingElement = document.createElement('div');
loadingElement.id = 'loading';
loadingElement.textContent = '请从左下角选择要加载的模型';
document.body.appendChild(loadingElement);

// 全局变量 - 在init函数中初始化
let fastLoadMode = false; // 快速加载模式

// 添加全局变量
let dynamicLODEnabled = false; // 动态点大小开关（由性能模式控制）

// 移动端相关全局变量
let isMobileDevice = false;
let isTabletDevice = false;
let mobilePanelsContainer = null;
let mobileBottomToolbar = null;
let mobilePanelsVisible = false;

// 设备检测函数
function detectDevice() {
    const userAgent = navigator.userAgent;
    const screenWidth = window.innerWidth;
    
    // 检测移动设备
    isMobileDevice = screenWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    
    // 检测平板设备
    isTabletDevice = screenWidth > 768 && screenWidth <= 1024 && /iPad|Android/i.test(userAgent);
    
    console.log(`设备检测结果: 移动设备=${isMobileDevice}, 平板设备=${isTabletDevice}, 屏幕宽度=${screenWidth}`);
    
    return { isMobile: isMobileDevice, isTablet: isTabletDevice };
}

// 创建移动端底部工具栏
function createMobileBottomToolbar() {
    if (!isMobileDevice) return;
    
    // 移除已存在的工具栏
    if (mobileBottomToolbar) {
        mobileBottomToolbar.remove();
    }
    
    mobileBottomToolbar = document.createElement('div');
    mobileBottomToolbar.className = 'mobile-bottom-toolbar';
    
    // 模型选择按钮
    const modelBtn = document.createElement('button');
    modelBtn.className = 'control-button icon-button';
    modelBtn.innerHTML = '📱';
    modelBtn.title = '选择模型';
    modelBtn.addEventListener('click', () => {
        console.log('模型选择按钮被点击');
        toggleMobilePanels('model');
    });
    
    // 【移动端禁用】标注控制按钮已移除
    // 移动端不再提供标注功能，但PC端保持正常
    
    // 模型控制按钮
    const controlBtn = document.createElement('button');
    controlBtn.className = 'control-button icon-button';
    controlBtn.innerHTML = '⚙️';
    controlBtn.title = '模型控制';
    controlBtn.addEventListener('click', () => {
        console.log('模型控制按钮被点击');
        toggleMobilePanels('control');
    });
    
    // 隐藏/显示面板按钮
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'control-button icon-button';
    toggleBtn.innerHTML = '👁️';
    toggleBtn.title = '显示/隐藏面板';
    toggleBtn.addEventListener('click', () => {
        console.log('显示/隐藏面板按钮被点击');
        toggleAllMobilePanels();
    });
    
    mobileBottomToolbar.appendChild(modelBtn);
    // mobileBottomToolbar.appendChild(annotationBtn); // 【移动端禁用】不添加标注按钮
    mobileBottomToolbar.appendChild(controlBtn);
    mobileBottomToolbar.appendChild(toggleBtn);
    
    document.body.appendChild(mobileBottomToolbar);
}

// 创建移动端面板容器
function createMobilePanelsContainer() {
    if (!isMobileDevice) return;
    
    // 移除已存在的容器
    if (mobilePanelsContainer) {
        mobilePanelsContainer.remove();
    }
    
    mobilePanelsContainer = document.createElement('div');
    mobilePanelsContainer.className = 'mobile-panels-container';
    document.body.appendChild(mobilePanelsContainer);
}

// 确保所有面板都已创建
function ensurePanelsExist() {
    // 检查模型选择面板
    if (!document.querySelector('.control-panel.model-selector')) {
        console.log('模型选择面板不存在，尝试创建...');
        if (typeof createModelSelector === 'function') {
            // 如果模型列表已加载，创建选择器
            if (availableModels && availableModels.length > 0) {
                createModelSelector();
            }
        }
    }
    
    // 检查标注控制面板
    if (!document.querySelector('.control-panel:has(.panel-title)') || 
        !Array.from(document.querySelectorAll('.panel-title')).some(el => el.textContent === '标注控制')) {
        console.log('标注控制面板不存在，尝试创建...');
        if (typeof createAnnotationControl === 'function') {
            createAnnotationControl();
        }
    }
    
    // 检查模型控制面板
    if (!Array.from(document.querySelectorAll('.panel-title')).some(el => el.textContent === '模型控制')) {
        console.log('模型控制面板不存在，尝试创建...');
        if (typeof createColorControl === 'function') {
            createColorControl();
        }
    }
}

// 切换移动端面板显示
function toggleMobilePanels(panelType) {
    if (!isMobileDevice || !mobilePanelsContainer) return;
    
    console.log(`尝试显示面板类型: ${panelType}`);
    
    // 确保面板存在
    ensurePanelsExist();
    
    // 清空容器
    mobilePanelsContainer.innerHTML = '';
    
    // 根据类型显示对应面板
    const panels = document.querySelectorAll('.control-panel');
    console.log(`找到 ${panels.length} 个控制面板`);
    
    let foundPanel = false;
    
    panels.forEach((panel, index) => {
        const titleElement = panel.querySelector('.panel-title');
        const titleText = titleElement ? titleElement.textContent : '';
        console.log(`面板 ${index}: 标题="${titleText}", 类名="${panel.className}"`);
        
        let shouldShow = false;
        
        if (panelType === 'model' && panel.classList.contains('model-selector')) {
            shouldShow = true;
        } else if (panelType === 'annotation' && titleText === '标注控制') {
            shouldShow = true;
        } else if (panelType === 'control' && titleText === '模型控制') {
            shouldShow = true;
        }
        
        if (shouldShow) {
            console.log(`显示面板: ${titleText}`);
            const clonedPanel = panel.cloneNode(true);
            clonedPanel.classList.add('mobile-stacked');
            clonedPanel.style.display = 'block'; // 确保显示
            mobilePanelsContainer.appendChild(clonedPanel);
            // 重新绑定事件
            rebindPanelEvents(clonedPanel, panel);
            foundPanel = true;
        }
    });
    
    // 如果没有找到面板，直接创建面板内容
    if (!foundPanel) {
        console.log(`未找到 ${panelType} 类型的面板，直接创建面板内容`);
        const newPanel = document.createElement('div');
        newPanel.className = 'control-panel mobile-stacked';
        
        if (panelType === 'model') {
            newPanel.innerHTML = createModelPanelContent();
        } else if (panelType === 'annotation') {
            newPanel.innerHTML = createAnnotationPanelContent();
        } else if (panelType === 'control') {
            newPanel.innerHTML = createControlPanelContent();
        } else {
            newPanel.innerHTML = `
                <div class="panel-title">面板未就绪</div>
                <div style="text-align: center; padding: 20px;">
                    <p>请等待页面完全加载后再试</p>
                    <p>或尝试刷新页面</p>
                </div>
            `;
        }
        
        mobilePanelsContainer.appendChild(newPanel);
        
        // 绑定新创建面板的事件
        bindMobilePanelEvents(newPanel, panelType);
        foundPanel = true;
    }
    
    // 显示容器
    mobilePanelsContainer.classList.add('show');
    mobilePanelsVisible = true;
    
    // 添加关闭按钮
    const closeBtn = document.createElement('button');
    closeBtn.className = 'control-button';
    closeBtn.innerHTML = '✕ 关闭';
    closeBtn.style.marginTop = '20px';
    closeBtn.addEventListener('click', () => {
        mobilePanelsContainer.classList.remove('show');
        mobilePanelsVisible = false;
    });
    mobilePanelsContainer.appendChild(closeBtn);
    
    console.log(`面板容器已显示，包含 ${mobilePanelsContainer.children.length} 个子元素`);
}

// 切换所有移动端面板
function toggleAllMobilePanels() {
    if (!isMobileDevice || !mobilePanelsContainer) return;
    
    if (mobilePanelsVisible) {
        mobilePanelsContainer.classList.remove('show');
        mobilePanelsVisible = false;
    } else {
        // 显示所有面板
        mobilePanelsContainer.innerHTML = '';
        const panels = document.querySelectorAll('.control-panel');
        panels.forEach(panel => {
            const clonedPanel = panel.cloneNode(true);
            clonedPanel.classList.add('mobile-stacked');
            mobilePanelsContainer.appendChild(clonedPanel);
            rebindPanelEvents(clonedPanel, panel);
        });
        
        // 添加关闭按钮
        const closeBtn = document.createElement('button');
        closeBtn.className = 'control-button';
        closeBtn.innerHTML = '✕ 关闭';
        closeBtn.style.marginTop = '20px';
        closeBtn.addEventListener('click', () => {
            mobilePanelsContainer.classList.remove('show');
            mobilePanelsVisible = false;
        });
        mobilePanelsContainer.appendChild(closeBtn);
        
        mobilePanelsContainer.classList.add('show');
        mobilePanelsVisible = true;
    }
}

// 重新绑定面板事件
function rebindPanelEvents(clonedPanel, originalPanel) {
    console.log('开始重新绑定面板事件');
    
    // 重新绑定按钮事件
    const buttons = clonedPanel.querySelectorAll('button');
    const originalButtons = originalPanel.querySelectorAll('button');
    
    console.log(`找到 ${buttons.length} 个按钮需要绑定事件`);
    
    buttons.forEach((btn, index) => {
        if (originalButtons[index]) {
            const originalBtn = originalButtons[index];
            
            // 移除克隆按钮的所有事件监听器
            btn.replaceWith(btn.cloneNode(true));
            const newBtn = clonedPanel.querySelectorAll('button')[index];
            
            // 添加点击事件
            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log(`移动端按钮被点击: ${newBtn.textContent}`);
                
                // 直接触发原始按钮的点击事件
                originalBtn.click();
            });
            
            console.log(`已绑定按钮事件: ${newBtn.textContent}`);
        }
    });
    
    // 重新绑定选择器事件
    const selects = clonedPanel.querySelectorAll('select');
    const originalSelects = originalPanel.querySelectorAll('select');
    
    console.log(`找到 ${selects.length} 个选择器需要绑定事件`);
    
    selects.forEach((select, index) => {
        if (originalSelects[index]) {
            const originalSelect = originalSelects[index];
            
            // 同步选择器的值
            select.value = originalSelect.value;
            
            select.addEventListener('change', (e) => {
                console.log(`移动端选择器值改变: ${e.target.value}`);
                originalSelect.value = e.target.value;
                
                // 触发原始选择器的change事件
                const changeEvent = new Event('change', { bubbles: true });
                originalSelect.dispatchEvent(changeEvent);
            });
            
            console.log(`已绑定选择器事件`);
        }
    });
    
    console.log('面板事件绑定完成');
}

// 创建模型面板内容
function createModelPanelContent() {
    let modelOptions = '';
    if (availableModels && availableModels.length > 0) {
        modelOptions = '<option value="" disabled selected>- 请选择模型 -</option>';
        availableModels.forEach(model => {
            modelOptions += `<option value="${model.path}">${model.name}</option>`;
        });
    } else {
        modelOptions = '<option value="" disabled selected>暂无可用模型</option>';
    }
    
    return `
        <div class="panel-title">模型选择</div>
        <div style="text-align: center; padding: 10px; font-size: 12px; color: rgba(255,255,255,0.7);">
            请从下拉菜单选择要查看的3D模型
        </div>
        <select id="mobile-model-selector" style="width: 100%; padding: 12px 14px; background-color: rgba(60, 60, 67, 0.7); color: white; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 6px; margin-bottom: 10px; font-size: 16px; outline: none;">
            ${modelOptions}
        </select>
        <button id="mobile-refresh-models" class="control-button" style="width: 100%;">↻ 刷新模型列表</button>
    `;
}

// 创建标注面板内容
function createAnnotationPanelContent() {
    return `
        <div class="panel-title">标注控制</div>
        <div class="grid-container" style="display: grid; grid-template-columns: repeat(3, 1fr); grid-gap: 8px;">
            <button id="mobile-add-annotation" class="control-button icon-button" title="添加标注">+</button>
            <button id="mobile-toggle-visibility" class="control-button icon-button" title="隐藏/显示标注">👁️</button>
            <button id="mobile-clear-annotations" class="control-button icon-button" title="删除所有标注">−</button>
            <button id="mobile-save-annotations" class="control-button icon-button" title="保存标注数据">💾</button>
            <button id="mobile-load-annotations" class="control-button icon-button" title="加载标注数据">📂</button>
        </div>
        <div id="mobile-mode-indicator" style="color: white; margin-top: 10px; padding: 8px; background-color: rgba(0, 128, 0, 0.5); border-radius: 6px; text-align: center; font-size: 13px;">
            普通模式
        </div>
    `;
}

// 创建控制面板内容
function createControlPanelContent() {
    return `
        <div class="panel-title">模型控制</div>
        
        <div class="section-title">模型大小调整</div>
        <div style="display: flex; justify-content: space-between; gap: 10px; margin-bottom: 15px;">
            <button id="mobile-enlarge" class="control-button" style="flex: 1;">🔍 +</button>
            <button id="mobile-shrink" class="control-button" style="flex: 1;">🔍 -</button>
        </div>
        
        <div class="section-title">粒子尺寸调整</div>
        <div style="display: flex; justify-content: space-between; gap: 10px; margin-bottom: 15px;">
            <button id="mobile-decrease-point" class="control-button" style="flex: 1;">• 缩小点</button>
            <button id="mobile-increase-point" class="control-button" style="flex: 1;">◉ 放大点</button>
        </div>
        
        <div class="section-title">旋转中心控制</div>
        <div style="display: flex; justify-content: space-between; gap: 10px; margin-bottom: 15px;">
            <button id="mobile-set-center" class="control-button" style="flex: 1;">⊙ 设置中心</button>
            <button id="mobile-reset-center" class="control-button" style="flex: 1;">↻ 重置中心</button>
        </div>
        
        <button id="mobile-performance" class="control-button" style="width: 100%;">⚡ 性能优化模式</button>
    `;
}

// 绑定移动端面板事件
function bindMobilePanelEvents(panel, panelType) {
    console.log(`绑定 ${panelType} 面板事件`);
    
    if (panelType === 'model') {
        // 模型选择器事件
        const selector = panel.querySelector('#mobile-model-selector');
        if (selector) {
            selector.addEventListener('change', (e) => {
                const modelPath = e.target.value;
                if (modelPath && typeof changeModel === 'function') {
                    changeModel(modelPath);
                    
                    // 【移动端优化】选择模型后自动关闭面板
                    if (isMobileDevice && mobilePanelsContainer) {
                        mobilePanelsContainer.classList.remove('show');
                        mobilePanelsVisible = false;
                        console.log('模型已选择，自动关闭面板');
                    }
                }
            });
        }
        
        // 刷新按钮事件
        const refreshBtn = panel.querySelector('#mobile-refresh-models');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                if (typeof fetchModelList === 'function') {
                    fetchModelList();
                }
            });
        }
    } else if (panelType === 'annotation') {
        // 标注控制按钮事件
        const addBtn = panel.querySelector('#mobile-add-annotation');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                if (typeof toggleAddAnnotationMode === 'function') {
                    toggleAddAnnotationMode();
                }
            });
        }
        
        const toggleBtn = panel.querySelector('#mobile-toggle-visibility');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                if (typeof annotationsVisible !== 'undefined' && typeof toggleAnnotationsVisibility === 'function') {
                    annotationsVisible = !annotationsVisible;
                    toggleBtn.innerHTML = annotationsVisible ? '👁️' : '👁️‍🗨️';
                    toggleAnnotationsVisibility(annotationsVisible);
                }
            });
        }
        
        const clearBtn = panel.querySelector('#mobile-clear-annotations');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (typeof clearAllAnnotations === 'function') {
                    clearAllAnnotations(true);
                }
            });
        }
        
        const saveBtn = panel.querySelector('#mobile-save-annotations');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                if (typeof saveAnnotations === 'function') {
                    saveAnnotations();
                }
            });
        }
    } else if (panelType === 'control') {
        // 模型控制按钮事件
        const enlargeBtn = panel.querySelector('#mobile-enlarge');
        if (enlargeBtn) {
            enlargeBtn.addEventListener('click', () => {
                // 放大视图逻辑
                const currentDistance = camera.position.distanceTo(controls.target);
                const newDistance = currentDistance * 0.75;
                if (newDistance > controls.minDistance) {
                    const direction = camera.position.clone().sub(controls.target).normalize();
                    camera.position.copy(controls.target).add(direction.multiplyScalar(newDistance));
                    controls.update();
                }
            });
        }
        
        const shrinkBtn = panel.querySelector('#mobile-shrink');
        if (shrinkBtn) {
            shrinkBtn.addEventListener('click', () => {
                // 缩小视图逻辑
                const currentDistance = camera.position.distanceTo(controls.target);
                const newDistance = currentDistance * 1.33;
                if (newDistance < controls.maxDistance) {
                    const direction = camera.position.clone().sub(controls.target).normalize();
                    camera.position.copy(controls.target).add(direction.multiplyScalar(newDistance));
                    controls.update();
                }
            });
        }
        
        const performanceBtn = panel.querySelector('#mobile-performance');
        if (performanceBtn) {
            performanceBtn.addEventListener('click', () => {
                if (typeof togglePerformanceMode === 'function') {
                    togglePerformanceMode();
                }
            });
        }
    }
}

// 初始化Three.js场景
function init() {
    // 检测设备类型
    detectDevice();
    
    // 不再创建强制刷新按钮，因为已经在HTML中定义了
    
    // 创建移动端组件（延迟创建，确保所有面板都已创建）
    if (isMobileDevice) {
        createMobilePanelsContainer();
        // 延迟创建底部工具栏，确保所有面板都已创建
        setTimeout(() => {
            createMobileBottomToolbar();
            console.log('移动端底部工具栏已创建');
        }, 1000);
    }
    
    // 添加隐藏控制面板按钮（仅在非移动设备上显示）
    if (!isMobileDevice) {
        const hideButton = document.createElement('button');
        hideButton.classList.add('text-button');
        hideButton.style.background = 'none';
        hideButton.style.border = 'none';
        hideButton.style.color = 'white';
        hideButton.style.fontSize = '14px';
        hideButton.style.cursor = 'pointer';
        hideButton.style.padding = '5px 10px';
        hideButton.style.textShadow = '1px 1px 2px rgba(0, 0, 0, 0.8)';
        hideButton.style.transition = 'all 0.2s ease';
        hideButton.textContent = '隐藏面板';
        hideButton.title = '隐藏/显示控制面板';
        hideButton.style.position = 'absolute';
        hideButton.style.left = '200px'; // 放在调试信息按钮右边
        hideButton.style.top = '20px'; // 与其他按钮在同一水平线上
        hideButton.style.zIndex = '1000';
        
        // 用于跟踪面板是否可见
        let panelsVisible = true;
        
        hideButton.addEventListener('click', function() {
            // 获取所有控制面板
            const panels = document.querySelectorAll('.control-panel');
            const flipInfo = document.getElementById('bottom-flip-info'); // 使用id查找底部提示
            
            if (panelsVisible) {
                // 隐藏所有面板
                panels.forEach(panel => {
                    panel.style.display = 'none';
                });
                if (flipInfo) flipInfo.style.display = 'none'; // 隐藏底部提示
                hideButton.textContent = '显示面板';
                hideButton.title = '显示控制面板';
            } else {
                // 显示所有面板
                panels.forEach(panel => {
                    panel.style.display = 'block';
                });
                if (flipInfo) flipInfo.style.display = 'block'; // 显示底部提示
                hideButton.textContent = '隐藏面板';
                hideButton.title = '隐藏控制面板';
            }
            
            panelsVisible = !panelsVisible;
        });
        
        // 添加鼠标悬停效果
        hideButton.addEventListener('mouseover', function() {
            this.style.color = '#ffcc00';
        });
        
        hideButton.addEventListener('mouseout', function() {
            this.style.color = 'white';
        });
        
        document.body.appendChild(hideButton);
    }
    
    // 创建场景
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x232f3e); // 使用更深的背景色，提高模型对比度
    
    // 创建相机
    camera = new THREE.PerspectiveCamera(
        60, 
        window.innerWidth / window.innerHeight, 
        0.001,
        10000
    );
    camera.position.set(0, 0, 2);

    // 创建渲染器
    renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        powerPreference: 'high-performance'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.logarithmicDepthBuffer = true;
    container.appendChild(renderer.domElement);

    // 创建一个组来包含模型和标注
    modelGroup = new THREE.Group();
    scene.add(modelGroup);

    // 添加OrbitControls以允许用户旋转和缩放模型
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true; // 启用屏幕空间平移，使右键上下拖动执行正常的平移
    controls.minDistance = 0.01;
    controls.maxDistance = 1000;
    
    // 放宽极角限制，允许更自由的旋转（从0-PI放宽到更大范围）
    controls.minPolarAngle = -Infinity; // 完全移除上下旋转限制
    controls.maxPolarAngle = Infinity; // 完全移除上下旋转限制
    
    controls.zoomSpeed = 0.15; // 大幅降低缩放速度，使缩放更平滑
    controls.rotateSpeed = 0.7;
    
    // 添加自定义缩放控制，覆盖默认的滚轮行为
    renderer.domElement.addEventListener('wheel', onMouseWheel, { passive: false });
    
    // 设置射线投射器参数 - 默认使用严格阈值
    raycaster.params.Points.threshold = 0.001; // 严格阈值
    
    controls.enableRotate = true;
    controls.minAzimuthAngle = -Infinity;
    controls.maxAzimuthAngle = Infinity;

    // 添加光源
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // 增加环境光亮度
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 1, 1).normalize();
    scene.add(directionalLight);

    // 添加键盘控制事件以实现模型翻转
    window.addEventListener('keydown', onKeyDown, false);
    
    // 添加双击事件翻转模型
    renderer.domElement.addEventListener('dblclick', onDoubleClick, false);
    
    // 添加鼠标点击事件用于添加标注
    renderer.domElement.addEventListener('click', onClick, false);
    
    // 添加鼠标移动事件
    renderer.domElement.addEventListener('mousemove', onMouseMove, false);
    
    // 添加移动端触摸事件支持
    if (isMobileDevice) {
        renderer.domElement.addEventListener('touchstart', onTouchStart, false);
        renderer.domElement.addEventListener('touchmove', onTouchMove, false);
        renderer.domElement.addEventListener('touchend', onTouchEnd, false);
        
        // 禁用移动端的默认触摸行为
        renderer.domElement.style.touchAction = 'none';
        
        // 优化移动端的控制器设置
        controls.enableDamping = true;
        controls.dampingFactor = 0.1; // 增加阻尼以提供更平滑的体验
        controls.rotateSpeed = 0.5; // 降低旋转速度
        controls.zoomSpeed = 0.8; // 降低缩放速度
        controls.panSpeed = 0.8; // 降低平移速度
        
        // 【修复4】移动端使用更宽松的射线投射阈值，因为手指触摸面积较大
        raycaster.params.Points.threshold = 0.05;
        console.log('移动端射线投射阈值已设置为 0.05（比PC端的0.001更宽松）');
    }

    // 监听窗口大小变化
    window.addEventListener('resize', onWindowResize, false);
    
    // 添加界面提示 - 底部信息提示
    const flipInfo = document.createElement('div');
    flipInfo.id = 'bottom-flip-info'; // 添加id方便查找
    
    // 根据设备类型显示不同的操作提示
    if (isMobileDevice) {
        flipInfo.innerHTML = '单指拖动旋转，双指缩放，点击底部按钮打开控制面板';
    } else {
        flipInfo.innerHTML = '鼠标左键旋转，右键平移，滚轮缩放';
    }
    
    flipInfo.style.position = 'absolute';
    flipInfo.style.bottom = isMobileDevice ? '70px' : '10px'; // 移动端为底部工具栏留出空间
    flipInfo.style.width = '100%';
    flipInfo.style.textAlign = 'center';
    flipInfo.style.color = 'white';
    flipInfo.style.textShadow = '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000';
    flipInfo.style.padding = '5px';
    flipInfo.style.zIndex = '100';
    flipInfo.style.fontSize = isMobileDevice ? '12px' : '14px';
    flipInfo.style.fontWeight = '500';
    flipInfo.style.letterSpacing = '0.5px';
    document.body.appendChild(flipInfo);
    
    // 初始化性能模式和快速加载模式
    // 从localStorage读取快速加载模式设置
    fastLoadMode = localStorage.getItem('fastLoadMode') === 'true';
    // 确保性能模式与快速加载模式同步
    isPerformanceMode = fastLoadMode;
    dynamicLODEnabled = isPerformanceMode;
    
    // 创建颜色控制面板
    createColorControl();
    
    // 创建标注控制面板
    createAnnotationControl();
    
    // 确保加载指示器在初始化时可见
    loadingElement.style.display = 'block';
    loadingElement.textContent = '请从左下角选择要加载的模型';
    
    // 更新状态信息（如果函数存在）
    if (typeof updateLoadingStatus === 'function') {
        updateLoadingStatus('初始化完成，请从左下角选择要加载的模型');
    }
    
    // 获取模型列表并创建模型选择控制面板
    fetchModelList();
}

// 从服务器获取模型列表
function fetchModelList() {
    // 显示加载指示器
    loadingElement.style.display = 'block';
    loadingElement.textContent = '正在获取模型列表...';
    
    // 更新状态信息（如果函数存在）
    if (typeof updateLoadingStatus === 'function') {
        updateLoadingStatus('正在获取模型列表...');
    }
    
    // 发送API请求获取模型列表
    fetch('/api/models?t=' + new Date().getTime())  // 添加时间戳防止缓存
        .then(response => {
            if (!response.ok) {
                throw new Error('获取模型列表失败');
            }
            return response.json();
        })
        .then(models => {
            // 调试：输出接收到的模型列表
            console.log('API返回的模型列表:', JSON.stringify(models));
            
            // 更新模型列表
            availableModels = models;
            
            // 调试：输出availableModels
            console.log('更新后的availableModels:', JSON.stringify(availableModels));
            
            // 更新状态信息
            if (typeof updateLoadingStatus === 'function') {
            if (models.length > 0) {
                    updateLoadingStatus('找到 ' + models.length + ' 个模型，请从左下角选择');
                } else {
                    updateLoadingStatus('没有找到模型文件');
                }
            }
            
            // 显示提示，告知用户从左下角选择模型
            if (models.length > 0) {
                loadingElement.textContent = "请从左下角选择要加载的模型";
                if (typeof updateLoadingStatus === "function") {
                    updateLoadingStatus("请从左下角选择要加载的模型");
                }
            } else {
                // 如果没有模型，显示提示
                loadingElement.textContent = "没有找到PLY模型，请将模型文件放入models文件夹";
                if (typeof updateLoadingStatus === "function") {
                    updateLoadingStatus("没有找到模型文件");
                }
                
                // 添加调试信息
                console.error("未找到任何模型文件，请检查models文件夹");
                if (typeof addDebugInfo === "function") {
                    addDebugInfo("错误：未找到任何模型文件，请检查models文件夹是否存在并包含.ply文件");
                }
            }
            
            // 创建模型选择控制面板
            createModelSelector();
        })
        .catch(error => {
            console.error('获取模型列表出错:', error);
            loadingElement.textContent = '获取模型列表失败，尝试直接检查模型文件...';
            
            // 显示API失败的辅助信息
            if (typeof showApiFailureHelp === 'function') {
                showApiFailureHelp();
            }
            
            // 确保使用空数组，不要使用任何硬编码的默认值
            availableModels = [];
            
            // 显示提示，告知用户从左下角选择模型
            loadingElement.textContent = "API请求失败，请从左下角选择模型";
            
            if (typeof updateLoadingStatus === "function") {
                updateLoadingStatus("API请求失败，请从左下角选择模型");
            }
            console.log('尝试直接加载models/temperature_sensor.ply');
            loadingElement.textContent = '正在尝试加载默认模型...';
            
            if (typeof updateLoadingStatus === 'function') {
                updateLoadingStatus('API请求失败，尝试直接加载模型...');
            }
            
            // 直接硬编码加载默认模型，对于http-server特别有用
            currentModelPath = 'models/temperature_sensor.ply';
            
            // 手动添加到模型列表，确保下拉菜单正确显示
            availableModels = [
                { name: '温度传感器', path: 'models/temperature_sensor.ply' }
            ];
            
            // 尝试检查是否有第二个模型
            fetch('models/009.ply', { method: 'HEAD' })
                .then(response => {
                    if (response.ok) {
                        console.log('找到第二个模型：009.ply');
                        availableModels.push({
                            name: '009',
                            path: 'models/009.ply'
                        });
                        
                        if (typeof updateLoadingStatus === 'function') {
                            updateLoadingStatus('已找到两个模型文件，请从左下角选择');
                        }
                    } else {
                        if (typeof updateLoadingStatus === 'function') {
                            updateLoadingStatus('仅找到一个模型文件，请从左下角选择可用模型');
                        }
                    }
                    // 无论如何都创建选择器
                createModelSelector();
                })
                .catch(err => {
                    console.error('检查第二个模型失败:', err);
                    if (typeof updateLoadingStatus === 'function') {
                        updateLoadingStatus('无法检查其他模型文件，请从左下角选择可用模型');
            }
                    // 无论如何都创建选择器
                    createModelSelector();
                });
        });
}

// 创建模型选择控制面板
function createModelSelector() {
    // 调试：在创建选择器前输出availableModels
    console.log('创建选择器前的availableModels:', JSON.stringify(availableModels));
    
    // 如果没有模型，不创建选择器
    if (availableModels.length === 0) {
        console.log('没有可用模型，不创建选择器');
        if (typeof updateLoadingStatus === 'function') {
            updateLoadingStatus('未找到任何模型，请将模型文件放入models文件夹');
        }
        return;
    }
    
    // 调试：输出选择器将包含的模型数量
    console.log('选择器将包含', availableModels.length, '个模型');
    
    // 移除旧的选择面板（如果存在）
    const existingPanel = document.querySelector('.control-panel.model-selector');
    if (existingPanel) {
        existingPanel.parentNode.removeChild(existingPanel);
    }
    
    const modelPanel = document.createElement('div');
    modelPanel.classList.add('control-panel', 'model-selector');
    modelPanel.style.position = 'absolute';
    modelPanel.style.bottom = '10px'; // 距离底部增加一点间距
    modelPanel.style.left = '20px'; // 距离左侧增加一点间距
    modelPanel.style.zIndex = '100';
    modelPanel.style.minWidth = '220px';
    
    // 在移动端隐藏原始面板
    if (isMobileDevice) {
        modelPanel.style.display = 'none';
    }
    
    // 添加标题
    const title = document.createElement('div');
    title.classList.add('panel-title');
    title.textContent = '模型选择';
    modelPanel.appendChild(title);
    
    // 创建选择器
    const selector = document.createElement('select');
    selector.style.width = '100%';
    selector.style.padding = '8px 10px';
    selector.style.backgroundColor = 'rgba(60, 60, 67, 0.7)';
    selector.style.color = 'white';
    selector.style.border = '1px solid rgba(255, 255, 255, 0.2)';
    selector.style.borderRadius = '6px';
    selector.style.marginBottom = '10px';
    selector.style.fontSize = '13px';
    selector.style.outline = 'none';
    selector.style.appearance = 'none';
    selector.style.backgroundImage = 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'white\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'%3e%3c/polyline%3e%3c/svg%3e")';
    selector.style.backgroundRepeat = 'no-repeat';
    selector.style.backgroundPosition = 'right 10px center';
    selector.style.backgroundSize = '15px';
    
    // 添加选项
    // 添加默认"请选择模型"选项
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "- 请选择模型 -";
    defaultOption.selected = true;
    defaultOption.disabled = true;
    selector.appendChild(defaultOption);
    
    // 调试：逐个输出添加的模型选项
    console.log('开始添加', availableModels.length, '个模型选项');
    availableModels.forEach((model, index) => {
        console.log(`添加第${index+1}个模型:`, JSON.stringify(model));
        const option = document.createElement('option');
        option.value = model.path;
        option.textContent = model.name;
        if (model.path === currentModelPath) {
            option.selected = true;
            console.log(`模型 ${model.name} 被选中`);
        }
        selector.appendChild(option);
        console.log(`模型 ${model.name} 已添加到选择器`);
    });
    console.log('模型选项添加完成，选择器中有', selector.options.length, '个选项');
    
    // 添加刷新按钮
    const refreshBtn = document.createElement('button');
    refreshBtn.classList.add('control-button');
    refreshBtn.innerHTML = '↻ 刷新模型列表';
    refreshBtn.title = '刷新可用模型列表';
    refreshBtn.addEventListener('click', function() {
        // 更新状态信息
        if (typeof updateLoadingStatus === 'function') {
            updateLoadingStatus('正在刷新模型列表...');
        }
        
        // 移除旧的选择面板
        if (modelPanel.parentNode) {
            modelPanel.parentNode.removeChild(modelPanel);
        }
        
        // 重新获取模型列表
        fetchModelList();
    });
    
    // 添加选择事件
    selector.addEventListener("change", function() {
        const modelPath = this.value;
        
        // 如果没有选择有效的模型，则退出
        if (!modelPath) return;
        
        // 更新状态信息
        if (typeof updateLoadingStatus === 'function') {
            updateLoadingStatus('正在切换到新模型...');
        }
        
        // 在切换前确认是否保存标注
        if (annotations.length > 0) {
            if (confirm('切换模型会丢失当前标注，是否先保存当前标注？')) {
                saveAnnotations();
                // 清空当前标注后加载新模型
                clearAllAnnotations(false); // 传入false参数表示不显示确认对话框
                changeModel(modelPath);
            } else {
                // 直接切换模型
                clearAllAnnotations(false);
                changeModel(modelPath);
            }
        } else {
            // 如果没有标注，直接切换模型
            changeModel(modelPath);
        }
    });
    
    // 添加提示信息
    const tipInfo = document.createElement('div');
    tipInfo.textContent = '请从下拉菜单选择要查看的3D模型';
    tipInfo.style.fontSize = '12px';
    tipInfo.style.color = 'rgba(255, 255, 255, 0.7)';
    tipInfo.style.marginBottom = '8px';
    tipInfo.style.textAlign = 'center';
    
    modelPanel.appendChild(tipInfo);
    modelPanel.appendChild(selector);
    modelPanel.appendChild(refreshBtn);
    document.body.appendChild(modelPanel);
    
    // 更新状态信息
    if (typeof updateLoadingStatus === 'function') {
        updateLoadingStatus('模型选择器已创建，请选择一个模型');
    }
    
    // 如果有模型但没有选中任何模型，隐藏加载指示器
    if (availableModels.length > 0 && !currentModelPath) {
        loadingElement.textContent = '请从左下角选择要加载的模型';
    }
}

// 切换模型
function changeModel(modelPath) {
    currentModelPath = modelPath;
    
    // 显示加载指示器
    loadingElement.style.display = 'block';
    loadingElement.textContent = '正在加载模型...';
    
    // 更新状态信息
    if (typeof updateLoadingStatus === 'function') {
        updateLoadingStatus('正在加载模型: ' + modelPath.split('/').pop());
    }
    
    // 移除旧模型
    if (modelMesh) {
        modelGroup.remove(modelMesh);
        // 释放内存
        if (modelMesh.geometry) modelMesh.geometry.dispose();
        if (modelMesh.material) {
            if (Array.isArray(modelMesh.material)) {
                modelMesh.material.forEach(material => material.dispose());
            } else {
                modelMesh.material.dispose();
            }
        }
        
        // 更新状态信息
        if (typeof updateLoadingStatus === 'function') {
            updateLoadingStatus('已移除旧模型，正在加载新模型...');
        }
    }
    
    // 重置模型组旋转
    modelGroup.rotation.set(0, 0, 0);
    
    // 重置旋转中心到模型中心
    if (centerMarker) {
        modelGroup.remove(centerMarker);
        centerMarker = null;
    }
    controls.target.set(0, 0, 0);
    
    // 加载新模型
    loadModel(modelPath);
}

// 创建颜色控制面板
function createColorControl() {
    const controlPanel = document.createElement('div');
    controlPanel.classList.add('control-panel');
    controlPanel.style.position = 'absolute';
    controlPanel.style.top = '83px'; // 从20px改为70px，避免与网页标题重叠
    controlPanel.style.right = '20px';
    controlPanel.style.zIndex = '100';
    controlPanel.style.width = '260px';
    
    // 在移动端隐藏原始面板
    if (isMobileDevice) {
        controlPanel.style.display = 'none';
    }
    
    // 添加标题
    const title = document.createElement('div');
    title.classList.add('panel-title');
    title.textContent = '模型控制';
    controlPanel.appendChild(title);
    
    // 创建模型大小调整部分
    const sizeTitle = document.createElement('div');
    sizeTitle.classList.add('section-title');
    sizeTitle.textContent = '模型大小调整';
    controlPanel.appendChild(sizeTitle);
    
    // 创建按钮网格容器 - 使用flex布局代替grid以更好地控制布局
    const sizeButtonsContainer = document.createElement('div');
    sizeButtonsContainer.style.display = 'flex';
    sizeButtonsContainer.style.justifyContent = 'space-between'; // 两侧对齐，按钮填满空间
    sizeButtonsContainer.style.gap = '10px'; // 控制按钮间距
    sizeButtonsContainer.style.marginBottom = '15px';
    
    // 放大按钮 - 只使用图标，但占据更多空间
    const enlargeBtn = createIconButton('🔍 +', '放大视图 (拉近相机)');
    enlargeBtn.style.flex = '1'; // 使按钮填充可用空间
    enlargeBtn.style.width = 'auto'; // 覆盖icon-button的固定宽度
    enlargeBtn.addEventListener('click', function() {
        // 获取当前相机到目标点的距离
        const currentDistance = camera.position.distanceTo(controls.target);
        // 使用更平滑的缩放比例（乘以0.75而不是0.5）
        const newDistance = currentDistance * 0.75;
        // 确保不会太近
        if (newDistance > controls.minDistance) {
            // 获取从目标点到相机的方向
            const direction = camera.position.clone().sub(controls.target).normalize();
            // 设置新的相机位置
            camera.position.copy(controls.target).add(direction.multiplyScalar(newDistance));
            controls.update();
        }
    });
    sizeButtonsContainer.appendChild(enlargeBtn);
    
    // 缩小按钮 - 只使用图标，但占据更多空间
    const shrinkBtn = createIconButton('🔍 -', '缩小视图 (推远相机)');
    shrinkBtn.style.flex = '1'; // 使按钮填充可用空间
    shrinkBtn.style.width = 'auto'; // 覆盖icon-button的固定宽度
    shrinkBtn.addEventListener('click', function() {
        // 获取当前相机到目标点的距离
        const currentDistance = camera.position.distanceTo(controls.target);
        // 使用更平滑的缩放比例（乘以1.33而不是2）
        const newDistance = currentDistance * 1.33;
        // 确保不会太远
        if (newDistance < controls.maxDistance) {
            // 获取从目标点到相机的方向
            const direction = camera.position.clone().sub(controls.target).normalize();
            // 设置新的相机位置
            camera.position.copy(controls.target).add(direction.multiplyScalar(newDistance));
            controls.update();
        }
    });
    sizeButtonsContainer.appendChild(shrinkBtn);
    
    controlPanel.appendChild(sizeButtonsContainer);
    
    // 创建点云大小调整部分
    const pointSizeTitle = document.createElement('div');
    pointSizeTitle.classList.add('section-title');
    pointSizeTitle.textContent = '粒子尺寸调整';
    controlPanel.appendChild(pointSizeTitle);
    
    // 创建点云大小按钮容器
    const pointSizeButtonsContainer = document.createElement('div');
    pointSizeButtonsContainer.style.display = 'flex';
    pointSizeButtonsContainer.style.justifyContent = 'space-between';
    pointSizeButtonsContainer.style.gap = '10px';
    pointSizeButtonsContainer.style.marginBottom = '15px';
    
    // 减小点大小按钮
    const decreasePointBtn = document.createElement('button');
    decreasePointBtn.classList.add('control-button');
    decreasePointBtn.innerHTML = '• 缩小点';
    decreasePointBtn.style.flex = '1';
    decreasePointBtn.style.width = 'auto';
    decreasePointBtn.addEventListener('click', function() {
        if (modelMesh && modelMesh.material) {
            const currentSize = modelMesh.material.size;
            const newSize = Math.max(0.001, currentSize * 0.8);
            modelMesh.material.size = newSize;
            console.log('点云大小已调整为:', newSize);
        }
    });
    pointSizeButtonsContainer.appendChild(decreasePointBtn);
    
    // 增大点大小按钮
    const increasePointBtn = document.createElement('button');
    increasePointBtn.classList.add('control-button');
    increasePointBtn.innerHTML = '◉ 放大点';
    increasePointBtn.style.flex = '1';
    increasePointBtn.style.width = 'auto';
    increasePointBtn.addEventListener('click', function() {
        if (modelMesh && modelMesh.material) {
            const currentSize = modelMesh.material.size;
            const newSize = Math.min(0.2, currentSize * 1.25);
            modelMesh.material.size = newSize;
            console.log('点云大小已调整为:', newSize);
        }
    });
    pointSizeButtonsContainer.appendChild(increasePointBtn);
    
    controlPanel.appendChild(pointSizeButtonsContainer);
    
    // 创建旋转中心控制部分
    const centerTitle = document.createElement('div');
    centerTitle.classList.add('section-title');
    centerTitle.textContent = '旋转中心控制';
    controlPanel.appendChild(centerTitle);
    
    // 创建旋转中心按钮容器 - 使用与大小调整相同的布局
    const centerButtonsContainer = document.createElement('div');
    centerButtonsContainer.style.display = 'flex';
    centerButtonsContainer.style.justifyContent = 'space-between';
    centerButtonsContainer.style.gap = '10px';
    centerButtonsContainer.style.marginBottom = '15px';
    
    // 设置旋转中心按钮
    const setCenterBtn = document.createElement('button');
    setCenterBtn.classList.add('control-button');
    setCenterBtn.id = 'set-center-btn';
    setCenterBtn.innerHTML = '⊙ 设置中心';
    setCenterBtn.style.flex = '1';
    setCenterBtn.style.width = 'auto';
    setCenterBtn.addEventListener('click', function() {
        toggleSetCenterMode();
    });
    centerButtonsContainer.appendChild(setCenterBtn);
    
    // 重置旋转中心按钮
    const resetCenterBtn = document.createElement('button');
    resetCenterBtn.classList.add('control-button');
    resetCenterBtn.innerHTML = '↻ 重置中心';
    resetCenterBtn.style.flex = '1';
    resetCenterBtn.style.width = 'auto';
    resetCenterBtn.addEventListener('click', function() {
        resetRotationCenter();
    });
    centerButtonsContainer.appendChild(resetCenterBtn);
    
    // 添加按钮容器到控制面板
    controlPanel.appendChild(centerButtonsContainer);
    
    // 创建性能优化按钮
    const performanceBtn = document.createElement('button');
    performanceBtn.id = 'performance-btn'; // 添加ID便于引用
    performanceBtn.classList.add('control-button');
    // 根据当前状态设置初始文本和样式
    if (isPerformanceMode) {
        performanceBtn.innerHTML = '🔄 关闭性能模式';
        performanceBtn.style.backgroundColor = '#ff5722';
    } else {
        performanceBtn.innerHTML = '⚡ 性能优化模式';
    }
    performanceBtn.addEventListener('click', function() {
        togglePerformanceMode();
    });
    controlPanel.appendChild(performanceBtn);
    
    document.body.appendChild(controlPanel);
}

// 切换视角方向
function changeView(positionArray) {
    const [x, y, z] = positionArray;
    
    // 平滑过渡到新位置
    const startPosition = camera.position.clone();
    const endPosition = new THREE.Vector3(x, y, z);
    const startTime = performance.now();
    const duration = 500; // 500毫秒动画
    
    function animateCamera() {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // 使用平滑缓动函数
        const easeProgress = 1 - Math.pow(1 - progress, 3); // 缓出效果
        
        camera.position.lerpVectors(startPosition, endPosition, easeProgress);
        camera.lookAt(0, 0, 0);
        
        if (progress < 1) {
            requestAnimationFrame(animateCamera);
        } else {
            // 动画完成，确保到达最终位置
            camera.position.copy(endPosition);
            camera.lookAt(0, 0, 0);
            controls.update();
        }
    }
    
    animateCamera();
    
    // 更新控制器
    controls.update();
    
    // 更新状态信息
    if (typeof updateLoadingStatus === 'function') {
        updateLoadingStatus('已切换到' + (positionArray[2] > 0 ? '正面' : '背面') + '视角');
    }
}

// 创建标注控制面板
function createAnnotationControl() {
    // 【移动端禁用】移动端完全不创建标注控制面板
    if (isMobileDevice) {
        console.log('移动端已禁用标注功能，不创建标注控制面板');
        return;
    }
    
    const annotationPanel = document.createElement('div');
    annotationPanel.classList.add('control-panel');
    annotationPanel.style.position = 'absolute';
    annotationPanel.style.top = '83px'; // 从20px改为70px，避免与网页标题重叠
    annotationPanel.style.left = '20px';
    annotationPanel.style.zIndex = '100';
    annotationPanel.style.minWidth = '220px'; // 设置与模型选择面板相同的宽度
    
    // 添加标题
    const title = document.createElement('div');
    title.classList.add('panel-title');
    title.textContent = '标注控制';
    annotationPanel.appendChild(title);
    
    // 创建按钮容器 - 采用网格布局
    const buttonContainer = document.createElement('div');
    buttonContainer.classList.add('grid-container');
    buttonContainer.style.gridTemplateColumns = 'repeat(3, 1fr)';
    buttonContainer.style.width = '100%';
    
    // 添加标注按钮（加号图标）
    const addBtn = createIconButton('+', '添加标注');
    addBtn.style.fontSize = '20px';
    addBtn.addEventListener('click', function() {
        toggleAddAnnotationMode();
    });
    buttonContainer.appendChild(addBtn);
    
    // 隐藏/显示标注按钮（眼睛图标）
    const toggleVisibilityBtn = createIconButton('👁️', '隐藏/显示标注');
    toggleVisibilityBtn.id = 'toggle-visibility-btn';
    toggleVisibilityBtn.addEventListener('click', function() {
        annotationsVisible = !annotationsVisible;
        toggleVisibilityBtn.innerHTML = annotationsVisible ? '👁️' : '👁️‍🗨️';
        toggleVisibilityBtn.title = annotationsVisible ? '隐藏标注' : '显示标注';
        toggleAnnotationsVisibility(annotationsVisible);
    });
    buttonContainer.appendChild(toggleVisibilityBtn);
    
    // 删除所有标注按钮（减号图标）
    const clearBtn = createIconButton('−', '删除所有标注');
    clearBtn.style.fontSize = '20px';
    clearBtn.addEventListener('click', function() {
        clearAllAnnotations(true);
    });
    buttonContainer.appendChild(clearBtn);
    
    // 保存标注按钮（保存图标）
    const saveBtn = createIconButton('💾', '保存标注数据');
    saveBtn.addEventListener('click', function() {
        saveAnnotations();
    });
    buttonContainer.appendChild(saveBtn);
    
    // 加载标注按钮（上传图标）
    const loadBtn = createIconButton('📂', '加载标注数据');
    loadBtn.addEventListener('click', function() {
        document.getElementById('annotation-file').click();
    });
    buttonContainer.appendChild(loadBtn);
    
    annotationPanel.appendChild(buttonContainer);
    
    // 添加文件输入框（隐藏）
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'annotation-file';
    fileInput.style.display = 'none';
    fileInput.accept = '.json';
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = JSON.parse(e.target.result);
                    loadAnnotationsFromData(data);
                } catch (error) {
                    alert('加载标注数据失败：' + error.message);
                }
            };
            reader.readAsText(file);
        }
    });
    annotationPanel.appendChild(fileInput);
    
    // 模式状态指示
    const modeIndicator = document.createElement('div');
    modeIndicator.id = 'mode-indicator';
    modeIndicator.textContent = '普通模式';
    modeIndicator.style.color = 'white';
    modeIndicator.style.marginTop = '10px';
    modeIndicator.style.padding = '8px';
    modeIndicator.style.backgroundColor = 'rgba(0, 128, 0, 0.5)';
    modeIndicator.style.borderRadius = '6px';
    modeIndicator.style.textAlign = 'center';
    modeIndicator.style.fontSize = '13px';
    modeIndicator.style.fontWeight = '500';
    modeIndicator.style.letterSpacing = '0.3px';
    annotationPanel.appendChild(modeIndicator);
    
    document.body.appendChild(annotationPanel);
}

// 创建图标按钮的辅助函数
function createIconButton(icon, tooltip) {
    const button = document.createElement('button');
    button.classList.add('control-button', 'icon-button');
    button.innerHTML = icon;
    button.title = tooltip;
    
    return button;
}

// 切换添加标注模式
function toggleAddAnnotationMode() {
    // 【移动端禁用】移动端不允许使用标注功能
    if (isMobileDevice) {
        alert('标注功能在移动端已禁用，请使用电脑端进行标注操作。');
        return;
    }
    
    isAddingAnnotation = !isAddingAnnotation;
    const modeIndicator = document.getElementById('mode-indicator');
    
    if (isAddingAnnotation) {
        modeIndicator.textContent = '添加标注模式 - 点击模型添加标注';
        modeIndicator.style.backgroundColor = 'rgba(255, 59, 48, 0.6)';
        controls.enabled = false; // 禁用控制器以便于点击添加标注
    } else {
        modeIndicator.textContent = '普通模式';
        modeIndicator.style.backgroundColor = 'rgba(0, 128, 0, 0.5)';
        controls.enabled = true; // 重新启用控制器
    }
}

// 切换标注可见性
function toggleAnnotationsVisibility(visible) {
    annotations.forEach(annotation => {
        // 显示/隐藏HTML元素
        if (annotation.element) {
            annotation.element.style.display = visible ? 'block' : 'none';
        }
        // 显示/隐藏连接线
        if (annotation.line) {
            annotation.line.style.display = visible ? 'block' : 'none';
        }
        // 显示/隐藏标记点
        if (annotation.marker) {
            annotation.marker.visible = visible;
        }
    });
}

// 清除所有标注，showConfirm参数决定是否显示确认对话框
function clearAllAnnotations(showConfirm = true) {
    if (showConfirm && !confirm('确定要删除所有标注吗？')) {
        return; // 用户取消操作
    }
    
    // 移除所有标注元素
    annotations.forEach(annotation => {
        // 移除HTML元素
        if (annotation.element && annotation.element.parentNode) {
            annotation.element.parentNode.removeChild(annotation.element);
        }
        // 移除连接线
        if (annotation.line && annotation.line.parentNode) {
            annotation.line.parentNode.removeChild(annotation.line);
        }
        // 从场景中移除标记点
        if (annotation.marker) {
            modelGroup.remove(annotation.marker);
        }
    });
    
    // 清空数组
    annotations = [];
}

// 保存标注数据
function saveAnnotations() {
    if (annotations.length === 0) {
        alert('没有标注数据可保存！');
        return;
    }
    
    // 构建标注数据
    const annotationData = annotations.map(annotation => {
        return {
            position: {
                x: annotation.position.x,
                y: annotation.position.y,
                z: annotation.position.z
            },
            content: annotation.element.textContent,
            modelPath: currentModelPath // 记录关联的模型路径
        };
    });
    
    // 提取当前模型名作为文件名一部分
    const modelName = currentModelPath.split('/').pop().replace('.ply', '');
    
    // 创建下载链接
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(annotationData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `annotations_${modelName}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);
}

// 从数据加载标注
function loadAnnotationsFromData(data) {
    // 检查标注是否与当前模型匹配
    const firstAnnotationModelPath = data[0]?.modelPath;
    if (firstAnnotationModelPath && firstAnnotationModelPath !== currentModelPath) {
        if (!confirm(`注意：这些标注数据是为"${firstAnnotationModelPath}"创建的，当前模型是"${currentModelPath}"。继续加载可能会导致标注位置不正确。是否继续？`)) {
            return;
        }
    }
    
    // 首先清除现有标注
    clearAllAnnotations(false);
    
    // 创建新标注
    data.forEach(item => {
        const position = new THREE.Vector3(item.position.x, item.position.y, item.position.z);
        addAnnotationAt(position, item.content);
    });
    
    alert(`成功加载 ${data.length} 个标注！`);
}

// 【修复6】触摸点可视化调试工具（可选，用于开发调试）
function showTouchDebugPoint(clientX, clientY, color = 'red') {
    const dot = document.createElement('div');
    dot.style.cssText = `
        position: fixed;
        left: ${clientX}px;
        top: ${clientY}px;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: ${color};
        opacity: 0.7;
        pointer-events: none;
        z-index: 10000;
        transform: translate(-50%, -50%);
        border: 2px solid white;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
    `;
    document.body.appendChild(dot);
    
    // 2秒后淡出并移除
    setTimeout(() => {
        dot.style.transition = 'opacity 0.5s';
        dot.style.opacity = '0';
        setTimeout(() => dot.remove(), 500);
    }, 2000);
}

// 【修复2】创建自定义输入对话框，替代prompt()以避免页面重排
function showCustomPrompt(message, defaultValue = '') {
    return new Promise((resolve) => {
        // 保存当前滚动位置
        const scrollX = window.scrollX;
        const scrollY = window.scrollY;
        
        // 创建遮罩层
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(5px);
        `;
        
        // 创建对话框容器
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: rgba(28, 28, 30, 0.95);
            border-radius: 12px;
            padding: 20px;
            max-width: 90%;
            width: 400px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.2);
        `;
        
        // 创建消息文本
        const messageText = document.createElement('div');
        messageText.textContent = message;
        messageText.style.cssText = `
            color: white;
            font-size: 16px;
            margin-bottom: 15px;
            text-align: center;
        `;
        
        // 创建输入框
        const input = document.createElement('input');
        input.type = 'text';
        input.value = defaultValue;
        input.style.cssText = `
            width: 100%;
            padding: 12px;
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 6px;
            background: rgba(60, 60, 67, 0.7);
            color: white;
            font-size: 16px;
            margin-bottom: 15px;
            box-sizing: border-box;
            outline: none;
        `;
        
        // 创建按钮容器
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            display: flex;
            gap: 10px;
            justify-content: flex-end;
        `;
        
        // 创建取消按钮
        const cancelButton = document.createElement('button');
        cancelButton.textContent = '取消';
        cancelButton.style.cssText = `
            padding: 10px 20px;
            border: none;
            border-radius: 6px;
            background: rgba(99, 99, 102, 0.7);
            color: white;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s ease;
        `;
        
        // 创建确认按钮
        const confirmButton = document.createElement('button');
        confirmButton.textContent = '确认';
        confirmButton.style.cssText = `
            padding: 10px 20px;
            border: none;
            border-radius: 6px;
            background: rgba(0, 122, 255, 0.8);
            color: white;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s ease;
        `;
        
        // 组装对话框
        buttonContainer.appendChild(cancelButton);
        buttonContainer.appendChild(confirmButton);
        dialog.appendChild(messageText);
        dialog.appendChild(input);
        dialog.appendChild(buttonContainer);
        overlay.appendChild(dialog);
        
        // 添加到页面
        document.body.appendChild(overlay);
        
        // 聚焦输入框并选中内容
        setTimeout(() => {
            input.focus();
            input.select();
        }, 100);
        
        // 处理确认
        const handleConfirm = () => {
            const value = input.value.trim();
            document.body.removeChild(overlay);
            // 恢复滚动位置
            window.scrollTo(scrollX, scrollY);
            resolve(value || null);
        };
        
        // 处理取消
        const handleCancel = () => {
            document.body.removeChild(overlay);
            // 恢复滚动位置
            window.scrollTo(scrollX, scrollY);
            resolve(null);
        };
        
        // 绑定事件
        confirmButton.addEventListener('click', handleConfirm);
        cancelButton.addEventListener('click', handleCancel);
        
        // 回车键确认
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleConfirm();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancel();
            }
        });
        
        // 点击遮罩层取消
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                handleCancel();
            }
        });
        
        // 添加悬停效果
        confirmButton.addEventListener('mouseenter', () => {
            confirmButton.style.background = 'rgba(0, 122, 255, 1)';
        });
        confirmButton.addEventListener('mouseleave', () => {
            confirmButton.style.background = 'rgba(0, 122, 255, 0.8)';
        });
        
        cancelButton.addEventListener('mouseenter', () => {
            cancelButton.style.background = 'rgba(99, 99, 102, 0.9)';
        });
        cancelButton.addEventListener('mouseleave', () => {
            cancelButton.style.background = 'rgba(99, 99, 102, 0.7)';
        });
    });
}

// 鼠标移动事件处理
function onMouseMove(event) {
    // 获取渲染器画布的准确位置和尺寸
    const rect = renderer.domElement.getBoundingClientRect();
    
    // 计算相对于画布的坐标
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;
    
    // 转换为标准化设备坐标 (NDC)
    mouse.x = (canvasX / rect.width) * 2 - 1;
    mouse.y = -(canvasY / rect.height) * 2 + 1;
}

// 触摸事件处理
let touchStartTime = 0;
let touchStartPosition = { x: 0, y: 0 };

function onTouchStart(event) {
    // 【修复5】防止默认的触摸行为干扰坐标计算
    event.preventDefault();
    
    touchStartTime = Date.now();
    if (event.touches.length === 1) {
        const touch = event.touches[0];
        touchStartPosition.x = touch.clientX;
        touchStartPosition.y = touch.clientY;
        
        // 获取渲染器画布的准确位置和尺寸
        const rect = renderer.domElement.getBoundingClientRect();
        
        // 计算相对于画布的坐标
        const canvasX = touch.clientX - rect.left;
        const canvasY = touch.clientY - rect.top;
        
        // 转换为标准化设备坐标 (NDC)
        mouse.x = (canvasX / rect.width) * 2 - 1;
        mouse.y = -(canvasY / rect.height) * 2 + 1;
        
        console.log(`触摸开始 - 触摸点: (${touch.clientX}, ${touch.clientY}), 画布相对: (${canvasX}, ${canvasY}), NDC: (${mouse.x.toFixed(3)}, ${mouse.y.toFixed(3)})`);
    }
}

function onTouchMove(event) {
    event.preventDefault(); // 防止页面滚动
    
    if (event.touches.length === 1) {
        const touch = event.touches[0];
        
        // 获取渲染器画布的准确位置和尺寸
        const rect = renderer.domElement.getBoundingClientRect();
        
        // 计算相对于画布的坐标
        const canvasX = touch.clientX - rect.left;
        const canvasY = touch.clientY - rect.top;
        
        // 转换为标准化设备坐标 (NDC)
        mouse.x = (canvasX / rect.width) * 2 - 1;
        mouse.y = -(canvasY / rect.height) * 2 + 1;
    }
}

function onTouchEnd(event) {
    const touchEndTime = Date.now();
    const touchDuration = touchEndTime - touchStartTime;
    
    // 如果是短暂的触摸（类似点击）
    if (touchDuration < 300 && event.changedTouches.length === 1) {
        const touch = event.changedTouches[0];
        const touchEndPosition = { x: touch.clientX, y: touch.clientY };
        
        // 检查触摸位置是否移动很少（类似点击）
        const distance = Math.sqrt(
            Math.pow(touchEndPosition.x - touchStartPosition.x, 2) +
            Math.pow(touchEndPosition.y - touchStartPosition.y, 2)
        );
        
        if (distance < 10) { // 移动距离小于10像素认为是点击
            // 获取渲染器画布的准确位置和尺寸
            const rect = renderer.domElement.getBoundingClientRect();
            
            // 计算相对于画布的坐标
            const canvasX = touch.clientX - rect.left;
            const canvasY = touch.clientY - rect.top;
            
            // 转换为标准化设备坐标 (NDC)
            mouse.x = (canvasX / rect.width) * 2 - 1;
            mouse.y = -(canvasY / rect.height) * 2 + 1;
            
            console.log(`触摸结束 - 触摸点: (${touch.clientX}, ${touch.clientY}), 画布相对: (${canvasX}, ${canvasY}), NDC: (${mouse.x.toFixed(3)}, ${mouse.y.toFixed(3)})`);
            
            // 【修复6】显示触摸点调试指示器（可选，用于调试）
            // 如果需要调试触摸位置，取消下面这行的注释
            // showTouchDebugPoint(touch.clientX, touch.clientY, 'lime');
            
            // 【修复1】更新射线投射器方向（关键修复！）
            raycaster.setFromCamera(mouse, camera);
            
            // 触发点击事件处理
            // 【移动端禁用】移动端不处理标注功能
            if (isAddingAnnotation && !isMobileDevice) {
                handleAnnotationClick();
            } else if (isSettingCenter) {
                handleCenterClick();
            }
        }
    }
}

// 点击事件处理
function onClick(event) {
    // 防止双击事件同时触发
    event.preventDefault();
    
    // 获取渲染器画布的准确位置和尺寸
    const rect = renderer.domElement.getBoundingClientRect();
    
    // 计算相对于画布的坐标
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;
    
    // 转换为标准化设备坐标 (NDC)
    mouse.x = (canvasX / rect.width) * 2 - 1;
    mouse.y = -(canvasY / rect.height) * 2 + 1;
    
    console.log(`鼠标点击 - 点击位置: (${event.clientX}, ${event.clientY}), 画布相对: (${canvasX}, ${canvasY}), NDC: (${mouse.x.toFixed(3)}, ${mouse.y.toFixed(3)})`);
    
    // 设置严格阈值进行第一次检测
    raycaster.params.Points.threshold = 0.001;
    
    // 更新射线投射器
    raycaster.setFromCamera(mouse, camera);
    
    // 如果在添加标注模式
    if (isAddingAnnotation) {
        handleAnnotationClick();
    } 
    // 如果在设置旋转中心模式
    else if (isSettingCenter) {
        handleCenterClick();
    }
}

// 处理添加标注模式的点击
async function handleAnnotationClick() {
    // 第一阶段：使用严格阈值检测与模型的交点
    raycaster.params.Points.threshold = 0.001; // 严格阈值
    let intersects = raycaster.intersectObject(modelMesh, true);
    
    // 如果没有检测到交点，使用厚射线策略
    if (intersects.length === 0) {
        console.log("严格阈值(0.001)下未检测到交点，尝试厚射线检测...");
        
        // 暂时增大阈值模拟厚射线
        raycaster.params.Points.threshold = 0.05; // 增加阈值以提高检测范围
        
        // 使用厚射线再次检测
        intersects = raycaster.intersectObject(modelMesh, true);
        
        // 如果仍然没有检测到，尝试超厚射线
        if (intersects.length === 0) {
            console.log("厚射线(0.05)下未检测到交点，尝试超厚射线检测...");
            raycaster.params.Points.threshold = 0.1; // 极高的阈值
            intersects = raycaster.intersectObject(modelMesh, true);
        }
        
        // 恢复严格阈值
        raycaster.params.Points.threshold = 0.001;
        
        if (intersects.length > 0) {
            console.log("使用增强阈值检测到交点：", intersects[0]);
        }
    } else {
        console.log("严格阈值检测到交点：", intersects[0]);
    }
    
    if (intersects.length > 0) {
        // 正常处理交点
        // 获取点击位置的3D坐标
        const intersect = intersects[0];
        const point = intersect.point.clone();
        
        // 调试输出交点信息
        console.log("交点详情:", {
            point: point,
            distance: intersect.distance,
            index: intersect.index,
            object: intersect.object.type
        });
        
        // 将点击位置从世界坐标转换为相对于modelGroup的本地坐标
        const worldPoint = point.clone(); // 保存一份世界坐标用于调试
        modelGroup.worldToLocal(point);
        
        // 调试输出转换前后的坐标
        console.log("世界坐标:", worldPoint);
        console.log("本地坐标:", point);
        
        // 【修复2】使用自定义对话框请求用户输入标注内容（避免页面重排）
        const content = await showCustomPrompt('请输入标注内容：');
        
        if (content && content.trim() !== '') {
            // 添加标注到点击位置
            addAnnotationAt(point, content);
        }
    } else {
        console.log("所有阈值下均未检测到交点，尝试投影到点云最近点...");
        
        // 如果所有射线策略都失败，尝试使用最近点策略
        const nearestPoint = findNearestPointOnModel();
        
        if (nearestPoint) {
            console.log("找到最近点:", nearestPoint);
            
            // 【修复2】使用自定义对话框请求用户输入标注内容（避免页面重排）
            const content = await showCustomPrompt('请输入标注内容：');
            
            if (content && content.trim() !== '') {
                // 添加标注到最近点位置
                addAnnotationAt(nearestPoint, content);
            }
        } else {
        alert('请点击点云模型上的点进行标注。');
        }
    }
}

// 处理设置旋转中心模式的点击
function handleCenterClick() {
    // 第一阶段：使用严格阈值检测与模型的交点
    raycaster.params.Points.threshold = 0.001; // 严格阈值
    let intersects = raycaster.intersectObject(modelMesh, true);
    
    // 如果没有检测到交点，使用厚射线策略
    if (intersects.length === 0) {
        console.log("严格阈值(0.001)下未检测到交点，尝试厚射线检测...");
        
        // 暂时增大阈值模拟厚射线
        raycaster.params.Points.threshold = 0.05; // 增加阈值以提高检测范围
        
        // 使用厚射线再次检测
        intersects = raycaster.intersectObject(modelMesh, true);
        
        // 如果仍然没有检测到，尝试超厚射线
        if (intersects.length === 0) {
            console.log("厚射线(0.05)下未检测到交点，尝试超厚射线检测...");
            raycaster.params.Points.threshold = 0.1; // 极高的阈值
            intersects = raycaster.intersectObject(modelMesh, true);
        }
        
        // 恢复严格阈值
        raycaster.params.Points.threshold = 0.001;
    }
    
    if (intersects.length > 0) {
        // 获取点击位置的3D坐标
        const intersect = intersects[0];
        const point = intersect.point.clone();
        
        // 将点击位置从世界坐标转换为相对于modelGroup的本地坐标
        modelGroup.worldToLocal(point);
        
        // 设置为新的旋转中心
        setRotationCenter(point);
    } else {
        console.log("所有阈值下均未检测到交点，尝试投影到点云最近点...");
        
        // 如果所有射线策略都失败，尝试使用最近点策略
        const nearestPoint = findNearestPointOnModel();
        
        if (nearestPoint) {
            console.log("找到最近点:", nearestPoint);
            setRotationCenter(nearestPoint);
    } else {
        alert('请点击点云模型上的点来设置旋转中心。');
        }
    }
}

// 辅助函数：在射线投射失败时找到模型上最近的点
function findNearestPointOnModel() {
    if (!modelMesh || !modelMesh.geometry || !modelMesh.geometry.attributes.position) {
        return null;
    }
    
    // 获取射线
    const ray = raycaster.ray;
    const positions = modelMesh.geometry.attributes.position;
    
    // 这里我们需要考虑模型的变换
    const worldMatrix = modelMesh.matrixWorld;
    
    // 尝试找到距离射线最近的点
    let minDistance = Infinity;
    let closestPoint = null;
    
    // 为了性能，我们只抽样检查部分点
    // 计算合适的步长以保证合理的性能
    const vertexCount = positions.count;
    // 对于大模型，使用更大的步长
    const stride = vertexCount > 100000 ? 1000 : (vertexCount > 10000 ? 100 : 10);
    
    console.log(`模型点数: ${vertexCount}, 使用抽样步长: ${stride}`);
    
    // 这个阈值控制我们认为"足够近"的距离
    const threshold = isLargeModel ? 0.2 : 0.1;
    
    for (let i = 0; i < vertexCount; i += stride) {
        // 从buffer几何体获取点坐标
        const vertex = new THREE.Vector3();
        vertex.fromBufferAttribute(positions, i);
        
        // 应用模型变换获取世界坐标
        const worldVertex = vertex.clone().applyMatrix4(worldMatrix);
        
        // 计算点到射线的距离
        const distance = ray.distanceToPoint(worldVertex);
        
        // 更新最短距离
        if (distance < minDistance) {
            minDistance = distance;
            closestPoint = vertex.clone(); // 存储模型坐标系中的点
        }
        
        // 如果找到足够近的点，提前结束
        if (minDistance < threshold) {
            console.log(`找到足够近的点，距离: ${minDistance}，提前结束搜索`);
            break;
        }
    }
    
    // 如果最近点足够近，返回该点
    if (minDistance < 1.0) {
        console.log(`找到最近点，距离: ${minDistance}`);
        return closestPoint;
    }
    
    console.log(`未找到足够近的点，最近距离: ${minDistance}`);
    return null;
}

// 键盘控制
function onKeyDown(event) {
    // 按F键翻转模型
    if (event.key === 'f' || event.key === 'F') {
        flipModel();
    }
    // 按Escape键退出添加模式
    if (event.key === 'Escape' && isAddingAnnotation) {
        toggleAddAnnotationMode();
    }
}

// 双击翻转模型
function onDoubleClick(event) {
    // 如果在添加标注模式，不执行翻转
    if (isAddingAnnotation) return;
    
    flipModel();
}

// 翻转模型函数
function flipModel() {
    // 通过旋转模型组来实现180度翻转
    modelGroup.rotation.x += Math.PI;
    // 更新标注位置
    updateAnnotations();
}

// 加载PLY模型
function loadModel(modelPath) {
    const loader = new THREE.PLYLoader();
    
    // 显示加载指示器
    loadingElement.style.display = 'block';
    loadingElement.textContent = '正在加载模型...';
    
    // 更新状态
    if (typeof updateLoadingStatus === 'function') {
        updateLoadingStatus('正在加载模型...');
    }
    
    console.time("模型加载和处理");
    console.log(`尝试加载模型: ${modelPath}`);
    
    // 获取文件大小信息
    fetch(modelPath, {
        method: 'HEAD',
        cache: 'no-cache' // 禁用缓存
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP错误，状态码: ${response.status}`);
        }
        const fileSize = response.headers.get('content-length');
        console.log(`模型文件大小: ${fileSize} 字节`);
        // 保存文件大小以便在showModelInfo中使用
        window.currentModelFileSize = fileSize;
    })
    .catch(error => {
        console.error('获取文件大小失败:', error);
        window.currentModelFileSize = null;
    });
    
    // 加载新模型
    loader.load(
        modelPath,
        function(geometry) {
            console.timeEnd("模型加载和处理");
            console.time("模型分析和渲染");
            
            // 记录模型信息
            const vertexCount = geometry.attributes.position.count;
            console.log(`模型顶点数量: ${vertexCount}`);
            
            // 判断是否是大模型
            isLargeModel = vertexCount > 2200000;
            
            // 检查几何体是否包含颜色属性
            let material;
            
            // 点云模式 - 使用点材质
            if (geometry.attributes.color !== undefined) {
                material = new THREE.PointsMaterial({
                    size: isLargeModel ? 0.007 : 0.0035,  // 减小为原来的70%
                    vertexColors: true,
                    sizeAttenuation: true  // 添加距离衰减
                });
                modelMesh = new THREE.Points(geometry, material);
            } else {
                // 无颜色信息 - 使用简单的单色材质
                material = new THREE.PointsMaterial({
                    size: isLargeModel ? 0.007 : 0.0035,  // 减小为原来的70%
                    color: 0x808080,
                    sizeAttenuation: true  // 添加距离衰减
                });
                modelMesh = new THREE.Points(geometry, material);
            }
            
            // 更新状态
            if (typeof updateLoadingStatus === 'function') {
                updateLoadingStatus('正在处理模型几何...');
            }
            
            // 先居中模型 - 使用包围盒计算中心
            geometry.computeBoundingBox();
            const fullBoundingBox = geometry.boundingBox;
            const center = new THREE.Vector3();
            fullBoundingBox.getCenter(center);
            modelMesh.position.set(-center.x, -center.y, -center.z);
            
            // 获取完整包围盒的尺寸（用于信息显示）
            const fullSize = fullBoundingBox.getSize(new THREE.Vector3());
            const fullMaxDim = Math.max(fullSize.x, fullSize.y, fullSize.z);
            
            // 性能模式设置
            let effectiveBoundingBox, percentageIncluded, principalAxis;
            let effectiveMaxDim = fullMaxDim;
            let boundingSphere = null;
            
            // 快速加载模式下跳过复杂分析
            if (fastLoadMode) {
                console.log("使用快速加载模式，跳过离群点分析和主轴计算");
                
                // 快速模式下使用完整包围盒作为有效包围盒
                effectiveBoundingBox = fullBoundingBox.clone();
                percentageIncluded = 1.0;
                
                // 默认主轴方向
                principalAxis = {
                    direction: new THREE.Vector3(1, 1, 1).normalize(),
                    confidence: 0.1,
                    tilt: { significant: false }
                };
                
                if (typeof updateLoadingStatus === 'function') {
                    updateLoadingStatus('快速模式：跳过复杂分析...');
                }
            } else {
                // 标准模式 - 执行完整分析
                // 计算有效包围盒（排除离群点）
                const result = computeEffectiveBoundingBox(geometry);
                effectiveBoundingBox = result.effectiveBoundingBox;
                percentageIncluded = result.percentageIncluded;
                
                // 更新状态
                if (typeof updateLoadingStatus === 'function') {
                    updateLoadingStatus('正在计算最佳视角...');
                }
                
                // 计算模型的主轴方向以改善初始视角
                principalAxis = calculatePrincipalAxis(geometry);
                console.log("模型主轴方向:", principalAxis);
            }
            
            // 获取有效包围盒的尺寸
            const effectiveSize = effectiveBoundingBox.getSize(new THREE.Vector3());
            effectiveMaxDim = Math.max(effectiveSize.x, effectiveSize.y, effectiveSize.z);
            
            console.log(`完整模型最大尺寸: ${fullMaxDim.toFixed(2)}, 有效模型最大尺寸: ${effectiveMaxDim.toFixed(2)}`);
            if (!fastLoadMode) {
                console.log(`包含的点百分比: ${(percentageIncluded * 100).toFixed(1)}%`);
            }
            
            // 新增：从有效包围盒计算包围球
            const sphereCenter = new THREE.Vector3();
            effectiveBoundingBox.getCenter(sphereCenter);
            
            // 计算从中心到包围盒角的最大距离作为球半径
            const corners = [
                new THREE.Vector3(effectiveBoundingBox.min.x, effectiveBoundingBox.min.y, effectiveBoundingBox.min.z),
                new THREE.Vector3(effectiveBoundingBox.min.x, effectiveBoundingBox.min.y, effectiveBoundingBox.max.z),
                new THREE.Vector3(effectiveBoundingBox.min.x, effectiveBoundingBox.max.y, effectiveBoundingBox.min.z),
                new THREE.Vector3(effectiveBoundingBox.min.x, effectiveBoundingBox.max.y, effectiveBoundingBox.max.z),
                new THREE.Vector3(effectiveBoundingBox.max.x, effectiveBoundingBox.min.y, effectiveBoundingBox.min.z),
                new THREE.Vector3(effectiveBoundingBox.max.x, effectiveBoundingBox.min.y, effectiveBoundingBox.max.z),
                new THREE.Vector3(effectiveBoundingBox.max.x, effectiveBoundingBox.max.y, effectiveBoundingBox.min.z),
                new THREE.Vector3(effectiveBoundingBox.max.x, effectiveBoundingBox.max.y, effectiveBoundingBox.max.z)
            ];
            
            let maxRadius = 0;
            for (const corner of corners) {
                const radius = corner.distanceTo(sphereCenter);
                if (radius > maxRadius) {
                    maxRadius = radius;
                }
            }
            
            // 创建包围球
            boundingSphere = {
                center: sphereCenter,
                radius: maxRadius
            };
            
            console.log(`包围球半径: ${boundingSphere.radius.toFixed(2)}`);
            
            // 自适应计算目标尺寸
            // 基本思路：越大的模型相对缩放后越小，越小的模型相对缩放后越大
            // 这样可以确保不同尺寸的模型都能合适地显示
            let targetSize;
            
            if (effectiveMaxDim > 100) {
                // 非常大的模型，缩放系数更大
                targetSize = 2.5;
            } else if (effectiveMaxDim > 10) {
                // 大型模型
                targetSize = 2.0;
            } else if (effectiveMaxDim < 0.1) {
                // 非常小的模型
                targetSize = 0.8;
            } else if (effectiveMaxDim < 1) {
                // 小型模型
                targetSize = 1.2;
            } else {
                // 中等尺寸的模型
                targetSize = 1.5;
            }
            
            // 根据包围球半径计算缩放系数
            const scale = targetSize / boundingSphere.radius;
            
            console.log(`自适应目标尺寸: ${targetSize.toFixed(2)}, 应用缩放系数: ${scale.toFixed(4)}`);
            modelMesh.scale.set(scale, scale, scale);
            
            // 记录缩放后的有效尺寸，用于相机定位
            const scaledRadius = boundingSphere.radius * scale;
            
            // 设置相机位置，使用包围球半径
            setOptimalCameraPosition(principalAxis, scaledRadius, isLargeModel, boundingSphere);
            
            // 更新状态
            if (typeof updateLoadingStatus === 'function') {
                updateLoadingStatus('正在优化显示效果...');
            }
            
            // 重置控制器
            controls.zoomSpeed = isLargeModel ? 2.5 : 1.5; // 大模型增加缩放速度
            controls.rotateSpeed = isLargeModel ? 0.5 : 0.7; // 大模型降低旋转速度
            controls.update();
            
            // 将模型添加到模型组
            modelGroup.add(modelMesh);
            
            // 预先旋转模型180度，让用户更容易查看底部
            modelGroup.rotation.x = Math.PI;
            
            // 隐藏加载指示器
            loadingElement.style.display = 'none';
            
            // 更新文档标题显示当前模型名称
            const modelName = modelPath.split('/').pop().replace('.ply', '');
            document.title = `3D模型查看器 - ${modelName}`;
            
            // 添加模型信息显示，显示原始尺寸和有效区域信息
            showModelInfo(modelName, vertexCount, fullMaxDim, scale, effectiveMaxDim, percentageIncluded);
            
            console.timeEnd("模型分析和渲染");
            
            // 更新加载状态
            if (typeof updateLoadingStatus === 'function') {
                const modeInfo = fastLoadMode ? '【快速模式】' : '';
                updateLoadingStatus(`${modeInfo}模型加载完成: ${modelName}`);
            }
            
            // 加载完成后，确保模型在视图中
            setTimeout(function() {
                ensureModelVisible();
            }, 500);
        },
        // 进度回调
        function(xhr) {
            const percent = Math.round((xhr.loaded / xhr.total) * 100);
            console.log(`加载进度: ${percent}%`);
            loadingElement.textContent = `正在加载模型... ${percent}%`;
        },
        // 错误回调
        function(error) {
            console.error('加载模型出错:', error);
            loadingElement.textContent = '加载模型失败!';
            loadingElement.style.color = 'red';
            
            // 显示更详细的错误信息
            if (typeof addDebugInfo === 'function') {
                addDebugInfo(`加载模型失败: ${modelPath}`);
                addDebugInfo(`错误: ${error.message || '未知错误'}`);
                addDebugInfo('提示: 请检查模型文件路径和格式是否正确');
                addDebugInfo('建议: 打开浏览器调试工具(F12)查看网络请求情况');
                
                // 显示调试信息
                document.getElementById('debug-info').style.display = 'block';
            }
        }
    );
}

// 设置最佳相机位置
function setOptimalCameraPosition(principalAxis, radius, isLargeModel, boundingSphere) {
    console.time("相机位置计算");
    
    // 相机方向的计算保持不变
    // 基于主轴方向确定相机位置
    let cameraDirection;
    
    // 如果有明确的主轴，则从该方向稍微偏移角度观察
    if (principalAxis && principalAxis.confidence > 0.5) {
        // 从主轴方向偏移45度角来观察
        cameraDirection = new THREE.Vector3();
        
        // 确保我们不是沿着模型的主轴直接观察
        if (Math.abs(principalAxis.direction.y) > 0.9) {
            // 如果主轴接近垂直方向，我们从侧面和上方观察
            cameraDirection.set(0.7, 0.7, 0);
        } else {
            // 否则我们选择一个较好的角度，通常是从上方45度角观察
            cameraDirection.set(
                principalAxis.direction.x,
                principalAxis.direction.y + 1.0, // 添加向上的分量
                principalAxis.direction.z
            );
        }
        
        cameraDirection.normalize();
    } else {
        // 默认使用45度俯视角
        cameraDirection = new THREE.Vector3(1, 1, 1).normalize();
    }
    
    // *** 改进部分 - 使用包围球半径计算距离 ***
    
    // 获取渲染器尺寸和纵横比
    const rendererSize = new THREE.Vector2();
    renderer.getSize(rendererSize);
    const aspectRatio = rendererSize.x / rendererSize.y;
    
    // 确定我们希望模型占据屏幕的比例
    // 基于朋友建议，调整为直接使用相机FOV和包围球半径计算
    const targetScreenRatio = isLargeModel ? 0.6 : 0.7; // 期望占据屏幕的比例
    
    // 根据相机视野(FOV)计算最佳距离
    const vFOV = THREE.MathUtils.degToRad(camera.fov); // 垂直视野角度
    
    // 计算理论上的最佳距离
    // 使用包围球半径和相机FOV计算，确保模型完整可见
    // 公式: distance = radius / Math.sin(fov/2 * targetScreenRatio)
    const optimalDistance = radius / Math.sin(vFOV / 2 * targetScreenRatio);
    
    // 设置最小距离以确保模型始终可见
    const minDistance = Math.max(5.0, radius * 2); // 最小安全距离
    
    // 使用最大值确保相机不会太近
    const finalDistance = Math.max(optimalDistance, minDistance);
    
    console.log(`计算相机距离: 包围球半径=${radius.toFixed(2)}, 理论距离=${optimalDistance.toFixed(2)}, 最终距离=${finalDistance.toFixed(2)}`);
    
    // 设置相机位置
    camera.position.copy(cameraDirection.multiplyScalar(finalDistance));
    
    // 确保相机参数适应模型大小
    // 近平面不能太近，否则会导致z-fighting
    camera.near = Math.max(0.001, finalDistance * 0.01);
    // 远平面需要足够远以容纳整个场景
    camera.far = finalDistance * 100;
    camera.updateProjectionMatrix();
    
    // 始终让相机看向原点
    camera.lookAt(0, 0, 0);
    
    // 存储初始相机位置和目标，用于后续恢复初始视角
    initialCameraPosition = camera.position.clone();
    initialCameraTarget = new THREE.Vector3(0, 0, 0);
    
    // 记录日志
    console.log(`已设置最佳相机位置: (${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)})`);
    console.log(`相机参数: 近平面=${camera.near.toFixed(4)}, 远平面=${camera.far.toFixed(2)}`);
    
    console.timeEnd("相机位置计算");
    
    // 更新状态信息
    if (typeof updateLoadingStatus === 'function') {
        updateLoadingStatus('已优化相机视角，模型已居中显示');
    }
}

// 确保模型在视图中可见的函数
function ensureModelVisible() {
    if (!modelMesh) return;
    
    // 创建临时的包围盒来包含模型
    const tempBox = new THREE.Box3().setFromObject(modelMesh);
    
    // 如果包围盒是无效的（空或无限大），则返回
    if (!tempBox.isBox3 || !isFinite(tempBox.min.x) || !isFinite(tempBox.max.x)) {
        console.warn("无法创建有效的包围盒");
        return;
    }
    
    // 计算模型的中心点和尺寸
    const center = new THREE.Vector3();
    tempBox.getCenter(center);
    const size = new THREE.Vector3();
    tempBox.getSize(size);
    
    // 获取模型的最大尺寸
    const maxDim = Math.max(size.x, size.y, size.z);
    
    // 如果模型太小，可能看不见
    if (maxDim < 0.001) {
        console.warn("模型尺寸异常小，自动调整缩放");
        const newScale = modelMesh.scale.x * 100;
        modelMesh.scale.set(newScale, newScale, newScale);
        
        // 显示提示
        if (typeof updateLoadingStatus === 'function') {
            updateLoadingStatus('⚠️ 模型尺寸异常小，已自动放大100倍');
        }
        return;
    }
    
    // 如果相机和模型中心之间的距离过大，调整相机位置
    const camToModelDist = camera.position.distanceTo(center);
    if (camToModelDist > maxDim * 50) {
        console.warn("相机距离模型过远，自动调整");
        
        // 计算新的相机位置，使其离模型中心更近
        const direction = camera.position.clone().sub(center).normalize();
        const newDistance = maxDim * 10; // 设置为模型尺寸的10倍
        camera.position.copy(direction.multiplyScalar(newDistance).add(center));
        
        // 更新相机参数
        camera.near = Math.max(0.001, newDistance * 0.01);
        camera.far = newDistance * 100;
        camera.updateProjectionMatrix();
        
        // 确保相机看向模型中心
        camera.lookAt(center);
        controls.target.copy(center);
        controls.update();
        
        // 显示提示
        if (typeof updateLoadingStatus === 'function') {
            updateLoadingStatus('⚠️ 已自动调整相机位置，使模型可见');
        }
    }
}

// 计算有效包围盒，排除离群点
function computeEffectiveBoundingBox(geometry) {
    const positions = geometry.attributes.position;
    const vertexCount = positions.count;
    
    // 如果顶点数量太少，直接返回完整包围盒
    if (vertexCount < 100) {
        geometry.computeBoundingBox();
        return { 
            effectiveBoundingBox: geometry.boundingBox.clone(),
            percentageIncluded: 1.0
        };
    }
    
    console.log("开始计算有效包围盒，排除离群点...");
    console.time("计算有效包围盒");
    
    // 性能优化：对于超大模型，使用抽样计算
    // 这可以大幅提高计算速度，对精度影响不大
    const useSubsampling = vertexCount > 500000;
    const samplingRate = useSubsampling ? 0.2 : 1.0; // 大模型只使用20%的点进行分析
    
    // 收集所有点的坐标（或抽样点的坐标）
    const xCoords = [];
    const yCoords = [];
    const zCoords = [];
    
    // 抽样收集点坐标
    const stride = useSubsampling ? Math.floor(1 / samplingRate) : 1;
    
    if (useSubsampling) {
        console.log(`模型顶点过多(${vertexCount})，使用抽样率${samplingRate * 100}%计算`);
    }
                    
                    for (let i = 0; i < vertexCount; i += stride) {
        xCoords.push(positions.getX(i));
        yCoords.push(positions.getY(i));
        zCoords.push(positions.getZ(i));
    }
    
    const sampleCount = xCoords.length;
    console.log(`使用${sampleCount}个点(${(sampleCount/vertexCount*100).toFixed(1)}%)进行分析`);
    
    // 对每个轴的坐标进行排序
    console.time("坐标排序");
    xCoords.sort((a, b) => a - b);
    yCoords.sort((a, b) => a - b);
    zCoords.sort((a, b) => a - b);
    console.timeEnd("坐标排序");
    
    // 使用更保守的排除比例 - 只排除极端的离群点
    // 大型模型最多排除2%，普通模型最多排除1%
    const extremeRatio = isLargeModel ? 0.02 : 0.01;
    
    // 计算分位数索引
    const lowerIndex = Math.floor(sampleCount * extremeRatio);
    const upperIndex = Math.floor(sampleCount * (1 - extremeRatio));
    
    // 使用分位数值确定有效范围
    const xMin = xCoords[lowerIndex];
    const xMax = xCoords[upperIndex];
    const yMin = yCoords[lowerIndex];
    const yMax = yCoords[upperIndex];
    const zMin = zCoords[lowerIndex];
    const zMax = zCoords[upperIndex];
    
    // 性能优化：如果是超大模型，使用抽样估计包含的点比例
    // 否则精确计算
    let percentageIncluded;
    
    if (useSubsampling) {
        // 抽样计算包含的点百分比
        let sampledPointsInBox = 0;
        for (let i = 0; i < sampleCount; i++) {
            const x = xCoords[i];
            const y = yCoords[i];
            const z = zCoords[i];
            
            if (x >= xMin && x <= xMax && 
                y >= yMin && y <= yMax && 
                z >= zMin && z <= zMax) {
                sampledPointsInBox++;
            }
        }
        percentageIncluded = sampledPointsInBox / sampleCount;
        console.log(`通过抽样估算包含点百分比: ${(percentageIncluded * 100).toFixed(1)}%`);
    } else {
        // 精确计算有效区域内包含的点的百分比
        let pointsInEffectiveBox = 0;
        console.time("计算包含点");
        for (let i = 0; i < vertexCount; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i);
            const z = positions.getZ(i);
            
            if (x >= xMin && x <= xMax && 
                y >= yMin && y <= yMax && 
                z >= zMin && z <= zMax) {
                pointsInEffectiveBox++;
            }
        }
        console.timeEnd("计算包含点");
        percentageIncluded = pointsInEffectiveBox / vertexCount;
    }
    
    // 创建有效包围盒
    const effectiveBoundingBox = new THREE.Box3(
        new THREE.Vector3(xMin, yMin, zMin),
        new THREE.Vector3(xMax, yMax, zMax)
    );
    
    // 安全检查：如果有效包围盒过小（包含的点比例过低），使用完整包围盒的安全缩小版本
    if (percentageIncluded < 0.75) {
        console.warn(`有效包围盒包含点过少(${(percentageIncluded * 100).toFixed(1)}%)，使用安全边界盒`);
        
        // 计算完整包围盒
        geometry.computeBoundingBox();
        const fullBox = geometry.boundingBox;
        
        // 安全边界：保留完整包围盒的90%范围
        const safetyMargin = 0.05; // 每边缩小5%
        
        // 创建略微缩小的安全包围盒
        const safeBox = new THREE.Box3(
            new THREE.Vector3(
                fullBox.min.x * (1 - safetyMargin) + fullBox.max.x * safetyMargin,
                fullBox.min.y * (1 - safetyMargin) + fullBox.max.y * safetyMargin,
                fullBox.min.z * (1 - safetyMargin) + fullBox.max.z * safetyMargin
            ),
            new THREE.Vector3(
                fullBox.max.x * (1 - safetyMargin) + fullBox.min.x * safetyMargin,
                fullBox.max.y * (1 - safetyMargin) + fullBox.min.y * safetyMargin,
                fullBox.max.z * (1 - safetyMargin) + fullBox.min.z * safetyMargin
            )
        );
        
        console.timeEnd("计算有效包围盒");
        console.log("使用安全边界盒替代有效包围盒");
        
        return { 
            effectiveBoundingBox: safeBox,
            percentageIncluded: 0.90 // 估计值
        };
    }
    
    console.timeEnd("计算有效包围盒");
    console.log(`有效包围盒计算完成，包含点的百分比: ${(percentageIncluded * 100).toFixed(1)}%`);
    
    // 输出调试信息
    const fullBox = geometry.boundingBox;
    console.log("完整包围盒:", {
        min: [fullBox.min.x.toFixed(2), fullBox.min.y.toFixed(2), fullBox.min.z.toFixed(2)],
        max: [fullBox.max.x.toFixed(2), fullBox.max.y.toFixed(2), fullBox.max.z.toFixed(2)]
    });
    console.log("有效包围盒:", {
        min: [effectiveBoundingBox.min.x.toFixed(2), effectiveBoundingBox.min.y.toFixed(2), effectiveBoundingBox.min.z.toFixed(2)],
        max: [effectiveBoundingBox.max.x.toFixed(2), effectiveBoundingBox.max.y.toFixed(2), effectiveBoundingBox.max.z.toFixed(2)]
    });
    
    return { effectiveBoundingBox, percentageIncluded };
}

// 计算模型的主轴方向
function calculatePrincipalAxis(geometry) {
    console.time("主轴分析");
    
    // 获取顶点坐标
    const positions = geometry.attributes.position;
    const vertexCount = positions.count;
    
    // 对于非常大的模型，使用抽样方法提高性能
    const useSubsampling = vertexCount > 200000;
    const samplingRate = useSubsampling ? 0.1 : 1.0; // 对大模型只使用10%的点
    const stride = useSubsampling ? Math.floor(1 / samplingRate) : 1;
    
    if (useSubsampling) {
        console.log(`模型顶点过多(${vertexCount})，主轴分析使用抽样率${samplingRate * 100}%`);
    }
    
    // 计算协方差矩阵
    const covariance = new THREE.Matrix3();
    const mean = new THREE.Vector3();
    
    // 首先计算平均值
    const samplePoints = [];
    let sampleCount = 0;
    
    for (let i = 0; i < vertexCount; i += stride) {
        const point = new THREE.Vector3(
            positions.getX(i),
            positions.getY(i),
            positions.getZ(i)
        );
        samplePoints.push(point);
        mean.add(point);
        sampleCount++;
    }
    
    mean.divideScalar(sampleCount);
    
    // 然后计算协方差矩阵
    for (let i = 0; i < sampleCount; i++) {
        const point = samplePoints[i];
        const dx = point.x - mean.x;
        const dy = point.y - mean.y;
        const dz = point.z - mean.z;
        
        // 积累协方差矩阵元素
        covariance.elements[0] += dx * dx; // xx
        covariance.elements[1] += dx * dy; // xy
        covariance.elements[2] += dx * dz; // xz
        covariance.elements[3] += dy * dx; // yx
        covariance.elements[4] += dy * dy; // yy
        covariance.elements[5] += dy * dz; // yz
        covariance.elements[6] += dz * dx; // zx
        covariance.elements[7] += dz * dy; // zy
        covariance.elements[8] += dz * dz; // zz
    }
    
    // 归一化协方差矩阵
    for (let i = 0; i < 9; i++) {
        covariance.elements[i] /= sampleCount;
    }
    
    // 使用简化的主成分分析方法
    // 我们计算对角线元素的和作为3个轴的方差
    const varX = covariance.elements[0]; // xx
    const varY = covariance.elements[4]; // yy
    const varZ = covariance.elements[8]; // zz
    
    // 找出方差最大的轴作为主轴
    let maxVar = Math.max(varX, varY, varZ);
    let principalAxis = new THREE.Vector3(0, 1, 0); // 默认y轴
    let confidence = 0.3; // 默认置信度较低
    
    // 如果某个轴的方差明显大于其他轴，则认为它是主轴
    const threshold = 1.5; // 方差比例阈值
    
    if (varX > varY * threshold && varX > varZ * threshold) {
        principalAxis.set(1, 0, 0);
        confidence = 0.7;
    } else if (varY > varX * threshold && varY > varZ * threshold) {
        principalAxis.set(0, 1, 0);
        confidence = 0.7;
    } else if (varZ > varX * threshold && varZ > varY * threshold) {
        principalAxis.set(0, 0, 1);
        confidence = 0.7;
    }
    
    // 检查模型是否有倾斜
    const covXY = Math.abs(covariance.elements[1]); // xy
    const covXZ = Math.abs(covariance.elements[2]); // xz
    const covYZ = Math.abs(covariance.elements[5]); // yz
    
    // 计算协方差相对于方差的比例
    const tiltXY = covXY / Math.sqrt(varX * varY);
    const tiltXZ = covXZ / Math.sqrt(varX * varZ);
    const tiltYZ = covYZ / Math.sqrt(varY * varZ);
    
    // 模型的倾斜信息
    const tilt = {
        xy: tiltXY,
        xz: tiltXZ,
        yz: tiltYZ,
        significant: (tiltXY > 0.3 || tiltXZ > 0.3 || tiltYZ > 0.3)
    };
    
    console.timeEnd("主轴分析");
    
    // 返回主轴方向和倾斜信息
    // 如果不返回单位向量而是三个轴上的主要信息
    return {
        direction: principalAxis,
        confidence: confidence,
        tilt: tilt
    };
}

// 显示模型信息
function showModelInfo(modelName, vertexCount, maxDim, scale, effectiveMaxDim, percentageIncluded) {
    // 移除旧的信息面板（如果存在）
    const oldInfo = document.getElementById('model-info-panel');
    if (oldInfo) {
        oldInfo.parentNode.removeChild(oldInfo);
    }
    
    // 查找模型选择面板
    const modelPanel = document.querySelector('.control-panel.model-selector');
    if (!modelPanel) return;

    // 移除旧的模型信息部分（如果存在）
    const oldModelInfo = modelPanel.querySelector('.model-info-section');
    if (oldModelInfo) {
        oldModelInfo.remove();
    }

    // 创建模型信息部分
    const infoSection = document.createElement('div');
    infoSection.className = 'model-info-section';
    infoSection.style.marginBottom = '15px';
    infoSection.style.borderBottom = '1px solid rgba(255, 255, 255, 0.1)';
    infoSection.style.paddingBottom = '15px';

    // 添加信息标题
    const infoTitle = document.createElement('div');
    infoTitle.classList.add('section-title');
    infoTitle.textContent = '模型信息';
    infoTitle.style.marginBottom = '10px';
    infoSection.appendChild(infoTitle);
    
    // 格式化顶点数量
    let formattedVertexCount;
    if (vertexCount > 1000000) {
        formattedVertexCount = (vertexCount / 1000000).toFixed(2) + 'M';
    } else if (vertexCount > 1000) {
        formattedVertexCount = (vertexCount / 1000).toFixed(2) + 'K';
    } else {
        formattedVertexCount = vertexCount;
    }
    
    // 创建信息内容
    const infoContent = document.createElement('div');
    infoContent.style.display = 'grid';
    infoContent.style.gridTemplateColumns = 'auto 1fr';
    infoContent.style.gap = '5px 10px';
    infoContent.style.fontSize = '13px';

    // 添加各项信息
    const addInfoRow = (label, value) => {
        const labelDiv = document.createElement('div');
        labelDiv.textContent = label;
        labelDiv.style.opacity = '0.8';

        const valueDiv = document.createElement('div');
        valueDiv.textContent = value;
        valueDiv.style.fontWeight = '500';

        infoContent.appendChild(labelDiv);
        infoContent.appendChild(valueDiv);
    };

    // 添加顶点数信息
    addInfoRow('顶点数:', formattedVertexCount);
    
    // 添加文件大小信息
    if (window.currentModelFileSize) {
        // 格式化文件大小
        let formattedSize;
        const sizeInBytes = parseInt(window.currentModelFileSize);
        if (sizeInBytes > 1048576) {
            formattedSize = (sizeInBytes / 1048576).toFixed(2) + ' MB';
        } else if (sizeInBytes > 1024) {
            formattedSize = (sizeInBytes / 1024).toFixed(2) + ' KB';
        } else {
            formattedSize = sizeInBytes + ' B';
        }
        addInfoRow('文件大小:', formattedSize);
    }
    
    infoSection.appendChild(infoContent);
    
    // 将信息部分插入到标题后面，选择器前面
    const title = modelPanel.querySelector('.panel-title');
    if (title) {
        title.insertAdjacentElement('afterend', infoSection);
    } else {
        modelPanel.insertBefore(infoSection, modelPanel.firstChild);
    }
}

// 更新标注的位置
function updateAnnotations() {
    annotations.forEach(annotation => {
        // 如果标注不可见，则跳过更新
        if (!annotationsVisible) return;
        
        // 获取标记点在世界坐标中的位置
        const worldPosition = new THREE.Vector3();
        annotation.marker.getWorldPosition(worldPosition);
        
        // 将3D位置转换为屏幕坐标
        worldPosition.project(camera);
        
        // 转换为CSS坐标
        const x = (worldPosition.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-worldPosition.y * 0.5 + 0.5) * window.innerHeight;
        
        // 检查是否在相机前面
        if (worldPosition.z < 1) {
            // 显示标注点
            annotation.element.style.display = 'block';
            
            // 计算标注文字的位置 - 向上偏移
            const labelX = x;
            const labelY = y - 40; // 向上偏移40像素
            
            // 设置标注文字位置
            annotation.element.style.left = `${labelX}px`;
            annotation.element.style.top = `${labelY}px`;
            annotation.element.style.transform = 'translate(-50%, -100%)'; // 居中并位于上方
            
            // 设置连接线位置和长度
            annotation.line.style.display = 'block';
            annotation.line.style.left = `${x}px`;
            annotation.line.style.top = `${labelY + 5}px`; // 从标签底部开始
            annotation.line.style.height = `${35}px`; // 连接线长度
            
            // 根据到相机的距离调整透明度
            const dist = camera.position.distanceTo(annotation.marker.position);
            const opacity = Math.max(0.85, 1 - dist / 15);
            annotation.element.style.opacity = opacity;
            annotation.line.style.opacity = opacity * 0.7; // 线的透明度稍低
        } else {
            // 隐藏标注和连接线
            annotation.element.style.display = 'none';
            annotation.line.style.display = 'none';
        }
    });
}

// 窗口大小变化时调整相机和渲染器
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    // 重新检测设备类型（处理屏幕旋转等情况）
    const oldIsMobile = isMobileDevice;
    detectDevice();
    
    // 如果设备类型发生变化，重新初始化移动端组件
    if (oldIsMobile !== isMobileDevice) {
        console.log('设备类型发生变化，重新初始化界面');
        
        // 移除旧的移动端组件
        if (mobileBottomToolbar) {
            mobileBottomToolbar.remove();
            mobileBottomToolbar = null;
        }
        if (mobilePanelsContainer) {
            mobilePanelsContainer.remove();
            mobilePanelsContainer = null;
        }
        
        // 重新创建移动端组件
        if (isMobileDevice) {
            createMobilePanelsContainer();
            createMobileBottomToolbar();
            
            // 隐藏桌面端面板
            const panels = document.querySelectorAll('.control-panel');
            panels.forEach(panel => {
                panel.style.display = 'none';
            });
        } else {
            // 显示桌面端面板
            const panels = document.querySelectorAll('.control-panel');
            panels.forEach(panel => {
                panel.style.display = 'block';
            });
        }
    }
}

// 动画循环
function animate() {
    requestAnimationFrame(animate);
    
    controls.update();
    
    // 动态LOD - 根据相机距离调整点大小
    if (dynamicLODEnabled && modelMesh && camera) {
        const distance = camera.position.distanceTo(modelGroup.position);
        let optimalSize;
        
        if (distance > 100) {
            // 远距离
            optimalSize = isLargeModel ? 0.03 : 0.02;
        } else if (distance > 50) {
            // 中等距离
            optimalSize = isLargeModel ? 0.02 : 0.01;
        } else {
            // 近距离
            optimalSize = isLargeModel ? 0.01 : 0.005;
        }
        
        // 平滑过渡，避免突变
        modelMesh.material.size += (optimalSize - modelMesh.material.size) * 0.1;
    }
    
    renderer.render(scene, camera);
    updateAnnotations();
}

// 添加自定义滚轮缩放控制函数
function onMouseWheel(event) {
    // 阻止默认滚轮行为和默认的OrbitControls缩放
    event.preventDefault();
    event.stopPropagation();
    
    // 获取滚轮方向
    const delta = Math.sign(-event.deltaY);
    
    // 非常小的缩放率 - 使每次缩放更加平滑
    const zoomScale = 1 + (delta * 0.05);
    
    // 应用缩放
    const currentZoom = camera.position.distanceTo(controls.target);
    const newZoom = Math.max(controls.minDistance, Math.min(controls.maxDistance, currentZoom / zoomScale));
    
    // 计算新的相机位置
    const direction = camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(direction.multiplyScalar(newZoom).add(controls.target));
    
    // 更新控制器
    controls.update();
    
    return false;
}

// 切换设置旋转中心模式
function toggleSetCenterMode() {
    isSettingCenter = !isSettingCenter;
    isAddingAnnotation = false; // 退出添加标注模式
    
    const modeIndicator = document.getElementById('mode-indicator');
    const setCenterBtn = document.getElementById('set-center-btn');
    
    if (isSettingCenter) {
        // 进入设置旋转中心模式
        modeIndicator.textContent = '设置旋转中心模式 - 点击模型选择旋转中心';
        modeIndicator.style.backgroundColor = 'rgba(0, 0, 255, 0.5)';
        setCenterBtn.textContent = '取消设置';
        // 启用控制器
        controls.enabled = false;
    } else {
        // 退出设置旋转中心模式
        modeIndicator.textContent = '普通模式';
        modeIndicator.style.backgroundColor = 'rgba(0, 128, 0, 0.5)';
        setCenterBtn.textContent = '⊙ 设置中心'; // 修复这里，保持文本一致
        // 启用控制器
        controls.enabled = true;
    }
}

// 设置新的旋转中心
function setRotationCenter(point) {
    // 移除之前的中心标记（如果有）
    if (centerMarker) {
        modelGroup.remove(centerMarker);
    }
    
    // 创建新的中心标记
    const sphereGeometry = new THREE.SphereGeometry(0.03, 16, 16);
    const sphereMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x00ff00,
        transparent: true,
        opacity: 0.8,
        emissive: 0x00ff00, // 添加自发光效果
        emissiveIntensity: 0.5
    });
    centerMarker = new THREE.Mesh(sphereGeometry, sphereMaterial);
    centerMarker.position.copy(point);
    
    // 将标记添加到模型组
    modelGroup.add(centerMarker);
    
    // 设置轨道控制器的目标点为新的旋转中心
    // 注意：需要转换为世界坐标
    const worldPoint = point.clone();
    modelGroup.localToWorld(worldPoint);
    controls.target.copy(worldPoint);
    
    // 更新控制器
    controls.update();
    
    // 显示提示信息
    alert('旋转中心已设置！现在您可以绕这个点旋转模型。');
    
    // 退出设置模式
    toggleSetCenterMode();
}

// 重置旋转中心到模型中心
function resetRotationCenter() {
    // 移除中心标记（如果有）
    if (centerMarker) {
        modelGroup.remove(centerMarker);
        centerMarker = null;
    }
    
    // 重置控制器目标点为原点
    controls.target.set(0, 0, 0);
    controls.update();
    
    alert('已重置旋转中心到模型中心！');
}


// 切换性能优化模式
function togglePerformanceMode() {
    // 保存当前相机位置和旋转
    const cameraPosition = camera.position.clone();
    const controlsTarget = controls.target.clone();
    const cameraUp = camera.up.clone();
    
    // 保存当前模型位置和旋转
    const modelPosition = modelGroup.position.clone();
    const modelRotation = modelGroup.rotation.clone();
    const modelScale = modelGroup.scale.clone();
    
    isPerformanceMode = !isPerformanceMode;
    dynamicLODEnabled = isPerformanceMode;
    
    // 当前点材质大小
    let currentSize = 0;
    
    if (modelMesh && modelMesh.material) {
        currentSize = modelMesh.material.size;
    }
    
    // 更新点大小 - 性能模式下点大小增加，但不要太大
    let newSize;
    if (isPerformanceMode) {
        // 开启性能模式时，增大点大小但有上限
        newSize = Math.min(currentSize * 1.2, 0.010);  // 上限减小为原来的70%
        
        // 保存原始渲染参数，以便后续恢复
        if (modelMesh && modelMesh.material) {
            modelMesh.material.userData.originalParams = {
                size: modelMesh.material.size,
                sizeAttenuation: modelMesh.material.sizeAttenuation,
                depthWrite: modelMesh.material.depthWrite,
                depthTest: modelMesh.material.depthTest
            };
            
            // 降低渲染质量
            modelMesh.material.sizeAttenuation = false;  // 关闭距离衰减
            modelMesh.material.depthWrite = false;  // 关闭深度写入
        }
    } else {
        // 关闭性能模式时，恢复到默认大小
        newSize = isLargeModel ? 0.007 : 0.0035;  // 减小为原来的70%
        
        // 关闭性能模式时，完全恢复原始参数
        if (modelMesh && modelMesh.material && modelMesh.material.userData.originalParams) {
            const originalParams = modelMesh.material.userData.originalParams;
            newSize = originalParams.size;
            modelMesh.material.sizeAttenuation = originalParams.sizeAttenuation;
            modelMesh.material.depthWrite = originalParams.depthWrite;
            modelMesh.material.depthTest = originalParams.depthTest;
        } else {
            // 如果没有保存原始参数，使用默认值
            newSize = isLargeModel ? 0.007 : 0.0035;  // 减小为原来的70%
            if (modelMesh && modelMesh.material) {
                modelMesh.material.sizeAttenuation = true;
                modelMesh.material.depthWrite = true;
                modelMesh.material.depthTest = true;
            }
        }
    }
    
    // 应用新的点大小
    if (modelMesh && modelMesh.material) {
        modelMesh.material.size = newSize;
    }
    
    // 应用性能优化后，恢复相机和模型位置
    camera.position.copy(cameraPosition);
    controls.target.copy(controlsTarget);
    camera.up.copy(cameraUp);
    
    modelGroup.position.copy(modelPosition);
    modelGroup.rotation.copy(modelRotation);
    modelGroup.scale.copy(modelScale);
    
    // 确保相机控制器更新
    controls.update();
    
    // 更新UI
    const perfButton = document.querySelector('#performance-btn');
    if (perfButton) {
        if (isPerformanceMode) {
            perfButton.textContent = '🔄 关闭性能模式';
            perfButton.style.backgroundColor = '#ff5722';  // 确保设置橙色背景
        } else {
            perfButton.textContent = '⚡ 性能优化模式';
            perfButton.style.backgroundColor = '';  // 恢复默认背景色
        }
    }
    
    console.log(`${isPerformanceMode ? '已开启' : '已关闭'}性能模式，点大小: ${newSize.toFixed(3)}`);
    
    // 在开发者控制台显示性能模式状态
    const perfStatus = document.getElementById('perf-status');
    if (perfStatus) {
        perfStatus.textContent = isPerformanceMode ? '性能模式: 开启' : '性能模式: 关闭';
    }
    
    if (typeof updateLoadingStatus === 'function') {
        updateLoadingStatus(`已${isPerformanceMode ? '开启' : '关闭'}性能优化模式`);
    }
}

// 启动应用
init();
animate(); 

// 创建立方体图标的辅助函数
function createCubeIcon(face, color) {
    const container = document.createElement('div');
    container.className = 'cube-container';
    
    // 创建立方体的面
    const faces = ['front', 'back', 'top', 'bottom', 'left', 'right'];
    const positions = {
        'front': 'translateZ(10px)',
        'back': 'translateZ(-10px) rotateY(180deg)',
        'top': 'translateY(-10px) rotateX(90deg)',
        'bottom': 'translateY(10px) rotateX(-90deg)',
        'left': 'translateX(-10px) rotateY(-90deg)',
        'right': 'translateX(10px) rotateY(90deg)'
    };
    
    // 添加自定义旋转以更好地显示所有面
    let customRotation = '';
    if (face === 'bottom') {
        // 调整底部视角，使底面更可见
        customRotation = 'rotateX(30deg) rotateY(-20deg)';
    } else if (face === 'left') {
        // 调整左侧视角，使左面更可见
        customRotation = 'rotateX(-15deg) rotateY(25deg)';
    }
    
    if (customRotation) {
        container.style.transform = customRotation;
        container.style.webkitTransform = customRotation;
    }
    
    faces.forEach(f => {
        const cubeFace = document.createElement('div');
        cubeFace.className = 'cube-face';
        // 使高亮面的颜色更加明亮，其他面更暗
        cubeFace.style.backgroundColor = f === face ? color : 'rgba(30,30,30,0.3)';
        cubeFace.style.transform = positions[f];
        cubeFace.style.webkitTransform = positions[f]; // 添加webkit前缀
        cubeFace.style.zIndex = f === face ? '2' : '1'; // 确保高亮面在上层
        
        // 对于底部和左侧视角，增加额外的样式以确保可见性
        if ((face === 'bottom' && f === 'bottom') || (face === 'left' && f === 'left')) {
            cubeFace.style.opacity = '1';
            cubeFace.style.boxShadow = '0 0 8px rgba(255,255,255,0.5)';
        }
        
        container.appendChild(cubeFace);
    });
    
    return container;
}

// 在指定位置添加标注
function addAnnotationAt(position, content) {
    // 创建标记点几何体
    const sphereGeometry = new THREE.SphereGeometry(0.02, 16, 16); // 减小标记点大小
    const sphereMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xff0000,
        transparent: true,
        opacity: 0.8
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.copy(position);
    
    // 将标记点添加到模型组
    modelGroup.add(sphere);
    
    // 创建HTML标注元素
    const annotationElement = document.createElement('div');
    annotationElement.className = 'annotation';
    annotationElement.id = `annotation-${annotations.length}`;
    
    // 创建内容容器
    const contentContainer = document.createElement('div');
    contentContainer.className = 'annotation-content';
    contentContainer.textContent = content;
    annotationElement.appendChild(contentContainer);
    
    // 添加连接线
    const lineElement = document.createElement('div');
    lineElement.className = 'annotation-line';
    document.body.appendChild(lineElement);
    
    // 添加编辑功能到标注
    annotationElement.addEventListener('click', async function(e) {
        e.stopPropagation();
        // 【修复2】使用自定义对话框编辑标注内容（避免页面重排）
        const newContent = await showCustomPrompt('编辑标注内容：', contentContainer.textContent);
        if (newContent !== null && newContent.trim() !== '') {
            contentContainer.textContent = newContent;
        }
    });
    
    // 添加删除按钮
    const deleteBtn = document.createElement('span');
    deleteBtn.className = 'annotation-delete';
    deleteBtn.textContent = '×';
    deleteBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (confirm('确定要删除此标注吗？')) {
            annotationElement.parentNode.removeChild(annotationElement);
            lineElement.parentNode.removeChild(lineElement);
            modelGroup.remove(sphere);
            const index = annotations.findIndex(a => a.element === annotationElement);
            if (index !== -1) {
                annotations.splice(index, 1);
            }
        }
    });
    annotationElement.appendChild(deleteBtn);
    
    document.body.appendChild(annotationElement);
    
    // 存储标注数据
    annotations.push({
        element: annotationElement,
        position: position.clone(),
        marker: sphere,
        line: lineElement
    });
    
    // 如果处于添加模式，完成后切换回普通模式
    if (isAddingAnnotation) {
        toggleAddAnnotationMode();
    }
}

// 添加在文件末尾或其他合适位置
// 还原到初始视角函数
function restoreInitialView() {
    if (!initialCameraPosition) {
        console.warn("没有初始视角可还原");
        return;
    }
    
    // 保存当前相机位置用于动画过渡
    const startPosition = camera.position.clone();
    const startTarget = controls.target.clone();
    
    // 创建一个动画函数，实现平滑过渡
    const duration = 800; // 动画持续时间（毫秒）
    const startTime = Date.now();
    
    function animateRestore() {
        const elapsedTime = Date.now() - startTime;
        const progress = Math.min(elapsedTime / duration, 1);
        
        // 使用缓动函数使动画更自然
        const easeProgress = 1 - Math.pow(1 - progress, 3); // 缓入缓出函数
        
        // 线性插值计算当前位置
        camera.position.lerpVectors(startPosition, initialCameraPosition, easeProgress);
        controls.target.lerpVectors(startTarget, initialCameraTarget, easeProgress);
        
        // 更新相机和控制器
        camera.lookAt(controls.target);
        controls.update();
        
        if (progress < 1) {
            // 继续动画
            requestAnimationFrame(animateRestore);
        } else {
            // 动画结束，确保精确到位
            camera.position.copy(initialCameraPosition);
            controls.target.copy(initialCameraTarget);
            camera.lookAt(controls.target);
            controls.update();
            
            console.log("已恢复到初始视角");
        }
    }
    
    // 开始动画
    animateRestore();
}

// 更新UI
const perfButton = document.querySelector('#performance-btn');
if (perfButton) {
    if (isPerformanceMode) {
        perfButton.textContent = '🔄 关闭性能模式';
        perfButton.style.backgroundColor = '#ff5722';  // 确保设置橙色背景
    } else {
        perfButton.textContent = '⚡ 性能优化模式';
        perfButton.style.backgroundColor = '';  // 恢复默认背景色
    }
}
