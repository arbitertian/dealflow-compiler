#!/usr/bin/env python3
"""Validate a DealSpec JSON document for the DealFlow Compiler MVP."""

from __future__ import annotations

import argparse
import json
import re
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")
ALLOWED_DUE_MODES = {"immediate", "manual_confirmation", "deadline"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate a DealSpec JSON file. Use '-' to read JSON from stdin."
    )
    parser.add_argument("path", help="Path to a DealSpec JSON file, or '-' for stdin")
    return parser.parse_args()


def load_spec(path_arg: str) -> dict:
    if path_arg == "-":
        raw = sys.stdin.read()
    else:
        raw = Path(path_arg).read_text(encoding="utf-8")
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise ValueError("DealSpec must be a JSON object.")
    return payload


def as_decimal(value: object, label: str) -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"{label} must be numeric.") from exc


def require_fields(obj: dict, label: str, fields: list[str], errors: list[str]) -> None:
    for field in fields:
        if field not in obj:
            errors.append(f"{label} is missing required field '{field}'.")


def validate_address(address: object, label: str, errors: list[str]) -> None:
    if not isinstance(address, str) or not ADDRESS_RE.match(address):
        errors.append(f"{label} must be a 42-character EVM address.")


def validate_spec(spec: dict) -> list[str]:
    errors: list[str] = []
    require_fields(
        spec,
        "DealSpec",
        [
            "settlementToken",
            "budget",
            "payer",
            "arbiter",
            "payees",
            "milestones",
            "reserveAmount",
            "latePenaltyBps",
        ],
        errors,
    )
    if errors:
        return errors

    if not isinstance(spec["settlementToken"], str) or not spec["settlementToken"].strip():
        errors.append("settlementToken must be a non-empty string.")

    payer = spec["payer"]
    arbiter = spec["arbiter"]
    if not isinstance(payer, dict):
        errors.append("payer must be an object.")
    else:
        require_fields(payer, "payer", ["address"], errors)
        if "address" in payer:
            validate_address(payer["address"], "payer.address", errors)

    if not isinstance(arbiter, dict):
        errors.append("arbiter must be an object.")
    else:
        require_fields(arbiter, "arbiter", ["address"], errors)
        if "address" in arbiter:
            validate_address(arbiter["address"], "arbiter.address", errors)

    budget = as_decimal(spec["budget"], "budget")
    reserve_amount = as_decimal(spec["reserveAmount"], "reserveAmount")
    if budget <= 0:
        errors.append("budget must be greater than zero.")
    if reserve_amount < 0:
        errors.append("reserveAmount cannot be negative.")

    payees = spec["payees"]
    if not isinstance(payees, list) or not payees:
        errors.append("payees must be a non-empty array.")
    elif len(payees) > 3:
        errors.append("payees cannot contain more than 3 entries in the MVP.")
    else:
        bps_total = 0
        for index, payee in enumerate(payees):
            label = f"payees[{index}]"
            if not isinstance(payee, dict):
                errors.append(f"{label} must be an object.")
                continue
            require_fields(payee, label, ["role", "address", "bps"], errors)
            if "role" in payee and (
                not isinstance(payee["role"], str) or not payee["role"].strip()
            ):
                errors.append(f"{label}.role must be a non-empty string.")
            if "address" in payee:
                validate_address(payee["address"], f"{label}.address", errors)
            if "bps" in payee:
                if not isinstance(payee["bps"], int):
                    errors.append(f"{label}.bps must be an integer.")
                else:
                    bps_total += payee["bps"]
        if bps_total != 10000:
            errors.append("payees bps must sum to 10000.")

    milestones = spec["milestones"]
    milestone_total = Decimal("0")
    if not isinstance(milestones, list) or not milestones:
        errors.append("milestones must be a non-empty array.")
    elif len(milestones) > 3:
        errors.append("milestones cannot contain more than 3 entries in the MVP.")
    else:
        for index, milestone in enumerate(milestones):
            label = f"milestones[{index}]"
            if not isinstance(milestone, dict):
                errors.append(f"{label} must be an object.")
                continue
            require_fields(milestone, label, ["name", "amount", "dueMode"], errors)
            if "name" in milestone and (
                not isinstance(milestone["name"], str) or not milestone["name"].strip()
            ):
                errors.append(f"{label}.name must be a non-empty string.")
            if "amount" in milestone:
                amount = as_decimal(milestone["amount"], f"{label}.amount")
                if amount <= 0:
                    errors.append(f"{label}.amount must be greater than zero.")
                milestone_total += amount
            if "dueMode" in milestone and milestone["dueMode"] not in ALLOWED_DUE_MODES:
                allowed = ", ".join(sorted(ALLOWED_DUE_MODES))
                errors.append(f"{label}.dueMode must be one of: {allowed}.")

    late_penalty_bps = spec["latePenaltyBps"]
    if not isinstance(late_penalty_bps, int):
        errors.append("latePenaltyBps must be an integer.")
    elif late_penalty_bps < 0 or late_penalty_bps > 10000:
        errors.append("latePenaltyBps must be between 0 and 10000.")

    if budget != milestone_total + reserve_amount:
        errors.append("budget must equal total milestone amounts plus reserveAmount.")

    return errors


def render_summary(spec: dict) -> str:
    milestone_amount = sum(Decimal(str(item["amount"])) for item in spec["milestones"])
    payee_roles = ", ".join(f"{item['role']}={item['bps']}" for item in spec["payees"])
    return (
        "DealSpec OK\n"
        f"  token: {spec['settlementToken']}\n"
        f"  budget: {spec['budget']}\n"
        f"  milestones total: {milestone_amount}\n"
        f"  reserve: {spec['reserveAmount']}\n"
        f"  payees: {payee_roles}\n"
        f"  late penalty bps: {spec['latePenaltyBps']}"
    )


def main() -> int:
    args = parse_args()
    try:
        spec = load_spec(args.path)
        errors = validate_spec(spec)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    print(render_summary(spec))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
