此文件夹用于存放自定义字体文件，如果您需要在模型上添加3D文本。

注意：当前版本的应用程序使用HTML元素作为标注，不需要加载额外的字体文件。
但如果您需要在3D场景中直接渲染文本（而不是使用HTML标签），可以在此文件夹中放置字体文件。

Three.js支持的字体格式是经过转换的JSON格式。您可以使用Three.js提供的工具将标准字体转换为所需格式：
https://gero3.github.io/facetype.js/

要在程序中使用自定义字体进行3D文本渲染，需要修改代码，例如：

```javascript
const loader = new THREE.FontLoader();
loader.load('fonts/your_font.json', function(font) {
    const textGeometry = new THREE.TextGeometry('文本内容', {
        font: font,
        size: 0.1,
        height: 0.02
    });
    const textMaterial = new THREE.MeshBasicMaterial({color: 0xff0000});
    const textMesh = new THREE.Mesh(textGeometry, textMaterial);
    scene.add(textMesh);
});
``` 