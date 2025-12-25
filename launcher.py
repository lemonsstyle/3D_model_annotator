#!/usr/bin/env python3
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
import os
import subprocess
import signal
import shutil
import glob
import sys
import webbrowser
import threading
import time
import platform
import http.server
import socketserver
import json
from urllib.parse import urlparse, parse_qs, unquote
import socket

# 添加支持PyInstaller打包的路径处理
def resource_path(relative_path):
    """获取资源的绝对路径，适用于开发环境和PyInstaller打包后的环境"""
    try:
        # PyInstaller创建临时文件夹并将路径存储在_MEIPASS中
        base_path = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
        return os.path.join(base_path, relative_path)
    except Exception:
        return os.path.join(os.path.dirname(os.path.abspath(__file__)), relative_path)

def get_local_ip():
    """获取本机IP地址"""
    try:
        # 创建一个临时socket连接来获取本机IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"

# 自定义请求处理器
class CustomHandler(http.server.SimpleHTTPRequestHandler):
    models_directory = None  # 将在服务器启动时设置
    launcher = None  # 对启动器的引用，用于记录日志

    def log_error(self, format, *args):
        """记录错误信息"""
        self.log_message(f"错误: {format % args}")
    
    def log_message(self, format, *args):
        """记录消息"""
        sys.stderr.write(f"{self.address_string()} - {format % args}\n")
        sys.stderr.flush()
    
    def do_GET(self):
        # 添加完整的CORS头部
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Max-Age', '86400')  # 24小时
        
        # 处理OPTIONS请求
        if self.command == 'OPTIONS':
            self.send_response(200)
            self.end_headers()
            return
        
        # 解析URL
        parsed_url = urlparse(self.path)
        path = parsed_url.path
        
        # 记录每个请求
        self.log_message(f"收到请求: {self.path} (路径: {path})")
        
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
                try:
                    for filename in os.listdir(self.models_directory):
                        if filename.lower().endswith('.ply'):
                            ply_files.append(os.path.join(self.models_directory, filename))
                except Exception as e:
                    self.log_error(f"读取模型目录时出错: {str(e)}")
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
            response_data = json.dumps(models).encode()
            self.wfile.write(response_data)
            self.log_message(f"API响应: 返回 {len(models)} 个模型")
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
                        self.log_message(f"成功加载文件: {file_path}")
                        return
                    except Exception as e:
                        self.log_error(f"读取文件时出错: {file_path}, 错误: {str(e)}")
                        self.send_error(500, f"读取文件失败: {str(e)}")
                        return
                else:
                    self.log_message(f"文件不存在: {file_path}")
            
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
                    self.log_message(f"成功加载文件: {model_path}")
                    return
                except Exception as e:
                    self.log_error(f"读取文件时出错: {model_path}, 错误: {str(e)}")
                    self.send_error(500, f"读取文件失败: {str(e)}")
                    return
                
            # 如果都找不到，返回404
            self.send_error(404, "模型文件未找到")
            return

        # 处理其他请求（静态文件）
        else:
            # 移除开头的/
            if path.startswith('/'):
                path = path[1:]
            
            # 如果是空路径，使用index.html
            if path == '' or path == '/':
                path = 'index.html'
            
            # 记录文件请求
            self.log_message(f"请求文件: {path}")
            
            # 尝试多个位置查找文件
            file_paths_to_try = []
            
            # 1. 直接在当前工作目录中查找
            file_paths_to_try.append(os.path.join(os.getcwd(), path))
            
            # 2. 使用resource_path辅助函数
            file_paths_to_try.append(resource_path(path))
            
            # 3. 在PyInstaller环境中查找
            if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
                file_paths_to_try.append(os.path.join(sys._MEIPASS, path))
            
            # 4. 尝试查找相对于应用目录的路径
            app_dir = os.path.dirname(os.path.abspath(__file__))
            file_paths_to_try.append(os.path.join(app_dir, path))
            
            # 5. 尝试上级目录
            file_paths_to_try.append(os.path.join(os.path.dirname(app_dir), path))
            
            # 记录尝试的路径
            self.log_message(f"尝试查找文件的路径:")
            for i, try_path in enumerate(file_paths_to_try):
                self.log_message(f"  {i+1}. {try_path}")
            
            # 尝试每个可能的路径
            for file_path in file_paths_to_try:
                if os.path.exists(file_path) and os.path.isfile(file_path):
                    try:
                        self.log_message(f"找到文件: {file_path}")
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
                        
                        self.log_message(f"设置响应类型: {content_type}")
                        self.send_header('Content-type', content_type)
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
                        self.send_header('Pragma', 'no-cache')
                        self.send_header('Expires', '0')
                        
                        # 获取文件大小
                        file_size = os.path.getsize(file_path)
                        self.send_header('Content-Length', str(file_size))
                        self.end_headers()
                        
                        # 打开并发送文件内容
                        with open(file_path, 'rb') as f:
                            file_content = f.read()
                            self.wfile.write(file_content)
                            
                        self.log_message(f"成功发送文件 {path}, 大小: {file_size} 字节")
                        return
                    except Exception as e:
                        self.log_error(f"读取/发送文件时出错: {file_path}, 错误: {str(e)}")
                        continue  # 尝试下一个路径
            
            # 如果所有路径都失败，尝试作为js/路径的特殊情况处理
            if path.startswith('js/'):
                js_file = path[3:]  # 去除'js/'前缀
                self.log_message(f"特殊处理js文件: {js_file}")
                
                # 尝试在多个位置查找js文件
                js_paths_to_try = []
                
                # 1. 在各种可能的js目录中查找
                js_paths_to_try.append(os.path.join(os.getcwd(), 'js', js_file))
                js_paths_to_try.append(resource_path(os.path.join('js', js_file)))
                
                if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
                    js_paths_to_try.append(os.path.join(sys._MEIPASS, 'js', js_file))
                
                app_dir = os.path.dirname(os.path.abspath(__file__))
                js_paths_to_try.append(os.path.join(app_dir, 'js', js_file))
                js_paths_to_try.append(os.path.join(os.path.dirname(app_dir), 'js', js_file))
                
                # 记录尝试的js路径
                self.log_message(f"尝试查找js文件的路径:")
                for i, try_path in enumerate(js_paths_to_try):
                    self.log_message(f"  {i+1}. {try_path}")
                
                # 尝试每个可能的js路径
                for js_path in js_paths_to_try:
                    if os.path.exists(js_path) and os.path.isfile(js_path):
                        try:
                            self.log_message(f"找到js文件: {js_path}")
                            self.send_response(200)
                            self.send_header('Content-type', 'application/javascript')
                            self.send_header('Access-Control-Allow-Origin', '*')
                            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
                            self.send_header('Pragma', 'no-cache')
                            self.send_header('Expires', '0')
                            
                            # 获取文件大小
                            file_size = os.path.getsize(js_path)
                            self.send_header('Content-Length', str(file_size))
                            self.end_headers()
                            
                            # 打开并发送文件内容
                            with open(js_path, 'rb') as f:
                                file_content = f.read()
                                self.wfile.write(file_content)
                                
                            self.log_message(f"成功发送js文件 {js_file}, 大小: {file_size} 字节")
                            return
                        except Exception as e:
                            self.log_error(f"读取/发送js文件时出错: {js_path}, 错误: {str(e)}")
                            continue  # 尝试下一个路径
            
            # 文件未找到或无法读取
            self.log_error(f"警告: 文件未找到: {path}")
            self.send_error(404, "文件未找到")
            return

