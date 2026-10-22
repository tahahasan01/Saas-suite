"""Table service set-up (wave B, P22/P23, study 11, migration 0089).

Floors with numbered tables, and kitchen stations with the product
categories they prepare. Everything is per branch: a new floor or station
lands in the caller's current branch unless one is named. Retired, never
deleted, because orders will point at them.
"""
from __future__ import annotations

from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from .. import db
from ..deps import AuthContext
from ..rbac import perm

router = APIRouter(prefix="/restaurant", tags=["restaurant"])


class TableOut(BaseModel):
    id: str
    floor_id: str
    label: str
    seats: int
    position: int
    active: bool


class FloorOut(BaseModel):
    id: str
    branch_id: str
    name: str
    position: int
    active: bool
    tables: list[TableOut]


class FloorIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    branch_id: UUID | None = None
    position: int = 0


class FloorUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=40)
    position: int | None = None
    active: bool | None = None


class TablesIn(BaseModel):
    labels: list[str] = Field(min_length=1, max_length=100)
    seats: int = Field(default=4, ge=1, le=50)


class TableUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=12)
    seats: int | None = Field(default=None, ge=1, le=50)
    position: int | None = None
    active: bool | None = None


class StationCategory(BaseModel):
    id: str
    name: str


class StationOut(BaseModel):
    id: str
    branch_id: str
    name: str
    active: bool
    categories: list[StationCategory]


class StationIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    branch_id: UUID | None = None
    category_ids: list[UUID] = Field(default_factory=list, max_length=200)


class StationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=40)
    category_ids: list[UUID] | None = Field(default=None, max_length=200)
    active: bool | None = None


def _table(r: asyncpg.Record) -> TableOut:
    return TableOut(id=str(r["id"]), floor_id=str(r["floor_id"]), label=r["label"], seats=r["seats"],
                    position=r["position"], active=r["active"])


async def _floor(conn: asyncpg.Connection, floor_id) -> FloorOut:
    r = await conn.fetchrow("select * from restaurant_floors where id = $1", floor_id)
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Floor not found")
    tables = await conn.fetch("select * from restaurant_tables where floor_id = $1 order by position, created_at",
                              floor_id)
    return FloorOut(id=str(r["id"]), branch_id=str(r["branch_id"]), name=r["name"], position=r["position"],
                    active=r["active"], tables=[_table(t) for t in tables])


async def _station(conn: asyncpg.Connection, station_id) -> StationOut:
    r = await conn.fetchrow("select * from restaurant_stations where id = $1", station_id)
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Station not found")
    cats = await conn.fetch(
        """select c.id, c.name from restaurant_station_categories sc join pos_categories c on c.id = sc.category_id
            where sc.station_id = $1 order by c.position, c.name""", station_id)
    return StationOut(id=str(r["id"]), branch_id=str(r["branch_id"]), name=r["name"], active=r["active"],
                      categories=[StationCategory(id=str(c["id"]), name=c["name"]) for c in cats])


async def _set_categories(conn: asyncpg.Connection, tenant_id: str, station_id, category_ids: list[UUID]) -> None:
    ids = list(dict.fromkeys(category_ids))
    found = await conn.fetchval("select count(*) from pos_categories where id = any($1::uuid[])", ids)
    if found != len(ids):           # RLS hides another company's categories, so they count as missing
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    await conn.execute("delete from restaurant_station_categories where station_id = $1", station_id)
    await conn.executemany(
        "insert into restaurant_station_categories (tenant_id, station_id, category_id) values ($1, $2, $3)",
        [(tenant_id, station_id, c) for c in ids])


