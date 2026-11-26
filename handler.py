"""PetMood API - a single Lambda behind one API Gateway `$default` route.

Every request is routed internally on METHOD + path. Before touching any data the
handler checks the shared API key (constant time). Protected routes also require a
session token issued by this Lambda (HS256, signed with JWT_SECRET).

Environment variables:
  API_KEY               shared secret sent by the Cloud Run proxy in `x-api-key`
  JWT_SECRET            secret used to sign session tokens
  TABLE_PREFIX          e.g. "cc-petmood-"
  FILE_STORE            "dynamodb" (default, <prefix>files table) or "s3"
  BUCKET                S3 bucket for photos (only used when FILE_STORE=s3)
  GOOGLE_CLIENT_ID      OAuth client id (Google sign-in)
  GOOGLE_CLIENT_SECRET  OAuth client secret (Google sign-in)
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Callable

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

API_KEY = os.environ.get("API_KEY", "")
JWT_SECRET = os.environ.get("JWT_SECRET", "")
TABLE_PREFIX = os.environ.get("TABLE_PREFIX", "cc-petmood-")
BUCKET = os.environ.get("BUCKET", "")
FILE_STORE = os.environ.get("FILE_STORE", "dynamodb").lower()
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")

SESSION_TTL_SECONDS = 7 * 24 * 60 * 60
MAX_FOTO_CHARS = 300_000
MAX_TEXT_CHARS = 5_000
MAX_URL_CHARS = 2_048
FILE_URL_PREFIX = "/api/files/"
FILE_KEY_PREFIX = "img/"
BR_TZ = timezone(timedelta(hours=-3))  # Brazil has had no DST since 2019

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
CELLPHONE_RE = re.compile(r"^\([1-9]{2}\)\s(?:9\d{4}|\d{4})-\d{4}$")
ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
FILE_NAME_RE = re.compile(r"^[0-9a-f]{32}\.(jpg|png|webp|gif)$")
DATA_URL_RE = re.compile(r"^data:image/(jpeg|jpg|png|webp|gif);base64,([A-Za-z0-9+/=\s]+)$", re.S)

INVALID_CELLPHONE_MESSAGE = (
    "Informe um número de telefone válido com 8 ou 9 dígitos após o DDD no formato "
    "(DD) XXXX-XXXX ou (DD) 9XXXX-XXXX, com o hífen (-) no meio do número."
)
WHATSAPP_NEEDS_PHONE = "Cadastre um número de celular válido para ativar notificações via WhatsApp."

JANELA_LABELS = {
    "2d": "Faltam 2 dias",
    "1d": "Falta 1 dia",
    "1h": "Falta 1 hora",
    "0m": "Agora (na hora)",
}

CONTENT_TYPES = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp", "gif": "image/gif"}

# ---------------------------------------------------------------------------
# AWS clients (lazy, so unit tests can inject in-memory fakes)
# ---------------------------------------------------------------------------

_tables: dict[str, Any] = {}
_s3: Any = None


def table(name: str):
    if name not in _tables:
        import boto3  # available in the Lambda runtime

        _tables[name] = boto3.resource("dynamodb").Table(f"{TABLE_PREFIX}{name}")
    return _tables[name]


def s3():
    global _s3
    if _s3 is None:
        import boto3

        _s3 = boto3.client("s3")
    return _s3


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def _json_default(value: Any):
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, set):
        return sorted(value)
    raise TypeError(f"Not serializable: {type(value)!r}")


def respond(status: int, body: Any, headers: dict[str, str] | None = None) -> dict:
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json; charset=utf-8", "cache-control": "no-store", **(headers or {})},
        "body": json.dumps(body, default=_json_default, ensure_ascii=False),
    }


def error_response(status: int, message: str) -> dict:
    return respond(status, {"status": status, "id_usuario": "", "message": message})


def get_header(event: dict, name: str) -> str:
    headers = event.get("headers") or {}
    name = name.lower()
    for key, value in headers.items():
        if key.lower() == name:
            return value or ""
    return ""


def parse_body(event: dict) -> dict:
    raw = event.get("body")
    if not raw:
        return {}
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    try:
        body = json.loads(raw)
    except (ValueError, TypeError):
        raise ApiError(400, "JSON inválido")
    if not isinstance(body, dict):
        raise ApiError(400, "JSON inválido")
    return body


# ---------------------------------------------------------------------------
# Validation helpers (ported from the front-end mock)
# ---------------------------------------------------------------------------


def text(value: Any, default: str = "", max_len: int = MAX_TEXT_CHARS) -> str:
    if value is None:
        return default
    result = value if isinstance(value, str) else str(value)
    if len(result) > max_len:
        raise ApiError(400, "Texto muito longo.")
    return result


def pick(params: dict, key: str, current: Any) -> Any:
    """Mirror of JavaScript's `params[key] ?? current`."""
    value = params.get(key)
    return current if value is None else value


def truthy(value: Any) -> bool:
    """Mirror of JavaScript's Boolean(value)."""
    if isinstance(value, str):
        return value != ""
    return bool(value)


def is_valid_cellphone(value: Any) -> bool:
    trimmed = str(value or "").strip()
    if not trimmed:
        return False
    parts = trimmed.split("-")
    if len(parts) != 2:
        return False
    left = re.sub(r"\D", "", parts[0])
    right = re.sub(r"\D", "", parts[1])
    if len(left) not in (6, 7) or len(right) != 4:
        return False
    if not CELLPHONE_RE.match(trimmed):
        return False
    digits = re.sub(r"\D", "", trimmed)
    if re.fullmatch(r"(\d)\1+", digits):
        return False
    return True


