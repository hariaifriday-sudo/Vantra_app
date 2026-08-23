"""Toad-like database admin console for testing/demo purposes: browse, edit,
and delete rows in any table, plus a raw SQL console where an LLM can turn a
plain-English request into a SQLite statement for the operator to review and
run. Agent-only (Depends(require_agent)) since this bypasses every other
router's business-logic guardrails and can touch any table directly."""
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import Table, func, select, text
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import require_agent
from ..llm import structured_completion

router = APIRouter(prefix="/api/db-admin", tags=["db-admin"])


# ---- schema introspection helpers ----

def _tables() -> dict[str, Table]:
    return models.Base.metadata.tables


def _table_or_404(name: str) -> Table:
    table = _tables().get(name)
    if table is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown table '{name}'")
    return table


def _pk_columns(table: Table) -> list[str]:
    return [c.name for c in table.primary_key.columns]


def _single_pk_column(table: Table) -> str:
    pk_cols = _pk_columns(table)
    if len(pk_cols) != 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This table doesn't have a single-column primary key — not supported here")
    return pk_cols[0]


def _cast_pk(table: Table, pk_col: str, raw: str) -> Any:
    try:
        py_type = table.columns[pk_col].type.python_type
    except NotImplementedError:
        py_type = str
    if py_type is int:
        try:
            return int(raw)
        except ValueError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid id '{raw}'")
    return raw


def _row_to_dict(row: Any) -> dict[str, Any]:
    return dict(row._mapping)


def _schema_context() -> str:
    lines = []
    for name, table in sorted(_tables().items()):
        cols = []
        for c in table.columns:
            fk = next(iter(c.foreign_keys), None)
            piece = f"{c.name} {c.type}"
            if c.primary_key:
                piece += " PK"
            if fk is not None:
                piece += f" FK->{fk.target_fullname}"
            cols.append(piece)
        lines.append(f"{name}({', '.join(cols)})")
    return "\n".join(lines)


# ---- request/response schemas ----

class RowUpdateRequest(BaseModel):
    values: dict[str, Any]


class RowInsertRequest(BaseModel):
    values: dict[str, Any]


class SqlGenerateRequest(BaseModel):
    prompt: str


class SqlExecuteRequest(BaseModel):
    sql: str


# ---- table browsing ----

@router.get("/tables")
def list_tables(_: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    result = []
    for name, table in sorted(_tables().items()):
        count = db.execute(select(func.count()).select_from(table)).scalar_one()
        result.append({"name": name, "row_count": count})
    return result


@router.get("/tables/{name}")
def get_table(
    name: str,
    limit: int = 50,
    offset: int = 0,
    order_by: str | None = None,
    order_dir: str = "asc",
    _: models.User = Depends(require_agent),
    db: Session = Depends(get_db),
):
    table = _table_or_404(name)
    limit = max(1, min(limit, 500))
    offset = max(0, offset)

    query = table.select()
    if order_by and order_by in table.columns:
        col = table.columns[order_by]
        query = query.order_by(col.desc() if order_dir == "desc" else col.asc())
    query = query.limit(limit).offset(offset)

    rows = [_row_to_dict(r) for r in db.execute(query)]
    total = db.execute(select(func.count()).select_from(table)).scalar_one()

    return {
        "columns": [
            {"name": c.name, "type": str(c.type), "primary_key": c.primary_key, "nullable": c.nullable}
            for c in table.columns
        ],
        "pk_columns": _pk_columns(table),
        "rows": rows,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


# ---- row CRUD (structured — parameterized via SQLAlchemy Core, not string SQL) ----

@router.post("/tables/{name}/rows")
def insert_row(name: str, payload: RowInsertRequest, _: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    table = _table_or_404(name)
    unknown = set(payload.values) - {c.name for c in table.columns}
    if unknown:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown column(s): {sorted(unknown)}")
    try:
        result = db.execute(table.insert().values(**payload.values))
        db.commit()
    except Exception as exc:  # noqa: BLE001 - surface the real DB error to the operator
        db.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))

    pk_cols = _pk_columns(table)
    if len(pk_cols) == 1 and result.inserted_primary_key:
        row = db.execute(table.select().where(table.columns[pk_cols[0]] == result.inserted_primary_key[0])).first()
        if row is not None:
            return _row_to_dict(row)
    return {"status": "inserted"}


@router.patch("/tables/{name}/rows/{pk_value}")
def update_row(name: str, pk_value: str, payload: RowUpdateRequest, _: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    table = _table_or_404(name)
    pk_col = _single_pk_column(table)
    pk_val = _cast_pk(table, pk_col, pk_value)
    if not payload.values:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No values to update")
    unknown = set(payload.values) - {c.name for c in table.columns}
    if unknown:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown column(s): {sorted(unknown)}")

    try:
        result = db.execute(table.update().where(table.columns[pk_col] == pk_val).values(**payload.values))
        if result.rowcount == 0:
            db.rollback()
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Row not found")
        db.commit()
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))

    row = db.execute(table.select().where(table.columns[pk_col] == pk_val)).first()
    return _row_to_dict(row)