async def _branch(conn: asyncpg.Connection, branch_id: UUID | None) -> UUID | None:
    """None lets the trigger use the caller's current branch; a named one must be visible to them."""
    if branch_id is not None and not await conn.fetchval(
            "select 1 from branches where id = $1 and app_branch_visible(id)", branch_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Branch not found")
    return branch_id


def _sets(fields: dict) -> str:
    return ", ".join(f"{k} = ${i}" for i, k in enumerate(fields, 2))


# ── Floors and tables ───────────────────────────────────────────────────────
@router.get("/floors", response_model=list[FloorOut])
async def list_floors(auth: AuthContext = Depends(perm("restaurant.order.read"))) -> list[FloorOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        ids = await conn.fetch("select id from restaurant_floors order by active desc, position, name")
        return [await _floor(conn, r["id"]) for r in ids]


@router.post("/floors", response_model=FloorOut, status_code=status.HTTP_201_CREATED)
async def create_floor(body: FloorIn, auth: AuthContext = Depends(perm("restaurant.setup.manage"))) -> FloorOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        try:
            fid = await conn.fetchval(
                "insert into restaurant_floors (tenant_id, branch_id, name, position) values ($1, $2, $3, $4) returning id",
                auth.tenant_id, await _branch(conn, body.branch_id), body.name.strip(), body.position)
        except asyncpg.UniqueViolationError:
            raise HTTPException(status.HTTP_409_CONFLICT, f"There's already a floor called {body.name.strip()}")
        return await _floor(conn, fid)


@router.patch("/floors/{floor_id}", response_model=FloorOut)
async def update_floor(floor_id: UUID, body: FloorUpdate,
                       auth: AuthContext = Depends(perm("restaurant.setup.manage"))) -> FloorOut:
    fields = body.model_dump(exclude_unset=True)
    if "name" in fields:
        fields["name"] = fields["name"].strip()
    async with db.tenant_conn(auth.tenant_id) as conn:
        await _floor(conn, floor_id)
        if fields:
            try:
                await conn.execute(f"update restaurant_floors set {_sets(fields)} where id = $1",
                                   floor_id, *fields.values())
            except asyncpg.UniqueViolationError:
                raise HTTPException(status.HTTP_409_CONFLICT, f"There's already a floor called {fields['name']}")
        return await _floor(conn, floor_id)


@router.post("/floors/{floor_id}/tables", response_model=list[TableOut], status_code=status.HTTP_201_CREATED)
async def add_tables(floor_id: UUID, body: TablesIn,
                     auth: AuthContext = Depends(perm("restaurant.setup.manage"))) -> list[TableOut]:
    labels = [x.strip() for x in body.labels]
    if any(not x or len(x) > 12 for x in labels):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A table number is 1 to 12 characters")
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        floor = await conn.fetchrow("select branch_id from restaurant_floors where id = $1", floor_id)
        if floor is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Floor not found")
        taken = {r["k"] for r in await conn.fetch(
            "select lower(btrim(label)) as k from restaurant_tables where floor_id = $1", floor_id)}
        for label in labels:
            if label.lower() in taken:
                raise HTTPException(status.HTTP_409_CONFLICT, f"Table {label} is already on this floor")
            taken.add(label.lower())
        start = await conn.fetchval(
            "select coalesce(max(position), -1) + 1 from restaurant_tables where floor_id = $1", floor_id)
        rows = [await conn.fetchrow(
            """insert into restaurant_tables (tenant_id, floor_id, branch_id, label, seats, position)
               values ($1, $2, $3, $4, $5, $6) returning *""",
            auth.tenant_id, floor_id, floor["branch_id"], label, body.seats, start + i)
            for i, label in enumerate(labels)]
    return [_table(r) for r in rows]


@router.patch("/tables/{table_id}", response_model=TableOut)
async def update_table(table_id: UUID, body: TableUpdate,
                       auth: AuthContext = Depends(perm("restaurant.setup.manage"))) -> TableOut:
    fields = body.model_dump(exclude_unset=True)
    if "label" in fields:
        fields["label"] = fields["label"].strip()
    async with db.tenant_conn(auth.tenant_id) as conn:
        if await conn.fetchval("select 1 from restaurant_tables where id = $1", table_id) is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Table not found")
        if fields:
            try:
                await conn.execute(f"update restaurant_tables set {_sets(fields)} where id = $1",
                                   table_id, *fields.values())
            except asyncpg.UniqueViolationError:
                raise HTTPException(status.HTTP_409_CONFLICT, f"Table {fields['label']} is already on this floor")
        return _table(await conn.fetchrow("select * from restaurant_tables where id = $1", table_id))


# ── Stations ────────────────────────────────────────────────────────────────
@router.get("/stations", response_model=list[StationOut])
async def list_stations(auth: AuthContext = Depends(perm("restaurant.order.read"))) -> list[StationOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        ids = await conn.fetch("select id from restaurant_stations order by active desc, name")
        return [await _station(conn, r["id"]) for r in ids]


@router.post("/stations", response_model=StationOut, status_code=status.HTTP_201_CREATED)
async def create_station(body: StationIn,
                         auth: AuthContext = Depends(perm("restaurant.setup.manage"))) -> StationOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        try:
            sid = await conn.fetchval(
                "insert into restaurant_stations (tenant_id, branch_id, name) values ($1, $2, $3) returning id",
                auth.tenant_id, await _branch(conn, body.branch_id), body.name.strip())
        except asyncpg.UniqueViolationError:
            raise HTTPException(status.HTTP_409_CONFLICT, f"There's already a station called {body.name.strip()}")
        await _set_categories(conn, auth.tenant_id, sid, body.category_ids)
        return await _station(conn, sid)


@router.patch("/stations/{station_id}", response_model=StationOut)
async def update_station(station_id: UUID, body: StationUpdate,
                         auth: AuthContext = Depends(perm("restaurant.setup.manage"))) -> StationOut:
    fields = body.model_dump(exclude_unset=True)
    category_ids = fields.pop("category_ids", None)
    if "name" in fields:
        fields["name"] = fields["name"].strip()
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        await _station(conn, station_id)
        if fields:
            try:
                await conn.execute(f"update restaurant_stations set {_sets(fields)} where id = $1",
                                   station_id, *fields.values())
            except asyncpg.UniqueViolationError:
                raise HTTPException(status.HTTP_409_CONFLICT, f"There's already a station called {fields['name']}")
        if category_ids is not None:
            await _set_categories(conn, auth.tenant_id, station_id, category_ids)
        return await _station(conn, station_id)
