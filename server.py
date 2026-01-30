#!/usr/bin/env python3
import socketserver
import os
import sys
import argparse
import glob
from server_common import ModelServerHandler, build_search_roots, get_local_ip, resource_path

# 解析命令行参数
def parse_arguments():
    parser = argparse.ArgumentParser(description='3D点云查看器服务器')
    parser.add_argument('-p', '--port', type=int, default=8000,
                        help='指定服务器端口 (默认: 8000)')
    parser.add_argument('-d', '--models-dir', type=str, default=None,
                        help='指定PLY模型所在的目录路径，如果不指定则使用默认的models目录')
    return parser.parse_args()

def main():
    # 解析命令行参数
    args = parse_arguments()
    
    # 获取端口号
    port = args.port
    
    # 设置模型目录
    models_dir = args.models_dir
    handler = ModelServerHandler
    handler.models_directory = models_dir
    handler.search_roots = build_search_roots(os.path.dirname(os.path.abspath(__file__)))
    handler.log_requests = False
    
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
        
        with socketserver.TCPServer(("0.0.0.0", port), handler) as httpd:
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
