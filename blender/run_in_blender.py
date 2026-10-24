"""Envia um script Python para o Blender aberto, pelo add-on blender-mcp (localhost:9876).

É o mesmo comando `execute_code` que a ferramenta do Blender MCP usa. Com o Blender
fechado, rode o script direto: blender -b --python blender/build_bairro.py

    python blender/run_in_blender.py blender/build_bairro.py
"""

import json
import pathlib
import socket
import sys

HOST, PORT = "localhost", 9876


def send(command: dict, timeout: float = 600) -> dict:
    with socket.create_connection((HOST, PORT), timeout=timeout) as s:
        s.sendall(json.dumps(command).encode("utf-8"))
        buffer = b""
        while True:
            chunk = s.recv(65536)
            if not chunk:
                break
            buffer += chunk
            try:
                return json.loads(buffer.decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
    raise ConnectionError("Blender fechou a conexão sem responder")


def main() -> int:
    if len(sys.argv) < 2:
        print(send({"type": "get_scene_info", "params": {}}))
        return 0
    script = pathlib.Path(sys.argv[1]).resolve()
    repo = script.parent.parent
    code = f"REPO = {str(repo)!r}\n" + script.read_text(encoding="utf-8")
    reply = send({"type": "execute_code", "params": {"code": code}})
    if reply.get("status") != "success":
        print(reply.get("message", reply), file=sys.stderr)
        return 1
    print(reply["result"].get("result", ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
