"""Unit tests for aws/lambda/handler.py with in-memory DynamoDB/S3 fakes.

Run:  python -I aws/tests/test_handler.py
boto3/botocore are stubbed, so nothing here talks to AWS.
"""

import base64
import copy
import json
import os
import sys
import types
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lambda"))

# --- stub boto3 / botocore -------------------------------------------------


class ClientError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.response = {"Error": {"Code": code}}


class _KeyCond:
    def __init__(self, name):
        self.name = name

    def eq(self, value):
        return (self.name, value)


botocore = types.ModuleType("botocore")
botocore_exc = types.ModuleType("botocore.exceptions")
botocore_exc.ClientError = ClientError
boto3 = types.ModuleType("boto3")
boto3_dynamodb = types.ModuleType("boto3.dynamodb")
boto3_conditions = types.ModuleType("boto3.dynamodb.conditions")
boto3_conditions.Key = _KeyCond
sys.modules.update({
    "botocore": botocore,
    "botocore.exceptions": botocore_exc,
    "boto3": boto3,
    "boto3.dynamodb": boto3_dynamodb,
    "boto3.dynamodb.conditions": boto3_conditions,
})

os.environ.update({"API_KEY": "test-key", "JWT_SECRET": "test-secret", "BUCKET": "test-bucket",
                   "GOOGLE_CLIENT_ID": "cid.apps.googleusercontent.com", "GOOGLE_CLIENT_SECRET": "csecret"})
import handler as h  # noqa: E402


class FakeTable:
    def __init__(self, keys):
        self.keys = keys
        self.items = {}

    def _k(self, item):
        return tuple(item[k] for k in self.keys)

    def put_item(self, Item, ConditionExpression=None):
        k = self._k(Item)
        if ConditionExpression and k in self.items:
            raise ClientError("ConditionalCheckFailedException")
        self.items[k] = copy.deepcopy(Item)

    def get_item(self, Key):
        item = self.items.get(self._k(Key))
        return {"Item": copy.deepcopy(item)} if item else {}

    def delete_item(self, Key):
        self.items.pop(self._k(Key), None)

    def update_item(self, Key, UpdateExpression, ExpressionAttributeValues):
        item = self.items[self._k(Key)]
        for part in UpdateExpression.replace("SET ", "").split(","):
            name, val = [p.strip() for p in part.split("=")]
            item[name] = ExpressionAttributeValues[val]

    def query(self, KeyConditionExpression, **_):
        name, value = KeyConditionExpression
        return {"Items": [copy.deepcopy(i) for i in self.items.values() if i.get(name) == value]}

    def scan(self, **_):
        return {"Items": [copy.deepcopy(i) for i in self.items.values()]}


class FakeBody:
    def __init__(self, data):
        self.data = data

    def read(self):
        return self.data


class FakeS3:
    def __init__(self):
        self.objects = {}

    def put_object(self, Bucket, Key, Body, ContentType):
        self.objects[Key] = (Body, ContentType)

    def get_object(self, Bucket, Key):
        if Key not in self.objects:
            raise ClientError("NoSuchKey")
        return {"Body": FakeBody(self.objects[Key][0])}

    def delete_object(self, Bucket, Key):
        self.objects.pop(Key, None)


JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
JPEG_DATA_URL = "data:image/jpeg;base64," + base64.b64encode(JPEG).decode()


def reset():
    h._tables.clear()
    h._tables.update({
        "users": FakeTable(["id_usuario"]),
        "identities": FakeTable(["ident"]),
        "animals": FakeTable(["id_usuario", "id_animal"]),
        "vaccines": FakeTable(["id_usuario", "id_vacina"]),
        "events": FakeTable(["id_usuario", "id_evento"]),
        "tips": FakeTable(["id_dicas"]),
        "ads": FakeTable(["id_propaganda"]),
        "files": FakeTable(["name"]),
    })
    h._tables["tips"].put_item(Item={"id_dicas": "dica-01", "titulo": "T", "especie": "Cachorro", "tag": "x", "artigo": "A", "ordem": 1})
    h._tables["ads"].put_item(Item={"id_propaganda": "prop-01", "foto": "https://x/y.jpg", "link": "https://l", "nome": "N", "ordem": 1})
    h._s3 = FakeS3()


