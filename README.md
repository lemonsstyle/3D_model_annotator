# 三维模型标注查看器

这是一个基于Three.js的Web应用程序，可以加载PLY格式的三维模型，并在模型上添加交互式文本标注。非常适合创建带有说明文字的三维"说明书"。

## 功能特点

- 加载并显示PLY格式的三维模型
- 在模型上添加文本标注
- 可以从不同角度查看模型和标注
- 标注会根据视角自动调整位置和可见性
- 支持模型的旋转、缩放和平移

## 使用方法

1. 将您的PLY格式模型文件放入`models`文件夹中，并将文件命名为`temperature_sensor.ply`（或者修改`main.js`中的文件路径）

2. 如果需要，在`main.js`文件中的`createAnnotations`函数内修改标注数据：

```javascript
const annotationData = [
    {
        position: { x: 1, y: 0.5, z: 0 },
        content: "温度传感器探头：测量温度的主要部件"
    },
    // 添加更多标注...
];
```

3. 使用Web服务器打开项目文件夹（直接在浏览器中打开HTML文件可能无法正常加载模型）。例如，您可以使用Python的简易HTTP服务器：

```bash
cd 3d-model-annotator
python -m http.server
```

然后在浏览器中访问`http://localhost:8000`

## 自定义标注

要自定义标注的外观，可以修改`css/style.css`文件中的`.annotation`相关样式。

要调整模型的颜色和材质，可以修改`main.js`文件中的`loadModel`函数中的材质设置：

```javascript
const material = new THREE.MeshStandardMaterial({
    color: 0x0055ff,  // 修改颜色代码
    flatShading: true
});
```

## 技术要求

- 现代Web浏览器（支持WebGL）
- 如果您的PLY模型过大，可能需要优化或减少多边形数量

## 注意事项

- 标注位置是相对于模型的，您可能需要根据实际模型调整位置坐标
- 对于一些复杂的模型，可能需要调整相机和光照设置以获得最佳效果 