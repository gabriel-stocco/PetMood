"""Small helpers for deploy.sh (run with `python -I helpers.py <command> ...`).

All JSON written here is ASCII-escaped, because the AWS CLI on Windows reads
file:// JSON as cp1252.
"""

import json
import os
import secrets
import sys
import zipfile


def write_json(path, obj):
    with open(path, "w", encoding="ascii") as fh:
        json.dump(obj, fh, ensure_ascii=True)


def cmd_zip(src_dir, out_zip):
    with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(src_dir):
            dirs[:] = [d for d in dirs if d != "__pycache__"]
            for name in files:
                full = os.path.join(root, name)
                zf.write(full, os.path.relpath(full, src_dir).replace(os.sep, "/"))


def cmd_init_env(path):
    """Create the git-ignored secrets file once; never overwrite existing values."""
    values = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    values[k.strip()] = v.strip().strip('"').strip("'")
    changed = False
    for key in ("API_KEY", "JWT_SECRET"):
        if not values.get(key):
            values[key] = secrets.token_urlsafe(48)
            changed = True
    for key in ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"):
        if key not in values:
            values[key] = ""
            changed = True
    if changed:
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write("# PetMood deploy secrets - DO NOT COMMIT\n")
            for k, v in values.items():
                fh.write(f"{k}={v}\n")


def cmd_merge_env(current_json_path, out_path, *pairs):
    """Merge KEY=VALUE pairs into the Lambda's current variables (empty values are skipped)."""
    try:
        with open(current_json_path, encoding="utf-8") as fh:
            current = json.load(fh) or {}
    except (OSError, ValueError):
        current = {}
    for pair in pairs:
        k, v = pair.split("=", 1)
        if v:
            current[k] = v
    write_json(out_path, {"Variables": current})


def cmd_policies(out_dir, region, account, app):
    write_json(os.path.join(out_dir, "trust.json"), {
        "Version": "2012-10-17",
        "Statement": [{"Effect": "Allow", "Principal": {"Service": "lambda.amazonaws.com"}, "Action": "sts:AssumeRole"}],
    })
    write_json(os.path.join(out_dir, "access.json"), {
        "Version": "2012-10-17",
        "Statement": [
            {"Effect": "Allow", "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
             "Resource": f"arn:aws:logs:{region}:{account}:log-group:/aws/lambda/{app}-api*"},
            {"Effect": "Allow",
             "Action": ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem",
                        "dynamodb:Scan", "dynamodb:Query"],
             "Resource": f"arn:aws:dynamodb:{region}:{account}:table/{app}-*"},
            {"Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
             "Resource": f"arn:aws:s3:::{app}-files-{account}/*"},
        ],
    })


def cmd_bucket_policy(out_path, bucket):
    write_json(out_path, {
        "Version": "2012-10-17",
        "Statement": [{
            "Sid": "DenyInsecureTransport", "Effect": "Deny", "Principal": "*", "Action": "s3:*",
            "Resource": [f"arn:aws:s3:::{bucket}", f"arn:aws:s3:::{bucket}/*"],
            "Condition": {"Bool": {"aws:SecureTransport": "false"}},
        }],
    })


def _ddb_value(v):
    if isinstance(v, bool):
        return {"BOOL": v}
    if isinstance(v, (int, float)):
        return {"N": str(v)}
    return {"S": str(v)}


def cmd_seed(seed_path, out_dir, prefix):
    """Write one BatchWriteItem request file per table (tips/ads have well under 25 items)."""
    with open(seed_path, encoding="utf-8") as fh:
        data = json.load(fh)
    for name in ("tips", "ads"):
        items = data[name]
        assert len(items) <= 25, f"{name}: batch-write supports at most 25 items"
        req = {f"{prefix}{name}": [{"PutRequest": {"Item": {k: _ddb_value(v) for k, v in it.items()}}} for it in items]}
        write_json(os.path.join(out_dir, f"seed-{name}.json"), req)


if __name__ == "__main__":
    command, *args = sys.argv[1:]
    {
        "zip": cmd_zip,
        "init-env": cmd_init_env,
        "merge-env": cmd_merge_env,
        "policies": cmd_policies,
        "bucket-policy": cmd_bucket_policy,
        "seed": cmd_seed,
    }[command](*args)