def call(path, body=None, token=None, method="POST", key="test-key"):
    headers = {}
    if key is not None:
        headers["x-api-key"] = key
    if token:
        headers["authorization"] = f"Bearer {token}"
    event = {"rawPath": path, "requestContext": {"http": {"method": method}}, "headers": headers,
             "body": json.dumps(body) if body is not None else None}
    res = h.handler(event)
    payload = res["body"]
    if not res.get("isBase64Encoded"):
        payload = json.loads(payload)
    return res["statusCode"], payload


def signup(email="ana.teste@example.com", senha="senha1234", **extra):
    status, body = call("/createAccount", {"nome": "Ana", "email": email, "senha": senha, **extra})
    assert status == 200, body
    return body["accessToken"], body["id_usuario"]


class GatewayChecks(unittest.TestCase):
    def setUp(self):
        reset()

    def test_health_is_public(self):
        self.assertEqual(call("/health", method="GET", key=None)[0], 200)

    def test_missing_or_wrong_key_is_401(self):
        self.assertEqual(call("/login", {}, key=None)[0], 401)
        self.assertEqual(call("/login", {}, key="nope")[0], 401)

    def test_protected_route_without_token_is_401(self):
        self.assertEqual(call("/getAll", {})[0], 401)

    def test_forged_token_is_401(self):
        token, _ = signup()
        header, payload, sig = token.split(".")
        forged = json.loads(h._b64d(payload))
        forged["sub"] = "usr-someone-else"
        bad = f"{header}.{h._b64e(json.dumps(forged).encode())}.{sig}"
        self.assertEqual(call("/getAll", {}, token=bad)[0], 401)
        none_alg = h._b64e(b'{"alg":"none"}') + "." + payload + "."
        self.assertEqual(call("/getAll", {}, token=none_alg)[0], 401)

    def test_unknown_route_404_and_wrong_method_405(self):
        self.assertEqual(call("/nope", {})[0], 404)
        self.assertEqual(call("/login", method="PUT")[0], 405)

    def test_fails_closed_without_config(self):
        with mock.patch.object(h, "API_KEY", ""):
            self.assertEqual(call("/login", {})[0], 503)


