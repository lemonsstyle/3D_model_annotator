import glob
import http.server
import json
import os
import socket
import sys
from pathlib import PurePosixPath
from urllib.parse import urlparse, unquote


CONTENT_TYPES = {
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
    '.ply': 'application/ply',
}


def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def resource_base_path():
    return getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))


def resource_path(relative_path):
    return os.path.join(resource_base_path(), relative_path)


def build_search_roots(app_dir=None):
    roots = []
    cwd = os.getcwd()
    if cwd:
        roots.append(cwd)

    base_dir = resource_base_path()
    if base_dir:
        roots.append(base_dir)

    if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
        roots.append(sys._MEIPASS)

    if app_dir:
        roots.append(app_dir)
        parent = os.path.dirname(app_dir)
        if parent:
            roots.append(parent)

    seen = set()
    unique = []
    for root in roots:
        if root and root not in seen:
            seen.add(root)
            unique.append(root)
    return unique


def list_ply_files(models_directory):
    if models_directory:
        if not os.path.isdir(models_directory):
            return []
        return [
            os.path.join(models_directory, filename)
            for filename in os.listdir(models_directory)
            if filename.lower().endswith('.ply')
        ]

    models_dir = resource_path('models')
    if not os.path.exists(models_dir):
        os.makedirs(models_dir)
    return glob.glob(os.path.join(models_dir, '*.ply'))


def sanitize_relative_path(path):
    if path is None:
        return None
    decoded = unquote(path).replace('\\', '/')
    decoded = decoded.lstrip('/')
    if decoded == '':
        return None
    normalized = PurePosixPath(decoded)
    if normalized.is_absolute():
        return None
    if any(part == '..' for part in normalized.parts):
        return None
    return str(normalized)


def build_models_list(models_directory):
    ply_files = list_ply_files(models_directory)
    models = []
    for ply_file in ply_files:
        file_name = os.path.basename(ply_file)
        name = os.path.splitext(file_name)[0].replace('_', ' ').title()
        models.append({
            'name': name,
            'path': f"models/{file_name}"
        })
    return models


def resolve_model_path(model_name, models_directory):
    normalized = sanitize_relative_path(model_name)
    if not normalized:
        return None

    search_roots = []
    if models_directory:
        search_roots.append(models_directory)
    search_roots.append(resource_path('models'))

    for root in search_roots:
        candidate = os.path.normpath(os.path.join(root, normalized))
        try:
            root_real = os.path.realpath(root)
            candidate_real = os.path.realpath(candidate)
        except Exception:
            continue
        if os.path.commonpath([root_real, candidate_real]) != root_real:
            continue
        if os.path.exists(candidate_real) and os.path.isfile(candidate_real):
            return candidate_real
    return None


def resolve_static_file(path, search_roots):
    normalized = sanitize_relative_path(path)
    if not normalized:
        return None
    for root in search_roots:
        candidate = os.path.normpath(os.path.join(root, normalized))
        try:
            root_real = os.path.realpath(root)
            candidate_real = os.path.realpath(candidate)
        except Exception:
            continue
        if os.path.commonpath([root_real, candidate_real]) != root_real:
            continue
        if os.path.exists(candidate_real) and os.path.isfile(candidate_real):
            return candidate_real
    return None


class ModelServerHandler(http.server.SimpleHTTPRequestHandler):
    models_directory = None
    search_roots = None
    allow_cors = True
    disable_cache = True
    log_requests = False
    not_found_message = "File not found"
    model_not_found_message = "Model file not found"

    def _log(self, message):
        print(message)
        sys.stdout.flush()

    def log_message(self, format, *args):
        self._log(f"{self.address_string()} - {format % args}")

    def _send_cors_headers(self):
        if self.allow_cors:
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.send_header('Access-Control-Max-Age', '86400')

    def _send_cache_headers(self):
        if self.disable_cache:
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed_url = urlparse(self.path)
        path = parsed_url.path

        if self.log_requests:
            self._log(f"请求: {self.path}")

        if path == '/api/models':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self._send_cors_headers()
            self._send_cache_headers()
            self.end_headers()
            models = build_models_list(self.models_directory)
            self.wfile.write(json.dumps(models).encode())
            return

        if path.startswith('/models/'):
            model_name = unquote(path[8:])
            file_path = resolve_model_path(model_name, self.models_directory)
            if file_path is None:
                self.send_error(404, self.model_not_found_message)
                return

            self.send_response(200)
            self.send_header('Content-type', 'application/ply')
            self._send_cors_headers()
            self._send_cache_headers()
            self.send_header('Content-Length', str(os.path.getsize(file_path)))
            self.end_headers()
            try:
                with open(file_path, 'rb') as f:
                    self.wfile.write(f.read())
            except Exception as e:
                self.send_error(500, f"File read failed: {str(e)}")
            return

        rel_path = path.lstrip('/')
        if rel_path == '' or rel_path == '/':
            rel_path = 'index.html'

        search_roots = self.search_roots or build_search_roots()
        file_path = resolve_static_file(rel_path, search_roots)
        if file_path is None:
            self.send_error(404, self.not_found_message)
            return

        self.send_response(200)
        extension = os.path.splitext(file_path)[1].lower()
        content_type = CONTENT_TYPES.get(extension, 'application/octet-stream')
        self.send_header('Content-type', content_type)
        self._send_cors_headers()
        self._send_cache_headers()
        self.send_header('Content-Length', str(os.path.getsize(file_path)))
        self.end_headers()
        try:
            with open(file_path, 'rb') as f:
                self.wfile.write(f.read())
        except Exception as e:
            self.send_error(500, f"File read failed: {str(e)}")
