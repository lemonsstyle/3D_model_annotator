#!/usr/bin/env python3
import http.server
import socketserver
import json
import os
import glob
import sys
import argparse
import socket
from urllib.parse import urlparse, parse_qs, unquote

def get_local_ip():
    try:
        # 创建一个临时socket连接来获取本机IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"

# 添加支持PyInstaller打包的路径处理
def resource_path(relative_path):
    """获取资源的绝对路径，适用于开发环境和PyInstaller打包后的环境"""
    try:
        # PyInstaller创建临时文件夹并将路径存储在_MEIPASS中
        base_path = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
        return os.path.join(base_path, relative_path)
    except Exception:
        return os.path.join(os.path.dirname(os.path.abspath(__file__)), relative_path)

# 解析命令行参数
def parse_arguments():
    parser = argparse.ArgumentParser(description='3D点云查看器服务器')
    parser.add_argument('-p', '--port', type=int, default=8000,
                        help='指定服务器端口 (默认: 8000)')
    parser.add_argument('-d', '--models-dir', type=str, default=None,
                        help='指定PLY模型所在的目录路径，如果不指定则使用默认的models目录')
    return parser.parse_args()

# 自定义请求处理器
class CustomHandler(http.server.SimpleHTTPRequestHandler):
    models_directory = None  # 将在主函数中设置
    
    def do_GET(self):
        # 解析URL
        parsed_url = urlparse(self.path)
        path = parsed_url.path
        
        # 处理API请求
        if path == '/api/models':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')  # 允许跨域请求
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
            self.end_headers()
            
            # 获取模型目录中的所有PLY文件
            if self.models_directory:
                ply_files = []
                for filename in os.listdir(self.models_directory):
                    if filename.lower().endswith('.ply'):
                        ply_files.append(os.path.join(self.models_directory, filename))
            else:
                # 如果没有指定models_directory，使用默认的models目录
                models_dir = resource_path('models')
                if not os.path.exists(models_dir):
                    os.makedirs(models_dir)
                ply_files = glob.glob(os.path.join(models_dir, '*.ply'))
            
            # 构建模型列表
            models = []
            for ply_file in ply_files:
                file_name = os.path.basename(ply_file)
                name = os.path.splitext(file_name)[0].replace('_', ' ').title()
                # 使用完整路径，但前端请求时将使用models/作为前缀
                models.append({
                    'name': name,
                    'path': f"models/{file_name}"
                })
            
            # 返回JSON格式的模型列表
            self.wfile.write(json.dumps(models).encode())
            return
        
        # 处理模型文件请求
        elif path.startswith('/models/'):
            model_name = unquote(path[8:])  # 去除'/models/'前缀，并URL解码
            
            # 如果指定了自定义模型目录，则从该目录加载
            if self.models_directory:
                file_path = os.path.join(self.models_directory, model_name)
                if os.path.exists(file_path) and os.path.isfile(file_path):
                    self.send_response(200)
                    # 使用正确的MIME类型
                    self.send_header('Content-type', 'application/ply')
                    # 添加CORS头部
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
                    self.send_header('Pragma', 'no-cache')
                    self.send_header('Expires', '0')
                    # 添加Content-Length头部
                    self.send_header('Content-Length', str(os.path.getsize(file_path)))
                    self.end_headers()
                    
                    try:
                        # 以二进制模式打开文件
                        with open(file_path, 'rb') as f:
                            # 直接发送整个文件
                            self.wfile.write(f.read())
                        print(f"成功加载文件: {file_path}")
                        return
                    except Exception as e:
                        print(f"读取文件时出错: {file_path}, 错误: {str(e)}")
                        self.send_error(500, f"File read failed: {str(e)}")
                        return
                else:
                    print(f"文件不存在: {file_path}")
            
            # 如果没有自定义目录或文件不存在，尝试从默认models目录加载
            default_models_dir = resource_path('models')
            model_path = os.path.join(default_models_dir, model_name)
            
            if os.path.exists(model_path) and os.path.isfile(model_path):
                self.send_response(200)
                self.send_header('Content-type', 'application/ply')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
                self.send_header('Pragma', 'no-cache')
                self.send_header('Expires', '0')
                self.send_header('Content-Length', str(os.path.getsize(model_path)))
                self.end_headers()
                
                try:
                    with open(model_path, 'rb') as f:
                        self.wfile.write(f.read())
                    print(f"成功加载文件: {model_path}")
                    return
                except Exception as e:
                    print(f"读取文件时出错: {model_path}, 错误: {str(e)}")
                    self.send_error(500, f"File read failed: {str(e)}")
                    return
                
            # 如果都找不到，返回404
            self.send_error(404, "Model file not found")
            return
        
        # 处理其他请求（静态文件）
        else:
            # 移除开头的/
            if path.startswith('/'):
                path = path[1:]
            
            # 如果是空路径，使用index.html
            if path == '' or path == '/':
                path = 'index.html'
            
            # 获取文件的绝对路径
            file_path = resource_path(path)
            
            if os.path.exists(file_path) and os.path.isfile(file_path):
                self.send_response(200)
                
                # 设置合适的Content-Type
                extension = os.path.splitext(file_path)[1].lower()
                content_type = {
                    '.html': 'text/html',
                    '.css': 'text/css',
                    '.js': 'application/javascript',
                    '.json': 'application/json',
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.gif': 'image/gif',
                    '.svg': 'image/svg+xml',
                    '.ico': 'image/x-icon',
                    '.ttf': 'font/ttf',
                    '.woff': 'font/woff',
                    '.woff2': 'font/woff2',
                    '.ply': 'application/ply'
                }.get(extension, 'application/octet-stream')
                
                self.send_header('Content-type', content_type)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Length', str(os.path.getsize(file_path)))
                self.end_headers()
                
                try:
                    with open(file_path, 'rb') as f:
                        self.wfile.write(f.read())
                    return
                except Exception as e:
                    print(f"读取文件时出错: {file_path}, 错误: {str(e)}")
                    self.send_error(500, f"File read failed: {str(e)}")
                    return
            
            # 文件未找到
            self.send_error(404, "File not found")
            return
    
    def log_message(self, format, *args):
        # 覆盖默认日志方法，确保输出到控制台
        print(f"{self.address_string()} - {format % args}")
        sys.stdout.flush()  # 确保输出立即显示