class AuthFlows(unittest.TestCase):
    def setUp(self):
        reset()

    def test_signup_login_and_password_is_hashed(self):
        _, uid = signup()
        stored = h._tables["users"].items[(uid,)]
        self.assertTrue(stored["senha_hash"].startswith("scrypt$"))
        self.assertNotIn("senha1234", json.dumps(stored))
        status, body = call("/login", {"email": "ANA.teste@example.com ", "senha": "senha1234"})
        self.assertEqual(status, 200)
        self.assertEqual(body["id_usuario"], uid)
        self.assertEqual(call("/login", {"email": "ana.teste@example.com", "senha": "wrong-pass"})[0], 401)
        self.assertEqual(call("/login", {"email": "ghost@example.com", "senha": "whatever1"})[0], 401)

    def test_signup_validation(self):
        self.assertEqual(call("/createAccount", {"nome": "A", "email": "bad", "senha": "12345678"})[0], 400)
        self.assertEqual(call("/createAccount", {"nome": "A", "email": "a@b.co", "senha": "short"})[0], 400)
        s, b = call("/createAccount", {"nome": "A", "email": "a@b.co", "senha": "12345678", "celular": "11999999999"})
        self.assertEqual((s, b["message"]), (400, h.INVALID_CELLPHONE_MESSAGE))
        s, _ = call("/createAccount", {"nome": "A", "email": "a@b.co", "senha": "12345678", "notificacao_whatsapp": True})
        self.assertEqual(s, 400)
        s, _ = call("/createAccount", {"nome": "A", "email": "a@b.co", "senha": "12345678", "data_nascimento": "2999-01-01"})
        self.assertEqual(s, 400)
        s, _ = call("/createAccount", {"nome": "A", "email": "a@b.co", "senha": "12345678", "foto": "data:" + "a" * 300_001})
        self.assertEqual(s, 413)

    def test_duplicate_email_409(self):
        signup()
        self.assertEqual(call("/createAccount", {"nome": "B", "email": "ana.teste@example.com", "senha": "12345678"})[0], 409)

    def _google(self, claims):
        base = {"iss": "https://accounts.google.com", "aud": h.GOOGLE_CLIENT_ID, "exp": 9999999999, "iat": 1,
                "email_verified": True}
        base.update(claims)
        with mock.patch.object(h, "exchange_google_code", wraps=None) as ex:
            ex.side_effect = lambda code, redirect_uri="postmessage": base
            return call("/googleLogin", {"code": "abc"})

    def test_google_creates_account_without_password(self):
        status, body = self._google({"sub": "g-1", "email": "Bia.Teste@gmail.com", "name": "Bia", "picture": "https://lh3/x"})
        self.assertEqual(status, 200)
        user = h._tables["users"].items[(body["id_usuario"],)]
        self.assertEqual(user["email"], "bia.teste@gmail.com")
        self.assertNotIn("senha_hash", user)
        # Same Google account logs in to the same user
        self.assertEqual(self._google({"sub": "g-1", "email": "bia.teste@gmail.com"})[1]["id_usuario"], body["id_usuario"])
        # Password login is refused with a helpful message
        s, b = call("/login", {"email": "bia.teste@gmail.com", "senha": "whatever1"})
        self.assertEqual(s, 401)
        self.assertIn("Google", b["message"])
        # getAll exposes the flags but no secrets
        _, data = call("/getAll", {}, token=body["accessToken"])
        self.assertTrue(data[0]["login_google"])
        self.assertFalse(data[0]["possui_senha"])
        self.assertNotIn("google_sub", data[0])

    def test_google_links_existing_password_account(self):
        _, uid = signup(email="ana.teste@example.com")
        status, body = self._google({"sub": "g-2", "email": "ana.teste@example.com"})
        self.assertEqual((status, body["id_usuario"]), (200, uid))
        self.assertEqual(h._tables["users"].items[(uid,)]["google_sub"], "g-2")
        # password still works
        self.assertEqual(call("/login", {"email": "ana.teste@example.com", "senha": "senha1234"})[0], 200)

    def test_google_not_configured_is_503(self):
        with mock.patch.object(h, "GOOGLE_CLIENT_SECRET", ""):
            self.assertEqual(call("/googleLogin", {"code": "x"})[0], 503)

    def test_android_code_uses_empty_redirect_uri(self):
        seen = []
        with mock.patch.object(h, "exchange_google_code") as ex:
            ex.side_effect = lambda code, redirect_uri="postmessage": seen.append(redirect_uri) or {
                "iss": "https://accounts.google.com", "aud": h.GOOGLE_CLIENT_ID, "exp": 9999999999, "iat": 1,
                "email_verified": True, "sub": "g-9", "email": "and.teste@gmail.com"}
            self.assertEqual(call("/googleLogin", {"code": "a", "platform": "android"})[0], 200)
            self.assertEqual(call("/googleLogin", {"code": "b"})[0], 200)
        self.assertEqual(seen, ["", "postmessage"])

    def test_exchange_sends_redirect_uri(self):
        sent = {}

        class Resp:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def read(self):
                return b"{}"

        def fake_urlopen(req, timeout=0):
            sent.update(h.urllib.parse.parse_qs(req.data.decode(), keep_blank_values=True))
            return Resp()

        with mock.patch.object(h.urllib.request, "urlopen", side_effect=fake_urlopen):
            with self.assertRaises(h.ApiError):
                h.exchange_google_code("c", "")
        self.assertEqual(sent["redirect_uri"], [""])

    def test_exchange_rejects_wrong_audience(self):
        token = "h." + h._b64e(json.dumps({"iss": "accounts.google.com", "aud": "other", "exp": 9999999999,
                                            "iat": 1, "sub": "s", "email": "e@x.co", "email_verified": True}).encode()) + ".s"

        class Resp:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def read(self):
                return json.dumps({"id_token": token}).encode()

        with mock.patch.object(h.urllib.request, "urlopen", return_value=Resp()):
            with self.assertRaises(h.ApiError):
                h.exchange_google_code("c")


class S3Store(unittest.TestCase):
    def setUp(self):
        reset()

    def test_s3_backend_roundtrip(self):
        with mock.patch.object(h, "FILE_STORE", "s3"):
            token, _ = signup()
            _, pet = call("/createAnimal", {"nome": "Rex", "foto": JPEG_DATA_URL}, token)
            name = pet["foto"].rsplit("/", 1)[1]
            self.assertIn(f"img/{name}", h._s3.objects)
            res = h.handler({"rawPath": f"/files/{name}", "requestContext": {"http": {"method": "GET"}}, "headers": {"x-api-key": "test-key"}})
            self.assertEqual(base64.b64decode(res["body"]), JPEG)
            call("/deleteAnimal", {"id_animal": pet["id_animal"]}, token)
            self.assertEqual(h._s3.objects, {})


