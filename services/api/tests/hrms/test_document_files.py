"""Employee documents carry their scan (3F, files): the upload is claimed by
the document, only people with hrms.document.read can open it, and nobody
can attach a file someone else uploaded."""
from __future__ import annotations

from ..core.test_files import PDF
from ..core.test_rbac_v2 import _role, _user_on


async def _upload(c, name="cnic.pdf"):
    r = await c.post("/files", params={"name": name}, content=PDF, headers={"Content-Type": "application/octet-stream"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_a_document_keeps_its_scan_and_only_hr_can_open_it(client, tenant):
    file_id = await _upload(client)
    r = await client.post(f"/hrms/employees/{tenant.employee_id}/documents",
                          json={"kind": "cnic", "title": "CNIC copy", "file_id": file_id})
    assert r.status_code == 201, r.text
    assert r.json()["file_id"] == file_id
    assert (await client.get(f"/files/{file_id}")).status_code == 302

    reader = await _role(client, [{"permission_key": "hrms.document.read", "scope": "all"},
                                  {"permission_key": "hrms.employee.read", "scope": "all"}])
    hr, _, _ = await _user_on(client, [reader])
    staff_role = await _role(client, [{"permission_key": "hrms.employee.read", "scope": "all"}])
    staff, _, _ = await _user_on(client, [staff_role])
    try:
        assert (await hr.get(f"/files/{file_id}")).status_code == 302
        assert (await staff.get(f"/files/{file_id}")).status_code == 404
    finally:
        await hr.aclose()
        await staff.aclose()

    doc = r.json()["id"]
    assert (await client.delete(f"/hrms/documents/{doc}")).status_code == 204
    # Released with the document: no longer anyone's to open.
    hr2, _, _ = await _user_on(client, [reader])
    try:
        assert (await hr2.get(f"/files/{file_id}")).status_code == 404
    finally:
        await hr2.aclose()


async def test_someone_elses_upload_cant_be_attached(client, tenant):
    role = await _role(client, [{"permission_key": "hrms.document.manage", "scope": "all"},
                                {"permission_key": "hrms.employee.read", "scope": "all"}])
    other, _, _ = await _user_on(client, [role])
    try:
        theirs = await _upload(other, "theirs.pdf")
    finally:
        await other.aclose()
    r = await client.post(f"/hrms/employees/{tenant.employee_id}/documents",
                          json={"kind": "other", "title": "Not mine", "file_id": theirs})
    assert r.status_code == 422
    assert (await client.get(f"/hrms/employees/{tenant.employee_id}/documents")).json() == []
