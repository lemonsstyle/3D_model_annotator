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
import socketserver
import socket

from server_common import ModelServerHandler, build_search_roots, get_local_ip

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
        handler = ModelServerHandler
        handler.models_directory = models_dir
        handler.search_roots = build_search_roots(os.path.dirname(os.path.abspath(__file__)))
        handler.log_requests = True
        handler.not_found_message = "文件未找到"
        handler.model_not_found_message = "模型文件未找到"
        
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
            self.httpd = socketserver.TCPServer(("0.0.0.0", port), handler)
            
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