def main():
    # 解析命令行参数
    args = parse_arguments()
    
    # 获取端口号
    port = args.port
    
    # 设置模型目录
    models_dir = args.models_dir
    CustomHandler.models_directory = models_dir
    
    if models_dir:
        print(f"使用自定义模型目录: {models_dir}")
        if not os.path.exists(models_dir):
            print(f"警告: 指定的模型目录不存在: {models_dir}")
            sys.exit(1)
        
        # 检查目录中是否有PLY文件
        ply_files = []
        all_files = os.listdir(models_dir)
        for filename in all_files:
            if filename.lower().endswith('.ply'):
                ply_files.append(filename)
                
        if not ply_files:
            print(f"警告: 指定的模型目录中没有找到PLY文件")
            print(f"目录内容: {', '.join(all_files[:10])}")
        else:
            print(f"在目录中找到 {len(ply_files)} 个PLY文件")
    else:
        # 检查默认models目录是否存在
        default_models_dir = resource_path('models')
        if not os.path.exists(default_models_dir):
            os.makedirs(default_models_dir)
            print(f"创建了默认models目录: {default_models_dir}")
        
        # 检查models目录中是否有PLY文件
        ply_files = glob.glob(os.path.join(default_models_dir, '*.ply'))
        if not ply_files:
            print("警告: 默认models目录中没有PLY文件")
        else:
            print(f"在默认models目录中找到 {len(ply_files)} 个PLY文件")
    
    print(f"启动服务器在端口 {port}...")
    
    # 创建服务器
    try:
        # 使用当前目录作为服务器根目录
        os.chdir(os.path.dirname(os.path.abspath(__file__)))
        
        with socketserver.TCPServer(("0.0.0.0", port), CustomHandler) as httpd:
            print(f"服务器运行在端口 {port}")
            print(f"在浏览器中访问: http://localhost:{port}")
            print(f"在浏览器中访问: http://{get_local_ip()}:{port}")
            
            # 启动服务器
            httpd.serve_forever()
    except OSError as e:
        if e.errno == 98:  # 地址已被使用
            print(f"错误: 端口 {port} 已被占用，请尝试其他端口")
        else:
            print(f"服务器错误: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("服务器已停止")
        sys.exit(0)
    except Exception as e:
        print(f"未知错误: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main() 