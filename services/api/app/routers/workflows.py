"""Workflow automations — tenant-configurable ECA rules. Settings-guarded."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status

from .. import audit, db
from ..deps import AuthContext
from ..models import (
    WORKFLOW_TRIGGERS,
    WorkflowCreate,
    WorkflowOut,
    WorkflowUpdate,
)
from ..rbac import require

router = APIRouter(prefix="/workflows", tags=["workflows"])


def _out(r) -> WorkflowOut:
    return WorkflowOut(id=str(r["id"]), name=r["name"], trigger=r["trigger"],
                       conditions=list(r["conditions"]), actions=list(r["actions"]),
                       enabled=r["enabled"], is_system=r["is_system"])


@router.get("", response_model=list[WorkflowOut])
async def list_workflows(auth: AuthContext = Depends(require("settings", "read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            "select id,name,trigger,conditions,actions,enabled,is_system from workflows order by created_at")
    return [_out(r) for r in rows]


@router.post("", response_model=WorkflowOut, status_code=status.HTTP_201_CREATED)
async def create_workflow(body: WorkflowCreate, auth: AuthContext = Depends(require("settings", "admin"))):
    if body.trigger not in WORKFLOW_TRIGGERS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown trigger: {body.trigger}")
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow(
            """insert into workflows (tenant_id, name, trigger, conditions, actions)
               values ($1,$2,$3,$4,$5)
               returning id,name,trigger,conditions,actions,enabled,is_system""",
            auth.tenant_id, body.name, body.trigger, body.conditions, body.actions)
        await audit.record(conn, actor_id=auth.user_id, action="workflow.create",
                           entity="workflow", entity_id=str(row["id"]), after={"name": body.name})
    return _out(row)


@router.patch("/{workflow_id}", response_model=WorkflowOut)
async def update_workflow(workflow_id: str, body: WorkflowUpdate,
                          auth: AuthContext = Depends(require("settings", "admin"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        cur = await conn.fetchrow("select name, enabled from workflows where id=$1", workflow_id)
        if cur is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
        name = body.name if body.name is not None else cur["name"]
        enabled = body.enabled if body.enabled is not None else cur["enabled"]
        row = await conn.fetchrow(
            """update workflows set name=$1, enabled=$2 where id=$3
               returning id,name,trigger,conditions,actions,enabled,is_system""",
            name, enabled, workflow_id)
    return _out(row)


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workflow(workflow_id: str, response: Response,
                          auth: AuthContext = Depends(require("settings", "admin"))) -> Response:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await conn.execute("delete from workflows where id=$1 and not is_system", workflow_id)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
