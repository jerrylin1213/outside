import argparse
import errno
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen
import webbrowser


def open_browser(url):
    if not webbrowser.open(url):
        print("無法自動開啟瀏覽器，請手動開啟上方網址。", flush=True)


def main():
    parser = argparse.ArgumentParser(description="Open the local OUTSIDE travel guide.")
    parser.add_argument("--port", type=int, default=62097)
    args = parser.parse_args()
    directory = Path(__file__).resolve().parent
    handler = partial(SimpleHTTPRequestHandler, directory=str(directory))
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    except OSError as error:
        if error.errno != errno.EADDRINUSE:
            raise
        base = f"http://127.0.0.1:{args.port}"
        try:
            with urlopen(f"{base}/index.html", timeout=3) as response:
                header = response.read(4096)
        except (URLError, TimeoutError) as probe_error:
            raise RuntimeError(f"連接埠 {args.port} 已占用，無法確認是本指南；未啟動或關閉任何其他服務。") from probe_error
        if b'content="OUTSIDE Redmond Guide"' not in header:
            raise RuntimeError(f"連接埠 {args.port} 被其他服務使用。可用 --port 指定另一個埠，但那會使用另一份瀏覽器收藏。") from error
        url = f"{base}/index.html?style=atlas"
        print(f"\nOUTSIDE 已在執行，沿用相同網址與收藏：\n{url}\n", flush=True)
        open_browser(url)
        return
    with server:
        url = f"http://127.0.0.1:{server.server_port}/index.html?style=atlas"
        print(f"\nOUTSIDE — Redmond 週末旅行指南\n{url}\n\n按 Ctrl+C 關閉本機網站。\n", flush=True)
        open_browser(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\n本機網站已關閉。", flush=True)


if __name__ == "__main__":
    main()