class DataFlows(unittest.TestCase):
    def setUp(self):
        reset()
        self.token, self.uid = signup()
        self.other_token, self.other_uid = signup(email="outro.teste@example.com")

    def test_animal_crud_with_photo_in_s3(self):
        s, pet = call("/createAnimal", {"nome": "Rex", "especie": "Cachorro", "foto": JPEG_DATA_URL, "id_usuario": "spoofed"}, self.token)
        self.assertEqual(s, 200)
        self.assertEqual(pet["id_usuario"], self.uid)  # body id ignored
        self.assertTrue(pet["foto"].startswith("/api/files/"))
        self.assertEqual(pet["vacinas"], [])
        name = pet["foto"].rsplit("/", 1)[1]
        self.assertIn((name,), h._tables["files"].items)
        # file is served as base64 bytes
        res = h.handler({"rawPath": f"/files/{name}", "requestContext": {"http": {"method": "GET"}}, "headers": {"x-api-key": "test-key"}})
        self.assertEqual(res["statusCode"], 200)
        self.assertEqual(base64.b64decode(res["body"]), JPEG)
        # unchanged photo path is kept; another user's path is refused
        s, upd = call("/updateAnimal", {"id_animal": pet["id_animal"], "nome": "Rexy", "foto": pet["foto"]}, self.token)
        self.assertEqual((s, upd["foto"], upd["nome"]), (200, pet["foto"], "Rexy"))
        s, _ = call("/createAnimal", {"nome": "X", "foto": pet["foto"]}, self.other_token)
        self.assertEqual(s, 400)
        # other user cannot touch it
        self.assertEqual(call("/updateAnimal", {"id_animal": pet["id_animal"], "nome": "hack"}, self.other_token)[0], 403)
        self.assertEqual(call("/deleteAnimal", {"id_animal": pet["id_animal"]}, self.other_token)[0], 403)
        # replacing the photo deletes the old object
        s, upd = call("/updateAnimal", {"id_animal": pet["id_animal"], "foto": JPEG_DATA_URL}, self.token)
        self.assertNotIn((name,), h._tables["files"].items)
        # delete cascades vaccines and photos
        call("/createVaccine", {"id_animal": pet["id_animal"], "nome_vacina": "V10", "foto_carteira": JPEG_DATA_URL}, self.token)
        s, _ = call("/deleteAnimal", {"id_animal": pet["id_animal"]}, self.token)
        self.assertEqual(s, 200)
        self.assertEqual(h._tables["vaccines"].items, {})
        self.assertEqual(h._tables["files"].items, {})

    def test_future_birth_date_and_bad_image(self):
        self.assertEqual(call("/createAnimal", {"nome": "R", "data_nascimento": "2999-01-01"}, self.token)[0], 400)
        self.assertEqual(call("/createAnimal", {"nome": "R", "foto": "data:image/png;base64,AAAA"}, self.token)[0], 400)

    def test_vaccine_requires_own_animal(self):
        _, pet = call("/createAnimal", {"nome": "Rex"}, self.token)
        self.assertEqual(call("/createVaccine", {"id_animal": pet["id_animal"], "nome_vacina": "V"}, self.other_token)[0], 403)
        s, vac = call("/createVaccine", {"id_animal": pet["id_animal"], "nome_vacina": "V", "data_aplicacao": "2026-01-01"}, self.token)
        self.assertEqual(s, 200)
        s, upd = call("/updateVaccine", {"id_vacina": vac["id_vacina"], "observacao": "ok"}, self.token)
        self.assertEqual((s, upd["observacao"], upd["nome_vacina"]), (200, "ok", "V"))
        _, data = call("/getAll", {}, self.token)
        self.assertEqual(len(data[1]["animais"][0]["vacinas"]), 1)
        self.assertEqual(call("/deleteVaccine", {"id_vacina": vac["id_vacina"]}, self.other_token)[0], 403)
        self.assertEqual(call("/deleteVaccine", {"id_vacina": vac["id_vacina"]}, self.token)[0], 200)

    def test_events_rules_and_refs(self):
        _, pet = call("/createAnimal", {"nome": "Rex"}, self.token)
        _, other_pet = call("/createAnimal", {"nome": "Spy"}, self.other_token)
        self.assertEqual(call("/createEvent", {"titulo": "x"}, self.token)[0], 400)
        s, b = call("/createEvent", {"tipo_evento": "Alarme", "titulo": "x"}, self.token)
        self.assertEqual((s, b["message"]), (400, "Informe o horário para salvar o alarme."))
        refs = [{"tabela": "animal", "id_animal": pet["id_animal"], "nome": "fake"},
                {"tabela": "animal", "id_animal": other_pet["id_animal"], "nome": "Spy"}]
        s, ev = call("/createEvent", {"tipo_evento": "Alarme", "titulo": "Remédio", "horario": "08:00", "animal": refs}, self.token)
        self.assertEqual(s, 200)
        self.assertTrue(ev["alarme_ligado"])  # default for alarms
        self.assertEqual(ev["animal"], [{"tabela": "animal", "id_animal": pet["id_animal"], "nome": "Rex"}])
        # renaming the animal updates the event reference
        call("/updateAnimal", {"id_animal": pet["id_animal"], "nome": "Rei"}, self.token)
        _, data = call("/getAll", {}, self.token)
        self.assertEqual(data[2]["evento"][0]["animal"][0]["nome"], "Rei")
        s, upd = call("/updateEvent", {"id_evento": ev["id_evento"], "alarme_ligado": False}, self.token)
        self.assertEqual((s, upd["alarme_ligado"], upd["titulo"]), (200, False, "Remédio"))
        self.assertEqual(call("/updateEvent", {"id_evento": ev["id_evento"]}, self.other_token)[0], 403)
        self.assertEqual(call("/deleteEvent", {"id_evento": ev["id_evento"]}, self.token)[0], 200)

    def test_get_all_shape_and_tip(self):
        s, data = call("/getAll", {}, self.token)
        self.assertEqual(s, 200)
        self.assertEqual(data[0]["id_usuario"], self.uid)
        self.assertNotIn("senha_hash", data[0])
        self.assertEqual(list(data[1].keys()), ["animais"])
        self.assertEqual(data[3]["dicas"][0], {"tabela": "dicas", "id_dicas": "dica-01", "especie": "Cachorro", "tag": "x", "titulo": "T"})
        self.assertEqual(len(data[4]["propaganda"]), 1)
        s, tip = call("/getTip", {"id_dicas": "dica-01"}, self.token)
        self.assertEqual((s, tip["artigo"]), (200, "A"))
        self.assertEqual(call("/getTip", {"id_dicas": "nope"}, self.token)[0], 404)

    def test_update_account_and_email_change(self):
        s, u = call("/updateAccount", {"nome": "Ana B", "email": "ana.nova@example.com", "celular": "(11) 98765-4321",
                                       "notificacao_whatsapp": True}, self.token)
        self.assertEqual(s, 200)
        self.assertEqual(u["email"], "ana.nova@example.com")
        self.assertIn(("email#ana.nova@example.com",), h._tables["identities"].items)
        self.assertNotIn(("email#ana.teste@example.com",), h._tables["identities"].items)
        self.assertEqual(call("/login", {"email": "ana.nova@example.com", "senha": "senha1234"})[0], 200)
        # taking another user's e-mail is refused
        self.assertEqual(call("/updateAccount", {"email": "outro.teste@example.com"}, self.token)[0], 409)
        self.assertEqual(call("/updateAccount", {"celular": "123"}, self.token)[0], 400)

    def test_delete_account_cascades_and_revokes(self):
        _, pet = call("/createAnimal", {"nome": "Rex", "foto": JPEG_DATA_URL}, self.token)
        call("/createEvent", {"tipo_evento": "Passeio", "titulo": "x"}, self.token)
        s, _ = call("/deleteAccount", {}, self.token)
        self.assertEqual(s, 200)
        self.assertEqual(call("/getAll", {}, self.token)[0], 401)
        self.assertEqual(h._tables["files"].items, {})
        self.assertFalse(any(i["id_usuario"] == self.uid for t in ("animals", "events") for i in h._tables[t].items.values()))
        # e-mail can be registered again
        signup()

    def test_dispatch_notifications(self):
        call("/updateAccount", {"celular": "(11) 98765-4321", "notificacao_whatsapp": True}, self.token)
        _, ev = call("/createEvent", {"tipo_evento": "Consulta", "titulo": "Vet", "data": "2026-12-01", "horario": "10:00",
                                      "notificacao_app": True, "notificacao_whatsapp": False}, self.token)
        s, res = call("/dispatchEventNotifications", {"id_evento": ev["id_evento"], "janela": "1d", "canais": ["app", "whatsapp"],
                                                      "animais_nomes": "Rex"}, self.token)
        self.assertEqual(s, 200)
        self.assertEqual([d["canal"] for d in res["disparos"]], ["app"])
        self.assertEqual(res["disparos"][0]["mensagem"], "[PetMood] Falta 1 dia: Vet (Rex) em 01-12-2026 às 10:00.")


if __name__ == "__main__":
    unittest.main(verbosity=1)