@router.delete("/tables/{name}/rows/{pk_value}")
def delete_row(name: str, pk_value: str, _: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    table = _table_or_404(name)
    pk_col = _single_pk_column(table)
    pk_val = _cast_pk(table, pk_col, pk_value)
    result = db.execute(table.delete().where(table.columns[pk_col] == pk_val))
    if result.rowcount == 0:
        db.rollback()
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Row not found")
    db.commit()
    return {"status": "deleted"}


# ---- LLM-assisted raw SQL console ----

@router.post("/sql/generate")
async def generate_sql(payload: SqlGenerateRequest, _: models.User = Depends(require_agent)):
    system_prompt = (
        "You are a SQL assistant for a SQLite database backing a demo banking app. Given the "
        "schema below and a request in plain English, write exactly ONE SQLite statement that "
        "fulfills it. Prefer SELECT for read requests. For UPDATE/DELETE, always include a WHERE "
        "clause identifying the specific row(s) unless the request is unambiguously about every "
        "row in the table. Use the exact table and column names given below; never invent one — "
        "if the request names a column or table that doesn't exist but a clearly matching one "
        "exists elsewhere in the schema (e.g. a typo, or the field actually lives on a different "
        "table), use the real one and say what you corrected in \"note\". If nothing in the schema "
        "reasonably matches the request, do NOT invent a WHERE clause engineered to match nothing "
        "(e.g. WHERE 0, WHERE 1=0) just to return valid-looking SQL — instead return an empty "
        '"sql" and explain why in "note". Return ONLY JSON of the shape {"sql": "<statement, no '
        'trailing semicolon, no markdown fences, or empty string if unfulfillable>", "note": '
        '"<one short sentence on what it does, or on why it could not be built>"}.\n\n'
        f"--- SCHEMA ---\n{_schema_context()}\n--- END SCHEMA ---"
    )
    result = await structured_completion(system_prompt, payload.prompt, temperature=0.1)
    sql = str(result.get("sql") or "").strip().rstrip(";").strip()
    note = result.get("note", "")
    if not sql:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, note or "The assistant couldn't build a SQL statement for that — try rephrasing.")
    return {"sql": sql, "note": note}


@router.post("/sql/execute")
def execute_sql(payload: SqlExecuteRequest, _: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    sql = payload.sql.strip()
    if not sql:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No SQL provided")
    # Only one statement per run — a stray ';' followed by more SQL is rejected
    # rather than silently executing a chain the operator never saw in the box.
    body = sql[:-1] if sql.endswith(";") else sql
    if ";" in body:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only a single statement is allowed — remove the extra ';'")

    is_select = bool(re.match(r"^\s*(select|pragma|explain)\b", sql, re.IGNORECASE))
    try:
        result = db.execute(text(sql))
        if is_select:
            columns = list(result.keys())
            rows = [list(r) for r in result.fetchmany(500)]
            db.rollback()  # read-only path — nothing to persist
            return {"is_select": True, "columns": columns, "rows": rows, "row_count": len(rows)}
        rowcount = result.rowcount
        db.commit()
        return {"is_select": False, "columns": [], "rows": [], "row_count": rowcount}
    except Exception as exc:  # noqa: BLE001 - surface the real DB error to the operator
        db.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