class PLYViewerLauncher:
    def __init__(self, root):
        self.root = root
        self.root.title("3D点云模型查看启动工具")
        self.root.geometry("600x400")
        self.root.resizable(True, True)
        
        # 设置窗口图标（如果有的话）
        try:
            self.root.iconbitmap("icon.ico")
        except:
            pass  # 如果图标不存在，忽略错误
        
        # 应用程序状态
        self.server = None
        self.httpd = None
        self.selected_folder = ""
        self.port = 8000  # 默认端口
        self.server_thread = None
        self.running = False
        
        # 创建主框架
        main_frame = ttk.Frame(root, padding="20")
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # 创建顶部部分 - 文件夹选择
        folder_frame = ttk.LabelFrame(main_frame, text="选择PLY模型文件夹", padding="10")
        folder_frame.pack(fill=tk.X, padx=10, pady=10)
        
        self.folder_path_var = tk.StringVar()
        folder_entry = ttk.Entry(folder_frame, textvariable=self.folder_path_var, width=50)
        folder_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 10))
        
        browse_button = ttk.Button(folder_frame, text="浏览...", command=self.browse_folder)
        browse_button.pack(side=tk.RIGHT)
        
        # 服务器配置
        server_frame = ttk.LabelFrame(main_frame, text="服务器设置", padding="10")
        server_frame.pack(fill=tk.X, padx=10, pady=10)
        self.server_frame = server_frame  # 保存引用
        
        port_label = ttk.Label(server_frame, text="端口:")
        port_label.pack(side=tk.LEFT, padx=(0, 5))
        
        self.port_var = tk.StringVar(value=str(self.port))
        port_entry = ttk.Entry(server_frame, textvariable=self.port_var, width=6)
        port_entry.pack(side=tk.LEFT, padx=(0, 20))
        
        # 创建按钮部分
        button_frame = ttk.Frame(main_frame)
        button_frame.pack(fill=tk.X, padx=10, pady=10)
        
        self.start_button = ttk.Button(button_frame, text="启动服务器", command=self.start_server)
        self.start_button.pack(side=tk.LEFT, padx=5)
        
        self.stop_button = ttk.Button(button_frame, text="停止服务器", command=self.stop_server, state=tk.DISABLED)
        self.stop_button.pack(side=tk.LEFT, padx=5)
        
        self.open_browser_button = ttk.Button(button_frame, text="在浏览器中打开", command=self.open_browser, state=tk.DISABLED)
        self.open_browser_button.pack(side=tk.LEFT, padx=5)
        
        # 创建状态和输出部分
        status_frame = ttk.LabelFrame(main_frame, text="服务器状态", padding="10")
        status_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        self.status_var = tk.StringVar(value="未运行")
        status_label = ttk.Label(status_frame, textvariable=self.status_var)
        status_label.pack(anchor=tk.W)
        
        # 添加控制台输出文本框
        console_frame = ttk.Frame(status_frame)
        console_frame.pack(fill=tk.BOTH, expand=True, pady=(10, 0))
        
        # 创建滚动条
        scrollbar = ttk.Scrollbar(console_frame)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # 创建文本框并配置滚动条
        self.console_text = tk.Text(console_frame, height=10, wrap=tk.WORD, bg="#f0f0f0",
                                  yscrollcommand=scrollbar.set)
        self.console_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        # 配置滚动条
        scrollbar.config(command=self.console_text.yview)
        
        # 设置初始状态
        self.console_text.insert(tk.END, "欢迎使用3D点云模型查看器启动工具!\n")
        self.console_text.insert(tk.END, "请选择包含PLY模型的文件夹，然后点击'启动服务器'按钮。\n")
        self.console_text.config(state=tk.DISABLED)  # 设置为只读
        
    def browse_folder(self):
        """打开文件夹选择对话框"""
        folder = filedialog.askdirectory(title="选择包含PLY模型的文件夹")
        if folder:
            self.selected_folder = folder
            self.folder_path_var.set(folder)
            self.log_message(f"已选择文件夹: {folder}")
            
            # 检查文件夹中是否有PLY文件 - 不区分大小写
            ply_files = []
            all_files = os.listdir(folder)
            for filename in all_files:
                if filename.lower().endswith('.ply'):
                    ply_files.append(os.path.join(folder, filename))
            
            if ply_files:
                self.log_message(f"找到 {len(ply_files)} 个PLY文件: {', '.join([os.path.basename(f) for f in ply_files[:5]])}")
                if len(ply_files) > 5:
                    self.log_message(f"以及其他 {len(ply_files) - 5} 个文件...")
            else:
                self.log_message("警告: 所选文件夹中没有找到PLY文件")
                if all_files:
                    self.log_message(f"文件夹内容: {', '.join(all_files[:10])}")
                else:
                    self.log_message("文件夹为空")
    
    def run_server(self, port, models_dir):
        """在线程中运行HTTP服务器"""
        # 设置自定义处理器类的模型目录
        CustomHandler.models_directory = models_dir
        CustomHandler.launcher = self
        
        # 尝试在指定端口创建服务器
        try:
            self.log_message(f"正在端口 {port} 上启动服务器...")
            
            # 确定应用目录并设置为工作目录
            app_dir = os.path.dirname(os.path.abspath(__file__))
            self.log_message(f"应用目录: {app_dir}")
            
            # 列出应用目录中的文件和文件夹
            try:
                self.log_message("应用目录内容:")
                for item in os.listdir(app_dir):
                    item_path = os.path.join(app_dir, item)
                    if os.path.isdir(item_path):
                        self.log_message(f"   目录: {item}")
                    else:
                        self.log_message(f"   文件: {item}")
            except Exception as e:
                self.log_message(f"无法列出目录内容: {str(e)}")
            
            # 检查js目录是否存在
            js_dir = os.path.join(app_dir, "js")
            if os.path.exists(js_dir):
                self.log_message(f"找到js目录: {js_dir}")
                try:
                    self.log_message("js目录内容:")
                    for item in os.listdir(js_dir):
                        self.log_message(f"   {item}")
                except Exception as e:
                    self.log_message(f"无法列出js目录内容: {str(e)}")
            else:
                self.log_message(f"警告: 找不到js目录!")
                
                # 尝试在PyInstaller环境中查找
                if getattr(sys, 'frozen', False):
                    self.log_message("检查PyInstaller环境中的js目录...")
                    meipass_dir = getattr(sys, '_MEIPASS', None)
                    if meipass_dir:
                        self.log_message(f"PyInstaller临时目录: {meipass_dir}")
                        meipass_js_dir = os.path.join(meipass_dir, "js")
                        if os.path.exists(meipass_js_dir):
                            self.log_message(f"在PyInstaller临时目录中找到js目录")
                            try:
                                self.log_message("临时目录的js目录内容:")
                                for item in os.listdir(meipass_js_dir):
                                    self.log_message(f"   {item}")
                            except Exception as e:
                                self.log_message(f"无法列出临时目录的js目录内容: {str(e)}")
            
            # 使用当前目录作为服务器根目录
            os.chdir(app_dir)
            self.log_message(f"已将工作目录设置为: {os.getcwd()}")
            
            # 创建服务器
            self.httpd = socketserver.TCPServer(("0.0.0.0", port), CustomHandler)
            
            # 记录成功信息
            self.log_message(f"服务器运行在端口 {port}")
            self.log_message(f"在浏览器中访问: http://localhost:{port}")
            self.log_message(f"在浏览器中访问: http://{get_local_ip()}:{port}")
            
            # 运行服务器，直到停止标志被设置
            self.httpd.serve_forever()
        
        except OSError as e:
            if hasattr(e, 'errno') and e.errno == 10048:  # Windows上的端口已被使用错误
                self.log_message(f"错误: 端口 {port} 已被占用，请尝试其他端口")
            else:
                self.log_message(f"服务器错误: {str(e)}")
            # 通知主线程服务器启动失败
            self.root.after(0, self.handle_server_stop)
        
        except Exception as e:
            self.log_message(f"服务器出现未知错误: {str(e)}")
            # 通知主线程服务器启动失败
            self.root.after(0, self.handle_server_stop)
    
    def start_server(self):
        """启动Web服务器"""
        if not self.selected_folder:
            messagebox.showerror("错误", "请先选择包含PLY模型的文件夹")
            return
        
        # 获取端口号
        try:
            self.port = int(self.port_var.get())
            if not (1 <= self.port <= 65535):
                raise ValueError("端口号必须在1-65535之间")
        except ValueError as e:
            messagebox.showerror("错误", f"无效的端口号: {str(e)}")
            return
        
        # 检查是否已有服务器在运行
        if self.running:
            messagebox.showinfo("提示", "服务器已经在运行中")
            return
        
        # 设置运行标志
        self.running = True
        self.status_var.set(f"运行中 (端口: {self.port})")
        
        # 更新按钮状态
        self.start_button.config(state=tk.DISABLED)
        self.stop_button.config(state=tk.NORMAL)
        self.open_browser_button.config(state=tk.NORMAL)
        
        # 禁用端口输入框
        for widget in self.server_frame.winfo_children():
            if isinstance(widget, ttk.Entry):
                widget.config(state=tk.DISABLED)
        
        # 在新线程中启动服务器
        self.server_thread = threading.Thread(
            target=self.run_server,
            args=(self.port, self.selected_folder),
            daemon=True
        )
        self.server_thread.start()
    
    def stop_server(self):
        """停止Web服务器"""
        if not self.running:
            return
        
        self.running = False
        self.log_message("正在停止服务器...")
        
        # 关闭HTTP服务器
        if self.httpd:
            threading.Thread(target=self.httpd.shutdown, daemon=True).start()
            self.httpd = None
        
        # 等待服务器线程结束
        if self.server_thread and self.server_thread.is_alive():
            self.server_thread.join(2.0)  # 最多等待2秒
        
        self.status_var.set("已停止")
        self.log_message("服务器已停止")
        
        # 更新按钮状态
        self.start_button.config(state=tk.NORMAL)
        self.stop_button.config(state=tk.DISABLED)
        self.open_browser_button.config(state=tk.DISABLED)
        
        # 启用端口输入框
        for widget in self.server_frame.winfo_children():
            if isinstance(widget, ttk.Entry):
                widget.config(state=tk.NORMAL)
    
    def handle_server_stop(self):
        """处理服务器停止事件"""
        self.running = False
        self.status_var.set("已停止")
        self.log_message("服务器意外停止")
        
        # 更新按钮状态
        self.start_button.config(state=tk.NORMAL)
        self.stop_button.config(state=tk.DISABLED)
        self.open_browser_button.config(state=tk.DISABLED)
        
        # 启用端口输入框
        for widget in self.server_frame.winfo_children():
            if isinstance(widget, ttk.Entry):
                widget.config(state=tk.NORMAL)
    
    def open_browser(self):
        """在浏览器中打开服务器地址"""
        webbrowser.open(f"http://localhost:{self.port}")
    
    def log_message(self, message):
        """向控制台添加消息"""
        self.console_text.config(state=tk.NORMAL)
        self.console_text.insert(tk.END, str(message) + "\n")
        self.console_text.see(tk.END)
        self.console_text.config(state=tk.DISABLED)
    
    def on_closing(self):
        """窗口关闭时的处理"""
        if self.running:
            result = messagebox.askyesno("确认", "服务器正在运行。是否确定退出？")
            if not result:
                return
            self.stop_server()
        self.root.destroy()

if __name__ == "__main__":
    root = tk.Tk()
    app = PLYViewerLauncher(root)
    root.protocol("WM_DELETE_WINDOW", app.on_closing)
    root.mainloop() 