def today_iso() -> str:
    return datetime.now(BR_TZ).strftime("%Y-%m-%d")


def is_future_birth_date(iso: str) -> bool:
    trimmed = (iso or "").strip()
    if not trimmed or not ISO_DATE_RE.match(trimmed):
        return False
    return trimmed > today_iso()


def format_date_br(iso: str) -> str:
    if not iso:
        return ""
    parts = iso.split("-")
    if len(parts) != 3:
        return iso
    return f"{parts[2]}-{parts[1]}-{parts[0]}"


def new_id(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(8)}"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---------------------------------------------------------------------------
# Passwords (scrypt, stdlib only)
# ---------------------------------------------------------------------------

_SCRYPT_N, _SCRYPT_R, _SCRYPT_P = 2**14, 8, 1


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64d(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=32)
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${_b64e(salt)}${_b64e(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt, digest = stored.split("$")
        if algo != "scrypt":
            return False
        candidate = hashlib.scrypt(
            password.encode("utf-8"), salt=_b64d(salt), n=int(n), r=int(r), p=int(p), dklen=32
        )
        return hmac.compare_digest(candidate, _b64d(digest))
    except (ValueError, TypeError):
        return False


_DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

# ---------------------------------------------------------------------------
# Session tokens (HS256)
# ---------------------------------------------------------------------------


def sign_session(id_usuario: str) -> str:
    now = int(time.time())
    header = _b64e(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = _b64e(
        json.dumps({"sub": id_usuario, "iat": now, "exp": now + SESSION_TTL_SECONDS, "iss": "petmood"},
                   separators=(",", ":")).encode()
    )
    signing_input = f"{header}.{payload}".encode("ascii")
    signature = _b64e(hmac.new(JWT_SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest())
    return f"{header}.{payload}.{signature}"


def verify_session(auth_header: str) -> str:
    unauthorized = ApiError(401, "Não autorizado")
    if not auth_header.lower().startswith("bearer "):
        raise unauthorized
    token = auth_header[7:].strip()
    parts = token.split(".")
    if len(parts) != 3:
        raise unauthorized
    try:
        header = json.loads(_b64d(parts[0]))
        if header.get("alg") != "HS256":
            raise unauthorized
        expected = hmac.new(JWT_SECRET.encode("utf-8"), f"{parts[0]}.{parts[1]}".encode("ascii"), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _b64d(parts[2])):
            raise unauthorized
        payload = json.loads(_b64d(parts[1]))
    except ApiError:
        raise
    except Exception:
        raise unauthorized
    now = int(time.time())
    sub = payload.get("sub")
    if not isinstance(sub, str) or not sub or payload.get("iss") != "petmood":
        raise unauthorized
    if int(payload.get("exp", 0)) < now or int(payload.get("iat", 0)) > now + 60:
        raise unauthorized
    return sub


def auth_response(id_usuario: str) -> dict:
    return {"status": 200, "id_usuario": id_usuario, "accessToken": sign_session(id_usuario)}


# ---------------------------------------------------------------------------
# DynamoDB helpers
# ---------------------------------------------------------------------------


def query_user_items(table_name: str, id_usuario: str) -> list[dict]:
    from boto3.dynamodb.conditions import Key

    items: list[dict] = []
    kwargs: dict[str, Any] = {"KeyConditionExpression": Key("id_usuario").eq(id_usuario)}
    while True:
        result = table(table_name).query(**kwargs)
        items.extend(result.get("Items", []))
        last = result.get("LastEvaluatedKey")
        if not last:
            return items
        kwargs["ExclusiveStartKey"] = last


def scan_all(table_name: str) -> list[dict]:
    items: list[dict] = []
    kwargs: dict[str, Any] = {}
    while True:
        result = table(table_name).scan(**kwargs)
        items.extend(result.get("Items", []))
        last = result.get("LastEvaluatedKey")
        if not last:
            return items
        kwargs["ExclusiveStartKey"] = last


def get_item(table_name: str, key: dict) -> dict | None:
    return table(table_name).get_item(Key=key).get("Item")


def claim_identity(ident: str, id_usuario: str) -> bool:
    """Atomically reserve an e-mail or Google identity. False if already taken."""
    from botocore.exceptions import ClientError

    try:
        table("identities").put_item(
            Item={"ident": ident, "id_usuario": id_usuario, "criado_em": now_iso()},
            ConditionExpression="attribute_not_exists(ident)",
        )
        return True
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return False
        raise


def release_identity(ident: str) -> None:
    table("identities").delete_item(Key={"ident": ident})


def email_ident(email: str) -> str:
    return f"email#{email}"


def google_ident(sub: str) -> str:
    return f"google#{sub}"


def lookup_user_by_identity(ident: str) -> dict | None:
    claim = get_item("identities", {"ident": ident})
    if not claim:
        return None
    return get_item("users", {"id_usuario": claim["id_usuario"]})


# ---------------------------------------------------------------------------
# Photos (S3). Items store "/api/files/<name>"; external https URLs are kept as-is.
# ---------------------------------------------------------------------------


def _sniff_image(data: bytes) -> str | None:
    if data[:3] == b"\xff\xd8\xff":
        return "jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def is_internal_file(value: str) -> bool:
    return isinstance(value, str) and value.startswith(FILE_URL_PREFIX)


def resolve_photo(new_value: Any, current: str, too_big_message: str = "Imagem muito grande.") -> tuple[str, list[str]]:
    """Return (value_to_store, internal_files_to_delete_after_save)."""
    current = current or ""
    if new_value is None:
        return current, []
    value = new_value if isinstance(new_value, str) else str(new_value)
    if value == current:
        return current, []
    stale = [current] if is_internal_file(current) else []
    if value == "":
        return "", stale
    if value.startswith("data:"):
        if len(value) > MAX_FOTO_CHARS:
            raise ApiError(413, too_big_message)
        match = DATA_URL_RE.match(value)
        if not match:
            raise ApiError(400, "Formato de imagem inválido.")
        try:
            data = base64.b64decode(re.sub(r"\s", "", match.group(2)), validate=True)
        except (ValueError, TypeError):
            raise ApiError(400, "Formato de imagem inválido.")
        ext = _sniff_image(data)
        if not ext:
            raise ApiError(400, "Formato de imagem inválido.")
        name = f"{secrets.token_hex(16)}.{ext}"
        store_file(name, data)
        return f"{FILE_URL_PREFIX}{name}", stale
    if value.startswith("https://") or value.startswith("http://"):
        if len(value) > MAX_URL_CHARS:
            raise ApiError(400, "URL da imagem muito longa.")
        return value, stale
    # Anything else (e.g. another user's /api/files/... path) is refused.
    raise ApiError(400, "Formato de imagem inválido.")


def delete_files(values: list[str]) -> None:
    for value in values:
        if not is_internal_file(value):
            continue
        name = value[len(FILE_URL_PREFIX):]
        if FILE_NAME_RE.match(name):
            try:
                remove_file(name)
            except Exception:  # best effort: an orphan photo is harmless
                pass


# Photo storage backend. "dynamodb" (default) keeps each photo (<= ~225 KB) in the
# <prefix>files table; "s3" uses BUCKET. The S3 option needs the permissions boundary
# to allow s3:PutObject/GetObject/DeleteObject on the bucket.


def store_file(name: str, data: bytes) -> None:
    if FILE_STORE == "s3":
        s3().put_object(Bucket=BUCKET, Key=f"{FILE_KEY_PREFIX}{name}", Body=data, ContentType=CONTENT_TYPES[name.rsplit(".", 1)[1]])
    else:
        table("files").put_item(Item={"name": name, "data": data, "criado_em": now_iso()})


def load_file(name: str) -> bytes | None:
    try:
        if FILE_STORE == "s3":
            return s3().get_object(Bucket=BUCKET, Key=f"{FILE_KEY_PREFIX}{name}")["Body"].read()
        item = get_item("files", {"name": name})
    except Exception:
        return None
    if not item:
        return None
    data = item["data"]
    return bytes(data.value) if hasattr(data, "value") else bytes(data)  # boto3 returns Binary


def remove_file(name: str) -> None:
    if FILE_STORE == "s3":
        s3().delete_object(Bucket=BUCKET, Key=f"{FILE_KEY_PREFIX}{name}")
    else:
        table("files").delete_item(Key={"name": name})


def serve_file(name: str) -> dict:
    if not FILE_NAME_RE.match(name):
        return error_response(404, "Arquivo não encontrado")
    data = load_file(name)
    if data is None:
        return error_response(404, "Arquivo não encontrado")
    return {
        "statusCode": 200,
        "headers": {
            "content-type": CONTENT_TYPES[name.rsplit(".", 1)[1]],
            "cache-control": "private, max-age=31536000, immutable",
            "x-content-type-options": "nosniff",
        },
        "body": base64.b64encode(data).decode("ascii"),
        "isBase64Encoded": True,
    }


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------

USER_PUBLIC_FIELDS = (
    "id_usuario", "nome", "email", "celular", "data_nascimento", "genero",
    "foto", "notificacao_app", "notificacao_whatsapp",
)
ANIMAL_FIELDS = ("id_animal", "id_usuario", "nome", "data_nascimento", "especie", "raca", "genero", "racao", "observacao", "foto")
VACCINE_FIELDS = ("id_vacina", "id_animal", "id_usuario", "nome_vacina", "data_aplicacao", "observacao", "foto_carteira")
EVENT_FIELDS = (
    "id_evento", "tipo_evento", "id_usuario", "animal", "titulo", "data", "horario", "local",
    "anotacao", "veterinario", "alarme_ligado", "frequencia", "notificacao_app", "notificacao_whatsapp",
)


def _project(item: dict, fields: tuple[str, ...], tabela: str | None) -> dict:
    out = {"tabela": tabela} if tabela else {}
    out.update({f: item.get(f, "") for f in fields})
    return out


def public_user(user: dict, with_tabela: bool = True) -> dict:
    out = _project(user, USER_PUBLIC_FIELDS, "usuario" if with_tabela else None)
    out["notificacao_app"] = bool(user.get("notificacao_app", True))
    out["notificacao_whatsapp"] = bool(user.get("notificacao_whatsapp", False))
    out["login_google"] = bool(user.get("google_sub"))
    out["possui_senha"] = bool(user.get("senha_hash"))
    return out


def public_animal(item: dict) -> dict:
    return _project(item, ANIMAL_FIELDS, "animal")


def public_vaccine(item: dict) -> dict:
    return _project(item, VACCINE_FIELDS, "vacina")


def public_event(item: dict) -> dict:
    out = _project(item, EVENT_FIELDS, "evento")
    out["animal"] = list(item.get("animal") or [])
    for key in ("alarme_ligado", "notificacao_app", "notificacao_whatsapp"):
        out[key] = bool(item.get(key, False))
    return out


# ---------------------------------------------------------------------------
# Public routes
# ---------------------------------------------------------------------------


def route_login(params: dict) -> dict:
    email = text(params.get("email"), max_len=320).strip().lower()
    senha = text(params.get("senha"), max_len=1024)
    if not email or not senha:
        raise ApiError(400, "Dados inválidos")
    user = lookup_user_by_identity(email_ident(email))
    if not user:
        verify_password(senha, _DUMMY_HASH)  # keep timing similar for unknown e-mails
        raise ApiError(401, "Credenciais inválidas")
    if not user.get("senha_hash"):
        raise ApiError(401, 'Esta conta foi criada com o Google. Use "Entrar com o Google".')
    if not verify_password(senha, user["senha_hash"]):
        raise ApiError(401, "Credenciais inválidas")
    return auth_response(user["id_usuario"])


def route_create_account(params: dict) -> dict:
    nome = text(params.get("nome"), max_len=200).strip()
    email = text(params.get("email"), max_len=320).strip().lower()
    senha = text(params.get("senha"), max_len=1024)
    data_nascimento = text(params.get("data_nascimento"), max_len=10).strip()
    celular = text(params.get("celular"), max_len=20).strip()
    notif_whats = truthy(params.get("notificacao_whatsapp", False))

    if not nome or not EMAIL_RE.match(email) or len(senha) < 8:
        raise ApiError(400, "Dados inválidos (nome, e-mail válido e senha com 8+ caracteres)")
    if celular and not is_valid_cellphone(celular):
        raise ApiError(400, INVALID_CELLPHONE_MESSAGE)
    if notif_whats and not is_valid_cellphone(celular):
        raise ApiError(400, WHATSAPP_NEEDS_PHONE)
    if is_future_birth_date(data_nascimento):
        raise ApiError(400, "A data de nascimento não pode ser no futuro.")
    if len(str(params.get("foto") or "")) > MAX_FOTO_CHARS:
        raise ApiError(413, "Imagem muito grande. Reduza o tamanho da foto.")

    id_usuario = new_id("usr")
    if not claim_identity(email_ident(email), id_usuario):
        raise ApiError(409, "E-mail já cadastrado")
    try:
        foto, _ = resolve_photo(params.get("foto"), "", "Imagem muito grande. Reduza o tamanho da foto.")
        user = {
            "id_usuario": id_usuario,
            "nome": nome,
            "email": email,
            "senha_hash": hash_password(senha),
            "celular": celular,
            "data_nascimento": data_nascimento,
            "genero": text(params.get("genero"), max_len=50),
            "foto": foto,
            "notificacao_app": truthy(pick(params, "notificacao_app", True)),
            "notificacao_whatsapp": notif_whats,
            "criado_em": now_iso(),
        }
        table("users").put_item(Item=user)
    except Exception:
        release_identity(email_ident(email))
        raise
    return auth_response(id_usuario)


def exchange_google_code(code: str, redirect_uri: str = "postmessage") -> dict:
    """Exchange an authorization code for verified Google claims.

    redirect_uri is "postmessage" for the web GIS popup flow and "" for codes issued to the
    Android app (native account picker, serverAuthCode).

    The ID token comes straight from Google's token endpoint over TLS, so per OIDC Core
    3.1.3.7 the TLS server validation stands in for the signature check. We still verify
    the issuer, audience, expiry and that the e-mail is verified.
    """
    data = urllib.parse.urlencode({
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }).encode("ascii")
    request = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
        method="POST",
    )
    failure = ApiError(401, "Não foi possível validar o login com o Google. Tente novamente.")
    try:
        with urllib.request.urlopen(request, timeout=10) as resp:
            token_response = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, ValueError, TimeoutError):
        raise failure
    id_token = token_response.get("id_token")
    if not isinstance(id_token, str) or id_token.count(".") != 2:
        raise failure
    try:
        claims = json.loads(_b64d(id_token.split(".")[1]))
    except Exception:
        raise failure
    now = int(time.time())
    if claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise failure
    if claims.get("aud") != GOOGLE_CLIENT_ID:
        raise failure
    if int(claims.get("exp", 0)) < now - 60 or int(claims.get("iat", 0)) > now + 60:
        raise failure
    if not claims.get("sub") or not claims.get("email"):
        raise failure
    if claims.get("email_verified") not in (True, "true"):
        raise ApiError(401, "Seu e-mail do Google não está verificado.")
    return claims


def route_google_login(params: dict) -> dict:
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise ApiError(503, "Login com Google não está configurado.")
    code = text(params.get("code"), max_len=2048).strip()
    if not code:
        raise ApiError(400, "Código de autorização do Google obrigatório")
    platform = text(params.get("platform"), max_len=16).strip().lower()
    claims = exchange_google_code(code, "" if platform == "android" else "postmessage")
    sub = str(claims["sub"])
    email = str(claims["email"]).strip().lower()

    # 1. Already linked to this Google account.
    user = lookup_user_by_identity(google_ident(sub))
    if user:
        return auth_response(user["id_usuario"])

    # 2. An account with the same (Google-verified) e-mail exists: link it.
    user = lookup_user_by_identity(email_ident(email))
    if user:
        if user.get("google_sub") and user["google_sub"] != sub:
            raise ApiError(409, "Este e-mail já está vinculado a outra conta Google.")
        if not claim_identity(google_ident(sub), user["id_usuario"]):
            raise ApiError(409, "Esta conta Google já está vinculada a outro usuário.")
        table("users").update_item(
            Key={"id_usuario": user["id_usuario"]},
            UpdateExpression="SET google_sub = :s, atualizado_em = :t",
            ExpressionAttributeValues={":s": sub, ":t": now_iso()},
        )
        return auth_response(user["id_usuario"])

    # 3. New account created from the Google profile (no password).
    id_usuario = new_id("usr")
    if not claim_identity(email_ident(email), id_usuario):
        raise ApiError(409, "E-mail já cadastrado")
    if not claim_identity(google_ident(sub), id_usuario):
        release_identity(email_ident(email))
        raise ApiError(409, "Esta conta Google já está vinculada a outro usuário.")
    picture = str(claims.get("picture") or "")
    try:
        table("users").put_item(Item={
            "id_usuario": id_usuario,
            "nome": text(claims.get("name") or email.split("@")[0], max_len=200).strip(),
            "email": email,
            "google_sub": sub,
            "celular": "",
            "data_nascimento": "",
            "genero": "",
            "foto": picture if picture.startswith("https://") and len(picture) <= MAX_URL_CHARS else "",
            "notificacao_app": True,
            "notificacao_whatsapp": False,
            "criado_em": now_iso(),
        })
    except Exception:
        release_identity(email_ident(email))
        release_identity(google_ident(sub))
        raise
    return auth_response(id_usuario)


# ---------------------------------------------------------------------------
# Protected routes. `user` is the verified, freshly loaded user item.
# The id_usuario sent in request bodies is ignored: identity comes from the token.
# ---------------------------------------------------------------------------


def route_get_all(user: dict, params: dict) -> list:
    uid = user["id_usuario"]
    vaccines = query_user_items("vaccines", uid)
    by_animal: dict[str, list[dict]] = {}
    for vac in vaccines:
        by_animal.setdefault(vac.get("id_animal", ""), []).append(public_vaccine(vac))
    animals = []
    for item in sorted(query_user_items("animals", uid), key=lambda a: a.get("criado_em", "")):
        animal = public_animal(item)
        animal["vacinas"] = sorted(by_animal.get(item["id_animal"], []), key=lambda v: v["id_vacina"])
        animals.append(animal)
    events = [public_event(e) for e in sorted(query_user_items("events", uid), key=lambda e: e.get("criado_em", ""))]
    tips = [
        {"tabela": "dicas", "id_dicas": t["id_dicas"], "especie": t.get("especie", ""), "tag": t.get("tag", ""), "titulo": t.get("titulo", "")}
        for t in sorted(scan_all("tips"), key=lambda t: t.get("ordem", 0))
    ]
    ads = [
        {"tabela": "propaganda", "id_propaganda": a["id_propaganda"], "foto": a.get("foto", ""), "link": a.get("link", ""), "nome": a.get("nome", "")}
        for a in sorted(scan_all("ads"), key=lambda a: a.get("ordem", 0))
    ][:5]
    return [public_user(user), {"animais": animals}, {"evento": events}, {"dicas": tips}, {"propaganda": ads}]


def route_get_tip(user: dict, params: dict) -> dict:
    tip = get_item("tips", {"id_dicas": text(params.get("id_dicas"), max_len=100)})
    if not tip:
        raise ApiError(404, "Dica não encontrada")
    return {k: tip.get(k, "") for k in ("id_dicas", "artigo", "especie", "tag", "titulo")}


def route_get_account(user: dict, params: dict) -> dict:
    return public_user(user, with_tabela=False)


def route_update_account(user: dict, params: dict) -> dict:
    uid = user["id_usuario"]
    next_birth = text(pick(params, "data_nascimento", user.get("data_nascimento", "")), max_len=10).strip()
    next_cel = text(pick(params, "celular", user.get("celular", "")), max_len=20).strip()
    next_whats = truthy(pick(params, "notificacao_whatsapp", user.get("notificacao_whatsapp", False)))
    next_email = text(pick(params, "email", user.get("email", "")), max_len=320).strip().lower()
    next_nome = text(pick(params, "nome", user.get("nome", "")), max_len=200)

    if next_cel and not is_valid_cellphone(next_cel):
        raise ApiError(400, INVALID_CELLPHONE_MESSAGE)
    if next_whats and not is_valid_cellphone(next_cel):
        raise ApiError(400, WHATSAPP_NEEDS_PHONE)
    if is_future_birth_date(next_birth):
        raise ApiError(400, "A data de nascimento não pode ser no futuro.")
    if not next_nome.strip():
        raise ApiError(400, "Informe seu nome completo.")
    if not EMAIL_RE.match(next_email):
        raise ApiError(400, "Informe um endereço de e-mail válido.")

    old_email = user.get("email", "")
    email_changed = next_email != old_email
    if email_changed and not claim_identity(email_ident(next_email), uid):
        raise ApiError(409, "E-mail já cadastrado")
    try:
        foto, stale = resolve_photo(params.get("foto"), user.get("foto", ""))
        updated = {
            **user,
            "nome": next_nome,
            "email": next_email,
            "celular": next_cel,
            "data_nascimento": next_birth,
            "genero": text(pick(params, "genero", user.get("genero", "")), max_len=50),
            "foto": foto,
            "notificacao_app": truthy(pick(params, "notificacao_app", user.get("notificacao_app", True))),
            "notificacao_whatsapp": next_whats,
            "atualizado_em": now_iso(),
        }
        table("users").put_item(Item=updated)
    except Exception:
        if email_changed:
            release_identity(email_ident(next_email))
        raise
    if email_changed and old_email:
        release_identity(email_ident(old_email))
    delete_files(stale)
    return public_user(updated)


def route_delete_account(user: dict, params: dict) -> dict:
    uid = user["id_usuario"]
    files: list[str] = [user.get("foto", "")]
    for name, key, photo_field in (("animals", "id_animal", "foto"), ("vaccines", "id_vacina", "foto_carteira"), ("events", "id_evento", None)):
        for item in query_user_items(name, uid):
            if photo_field:
                files.append(item.get(photo_field, ""))
            table(name).delete_item(Key={"id_usuario": uid, key: item[key]})
    if user.get("email"):
        release_identity(email_ident(user["email"]))
    if user.get("google_sub"):
        release_identity(google_ident(user["google_sub"]))
    table("users").delete_item(Key={"id_usuario": uid})
    delete_files(files)
    return public_user(user)


def route_create_animal(user: dict, params: dict) -> dict:
    data_nascimento = text(params.get("data_nascimento"), max_len=10).strip()
    if len(str(params.get("foto") or "")) > MAX_FOTO_CHARS:
        raise ApiError(413, "Imagem muito grande.")
    if is_future_birth_date(data_nascimento):
        raise ApiError(400, "A data de nascimento do animal não pode ser no futuro.")
    foto, _ = resolve_photo(params.get("foto"), "")
    animal = {
        "id_animal": new_id("pet"),
        "id_usuario": user["id_usuario"],
        "nome": text(params.get("nome"), max_len=200),
        "data_nascimento": data_nascimento,
        "especie": text(params.get("especie"), max_len=100),
        "raca": text(params.get("raca"), max_len=200),
        "genero": text(params.get("genero"), max_len=50),
        "racao": text(params.get("racao"), max_len=300),
        "observacao": text(params.get("observacao")),
        "foto": foto,
        "criado_em": now_iso(),
    }
    table("animals").put_item(Item=animal)
    return {**public_animal(animal), "vacinas": []}


def _own_animal(user: dict, id_animal: Any) -> dict:
    animal = get_item("animals", {"id_usuario": user["id_usuario"], "id_animal": text(id_animal, max_len=100)})
    if not animal:
        raise ApiError(403, "Acesso negado a este animal")
    return animal


def route_update_animal(user: dict, params: dict) -> dict:
    current = _own_animal(user, params.get("id_animal"))
    next_birth = text(pick(params, "data_nascimento", current.get("data_nascimento", "")), max_len=10).strip()
    if is_future_birth_date(next_birth):
        raise ApiError(400, "A data de nascimento do animal não pode ser no futuro.")
    foto, stale = resolve_photo(params.get("foto"), current.get("foto", ""))
    updated = {
        **current,
        "nome": text(pick(params, "nome", current.get("nome", "")), max_len=200),
        "data_nascimento": next_birth,
        "especie": text(pick(params, "especie", current.get("especie", "")), max_len=100),
        "raca": text(pick(params, "raca", current.get("raca", "")), max_len=200),
        "genero": text(pick(params, "genero", current.get("genero", "")), max_len=50),
        "racao": text(pick(params, "racao", current.get("racao", "")), max_len=300),
        "observacao": text(pick(params, "observacao", current.get("observacao", ""))),
        "foto": foto,
        "atualizado_em": now_iso(),
    }
    table("animals").put_item(Item=updated)
    delete_files(stale)
    # Keep the denormalised animal name on events in sync.
    if updated["nome"] != current.get("nome"):
        for ev in query_user_items("events", user["id_usuario"]):
            refs = ev.get("animal") or []
            if any(r.get("id_animal") == updated["id_animal"] for r in refs):
                ev["animal"] = [
                    {**r, "nome": updated["nome"]} if r.get("id_animal") == updated["id_animal"] else r for r in refs
                ]
                table("events").put_item(Item=ev)
    return public_animal(updated)


def route_delete_animal(user: dict, params: dict) -> dict:
    uid = user["id_usuario"]
    animal = _own_animal(user, params.get("id_animal"))
    files = [animal.get("foto", "")]
    for vac in query_user_items("vaccines", uid):
        if vac.get("id_animal") == animal["id_animal"]:
            files.append(vac.get("foto_carteira", ""))
            table("vaccines").delete_item(Key={"id_usuario": uid, "id_vacina": vac["id_vacina"]})
    table("animals").delete_item(Key={"id_usuario": uid, "id_animal": animal["id_animal"]})
    delete_files(files)
    return public_animal(animal)


def _clean_animal_refs(user: dict, refs: Any) -> list[dict]:
    """Keep only references to the user's own animals; names come from the database."""
    if not isinstance(refs, list):
        return []
    owned = {a["id_animal"]: a.get("nome", "") for a in query_user_items("animals", user["id_usuario"])}
    cleaned, seen = [], set()
    for ref in refs:
        if not isinstance(ref, dict):
            continue
        aid = str(ref.get("id_animal") or "")
        if aid in owned and aid not in seen:
            seen.add(aid)
            cleaned.append({"tabela": "animal", "id_animal": aid, "nome": owned[aid]})
    return cleaned


def route_create_event(user: dict, params: dict) -> dict:
    tipo = text(params.get("tipo_evento"), max_len=50).strip()
    horario = text(params.get("horario"), max_len=10).strip()
    if not tipo:
        raise ApiError(400, "Selecione o tipo de evento.")
    if tipo == "Alarme" and not horario:
        raise ApiError(400, "Informe o horário para salvar o alarme.")
    if tipo == "Alarme":
        alarme = truthy(params["alarme_ligado"]) if params.get("alarme_ligado") is not None else True
    else:
        alarme = truthy(params.get("alarme_ligado"))
    event = {
        "id_evento": new_id("ev"),
        "tipo_evento": tipo,
        "id_usuario": user["id_usuario"],
        "animal": _clean_animal_refs(user, params.get("animal")),
        "titulo": text(params.get("titulo"), max_len=300),
        "data": text(params.get("data"), max_len=10),
        "horario": text(params.get("horario"), max_len=10),
        "local": text(params.get("local"), max_len=500),
        "anotacao": text(params.get("anotacao")),
        "veterinario": text(params.get("veterinario"), max_len=200),
        "alarme_ligado": alarme,
        "frequencia": text(params.get("frequencia"), max_len=30),
        "notificacao_app": truthy(params.get("notificacao_app")),
        "notificacao_whatsapp": truthy(params.get("notificacao_whatsapp")),
        "criado_em": now_iso(),
    }
    table("events").put_item(Item=event)
    return public_event(event)


def _own_event(user: dict, id_evento: Any) -> dict:
    event = get_item("events", {"id_usuario": user["id_usuario"], "id_evento": text(id_evento, max_len=100)})
    if not event:
        raise ApiError(403, "Acesso negado a este evento")
    return event


def route_update_event(user: dict, params: dict) -> dict:
    current = _own_event(user, params.get("id_evento"))
    tipo = text(pick(params, "tipo_evento", current.get("tipo_evento", "")), max_len=50).strip()
    horario = text(pick(params, "horario", current.get("horario", "")), max_len=10).strip()
    if not tipo:
        raise ApiError(400, "Selecione o tipo de evento.")
    if tipo == "Alarme" and not horario:
        raise ApiError(400, "Informe o horário para salvar o alarme.")
    refs = _clean_animal_refs(user, params["animal"]) if isinstance(params.get("animal"), list) else current.get("animal", [])
    updated = {
        **current,
        "tipo_evento": tipo,
        "animal": refs,
        "titulo": text(pick(params, "titulo", current.get("titulo", "")), max_len=300),
        "data": text(pick(params, "data", current.get("data", "")), max_len=10),
        "horario": horario,
        "local": text(pick(params, "local", current.get("local", "")), max_len=500),
        "anotacao": text(pick(params, "anotacao", current.get("anotacao", ""))),
        "veterinario": text(pick(params, "veterinario", current.get("veterinario", "")), max_len=200),
        "alarme_ligado": truthy(pick(params, "alarme_ligado", current.get("alarme_ligado", False))),
        "frequencia": text(pick(params, "frequencia", current.get("frequencia", "")), max_len=30),
        "notificacao_app": truthy(pick(params, "notificacao_app", current.get("notificacao_app", False))),
        "notificacao_whatsapp": truthy(pick(params, "notificacao_whatsapp", current.get("notificacao_whatsapp", False))),
        "atualizado_em": now_iso(),
    }
    table("events").put_item(Item=updated)
    return public_event(updated)


def route_delete_event(user: dict, params: dict) -> dict:
    event = _own_event(user, params.get("id_evento"))
    table("events").delete_item(Key={"id_usuario": user["id_usuario"], "id_evento": event["id_evento"]})
    return public_event(event)


def route_create_vaccine(user: dict, params: dict) -> dict:
    if len(str(params.get("foto_carteira") or "")) > MAX_FOTO_CHARS:
        raise ApiError(413, "Imagem muito grande.")
    animal = _own_animal(user, params.get("id_animal"))
    foto, _ = resolve_photo(params.get("foto_carteira"), "")
    vaccine = {
        "id_vacina": new_id("vac"),
        "id_animal": animal["id_animal"],
        "id_usuario": user["id_usuario"],
        "nome_vacina": text(params.get("nome_vacina"), max_len=300),
        "data_aplicacao": text(params.get("data_aplicacao"), max_len=10),
        "observacao": text(params.get("observacao")),
        "foto_carteira": foto,
        "criado_em": now_iso(),
    }
    table("vaccines").put_item(Item=vaccine)
    return public_vaccine(vaccine)


def _own_vaccine(user: dict, id_vacina: Any) -> dict:
    vaccine = get_item("vaccines", {"id_usuario": user["id_usuario"], "id_vacina": text(id_vacina, max_len=100)})
    if not vaccine:
        raise ApiError(403, "Acesso negado a esta vacina")
    return vaccine


def route_update_vaccine(user: dict, params: dict) -> dict:
    current = _own_vaccine(user, params.get("id_vacina"))
    next_animal = text(pick(params, "id_animal", current.get("id_animal", "")), max_len=100)
    if next_animal != current.get("id_animal"):
        _own_animal(user, next_animal)
    foto, stale = resolve_photo(params.get("foto_carteira"), current.get("foto_carteira", ""))
    updated = {
        **current,
        "id_animal": next_animal,
        "nome_vacina": text(pick(params, "nome_vacina", current.get("nome_vacina", "")), max_len=300),
        "data_aplicacao": text(pick(params, "data_aplicacao", current.get("data_aplicacao", "")), max_len=10),
        "observacao": text(pick(params, "observacao", current.get("observacao", ""))),
        "foto_carteira": foto,
        "atualizado_em": now_iso(),
    }
    table("vaccines").put_item(Item=updated)
    delete_files(stale)
    return public_vaccine(updated)


def route_delete_vaccine(user: dict, params: dict) -> dict:
    vaccine = _own_vaccine(user, params.get("id_vacina"))
    table("vaccines").delete_item(Key={"id_usuario": user["id_usuario"], "id_vacina": vaccine["id_vacina"]})
    delete_files([vaccine.get("foto_carteira", "")])
    return public_vaccine(vaccine)


def route_dispatch_notifications(user: dict, params: dict) -> dict:
    uid = user["id_usuario"]
    janela = text(params.get("janela") or "1h", max_len=10)
    janela_label = JANELA_LABELS.get(janela, janela)
    requested = params.get("canais") if isinstance(params.get("canais"), list) else []
    id_evento = text(params.get("id_evento"), max_len=100)
    ev = get_item("events", {"id_usuario": uid, "id_evento": id_evento}) if id_evento else None

    alarm_disabled = bool(ev and ev.get("tipo_evento") == "Alarme" and not ev.get("alarme_ligado"))

    def event_allows(key: str) -> bool:
        return True if not ev else bool(ev.get(key))

    accepted: list[str] = []
    if not alarm_disabled:
        for canal in requested:
            if canal == "app" and user.get("notificacao_app") and event_allows("notificacao_app"):
                accepted.append("app")
            elif (
                canal == "whatsapp"
                and user.get("notificacao_whatsapp")
                and is_valid_cellphone(user.get("celular"))
                and event_allows("notificacao_whatsapp")
            ):
                accepted.append("whatsapp")

    ev = ev or {}
    titulo = text(params.get("titulo") or ev.get("titulo") or "Evento", max_len=300)
    data_br = format_date_br(text(params.get("data") or ev.get("data") or "", max_len=10))
    horario = text(params.get("horario") or ev.get("horario") or "", max_len=10)
    animais = text(params.get("animais_nomes") or params.get("animais") or "seu pet", max_len=1000)
    local = text(params.get("local") or ev.get("local") or "", max_len=500)
    mensagem = (
        f"[PetMood] {janela_label}: {titulo} ({animais}) em {data_br}"
        f"{f' às {horario}' if horario else ''}{f' • {local}' if local else ''}."
    )
    disparado_em = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    disparos = [
        {
            "id_notificacao": new_id("notif"),
            "id_evento": id_evento,
            "id_usuario": uid,
            "titulo_evento": titulo,
            "janela": janela,
            "janela_label": janela_label,
            "canal": canal,
            "destino": "Barra de Notificações" if canal == "app" else str(user.get("celular") or ""),
            "mensagem": mensagem,
            "disparado_em": disparado_em,
            # WhatsApp delivery is not integrated yet (same as the original mock).
            "status": "disparado" if canal == "app" else "disparado_mock",
        }
        for canal in dict.fromkeys(accepted)
    ]
    return {"status": 200, "id_evento": id_evento, "janela": janela, "disparos": disparos}


PUBLIC_ROUTES: dict[str, Callable[[dict], Any]] = {
    "/login": route_login,
    "/createAccount": route_create_account,
    "/googleLogin": route_google_login,
}

PROTECTED_ROUTES: dict[str, Callable[[dict, dict], Any]] = {
    "/getAll": route_get_all,
    "/getTip": route_get_tip,
    "/getAccount": route_get_account,
    "/updateAccount": route_update_account,
    "/deleteAccount": route_delete_account,
    "/createAnimal": route_create_animal,
    "/updateAnimal": route_update_animal,
    "/deleteAnimal": route_delete_animal,
    "/createEvent": route_create_event,
    "/updateEvent": route_update_event,
    "/deleteEvent": route_delete_event,
    "/createVaccine": route_create_vaccine,
    "/updateVaccine": route_update_vaccine,
    "/deleteVaccine": route_delete_vaccine,
    "/dispatchEventNotifications": route_dispatch_notifications,
}

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def handler(event: dict, context: Any = None) -> dict:
    method = (event.get("requestContext", {}).get("http", {}).get("method") or event.get("httpMethod") or "GET").upper()
    path = event.get("rawPath") or event.get("path") or "/"
    path = "/" + path.strip("/")

    if method == "GET" and path == "/health":
        return respond(200, {"status": "ok"})

    # Fail closed when the Lambda is not configured.
    if not API_KEY or not JWT_SECRET or (FILE_STORE == "s3" and not BUCKET):
        return error_response(503, "Serviço não configurado")
    if not hmac.compare_digest(get_header(event, "x-api-key").encode("utf-8"), API_KEY.encode("utf-8")):
        return error_response(401, "Não autorizado")

    try:
        if method == "GET" and path.startswith("/files/"):
            return serve_file(path[len("/files/"):])

        if method != "POST":
            raise ApiError(405, "Método não permitido")

        if path in PUBLIC_ROUTES:
            return respond(200, PUBLIC_ROUTES[path](parse_body(event)))

        if path in PROTECTED_ROUTES:
            id_usuario = verify_session(get_header(event, "authorization"))
            user = get_item("users", {"id_usuario": id_usuario})
            if not user:
                raise ApiError(401, "Usuário não encontrado")
            return respond(200, PROTECTED_ROUTES[path](user, parse_body(event)))

        raise ApiError(404, f"Rota {path} não encontrada")
    except ApiError as exc:
        return error_response(exc.status, exc.message)
    except Exception as exc:  # never leak internals; the log has the stack trace
        print(f"Unhandled error on {method} {path}: {type(exc).__name__}: {exc}")
        return error_response(500, "Erro interno do servidor")
