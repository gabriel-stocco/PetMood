"""End-to-end smoke test against the deployed API (python -I aws/scripts/smoke.py).

Uses a throwaway *.teste@example.com account and deletes it at the end.
Never prints the API key.
"""

import base64
import json
import os
import secrets
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def read_env():
    values = {}
    with open(os.path.join(ROOT, ".env.deploy"), encoding="utf-8") as fh:
        for line in fh:
            if "=" in line and not line.startswith("#"):
                k, v = line.strip().split("=", 1)
                values[k] = v.strip('"')
    return values


API_URL = open(os.path.join(ROOT, ".api-url"), encoding="utf-8").read().strip()
API_KEY = read_env()["API_KEY"]


def call(path, body=None, token=None, key=True, method="POST"):
    headers = {"Content-Type": "application/json"}
    if key:
        headers["x-api-key"] = API_KEY
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body or {}).encode("utf-8") if method == "POST" else None
    req = urllib.request.Request(API_URL + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read()
            ctype = resp.headers.get("content-type", "")
            return resp.status, (json.loads(raw) if "json" in ctype else raw)
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read() or b"{}")


results = []


def check(label, cond):
    results.append(cond)
    print(("PASS " if cond else "FAIL ") + label)


s, _ = call("/health", key=False, method="GET")
check("/health -> 200", s == 200)
s, _ = call("/login", {}, key=False)
check("no key -> 401", s == 401)
s, _ = call("/getAll", {})
check("key without session -> 401", s == 401)

email = f"smoke.{secrets.token_hex(4)}.teste@example.com"
s, auth = call("/createAccount", {"nome": "Smoke Teste", "email": email, "senha": "senha-forte-123"})
check("createAccount -> 200", s == 200)
token = auth.get("accessToken")
s, _ = call("/login", {"email": email, "senha": "senha-forte-123"})
check("login -> 200", s == 200)
s, _ = call("/login", {"email": email, "senha": "errada-123"})
check("wrong password -> 401", s == 401)

jpeg = base64.b64encode(b"\xff\xd8\xff\xe0" + b"\x00" * 200).decode()
s, pet = call("/createAnimal", {"nome": "Rex", "especie": "Cachorro", "foto": "data:image/jpeg;base64," + jpeg}, token)
check("createAnimal with photo -> 200 (tables reachable through the boundary)", s == 200 and pet["foto"].startswith("/api/files/"))
s, raw = call("/files/" + pet["foto"].rsplit("/", 1)[1], method="GET")
check("photo served back", s == 200 and raw[:3] == b"\xff\xd8\xff")
s, vac = call("/createVaccine", {"id_animal": pet["id_animal"], "nome_vacina": "V10", "data_aplicacao": "2026-01-10"}, token)
check("createVaccine -> 200", s == 200)
s, ev = call("/createEvent", {"tipo_evento": "Consulta", "titulo": "Vet", "data": "2026-12-01", "horario": "10:00",
                              "animal": [{"tabela": "animal", "id_animal": pet["id_animal"], "nome": "Rex"}],
                              "notificacao_app": True}, token)
check("createEvent -> 200", s == 200)
s, data = call("/getAll", {}, token)
check("getAll shape", s == 200 and len(data) == 5 and len(data[1]["animais"]) == 1
      and len(data[1]["animais"][0]["vacinas"]) == 1 and len(data[2]["evento"]) == 1)
check("seeded tips (5) and ads (5)", len(data[3]["dicas"]) == 5 and len(data[4]["propaganda"]) == 5)
s, tip = call("/getTip", {"id_dicas": data[3]["dicas"][0]["id_dicas"]}, token)
check("getTip returns article", s == 200 and bool(tip.get("artigo")))
s, _ = call("/googleLogin", {"code": "x"})
check(f"googleLogin answers (status {s})", s in (401, 503))

s, _ = call("/deleteAccount", {}, token)
check("deleteAccount -> 200", s == 200)
s, _ = call("/getAll", {}, token)
check("deleted account session -> 401", s == 401)

print(f"\n{sum(results)}/{len(results)} checks passed")
raise SystemExit(0 if all(results) else 1)
