from __future__ import annotations

import uuid

import httpx

from tests.conftest import auth, chat


async def test_history_flow_save_list_get_favorite_delete(client: httpx.AsyncClient) -> None:
    _, ev1 = await chat(client, "First question about algebra")
    _, ev2 = await chat(client, "Second question about geometry")
    c1, c2 = str(ev1[0][1]["conversation_id"]), str(ev2[0][1]["conversation_id"])

    # list: newest first, contract shape
    page = (await client.get("/v1/conversations", headers=auth())).json()
    assert [i["id"] for i in page["items"]] == [c2, c1]
    assert page["next_cursor"] is None
    item = page["items"][0]
    assert set(item) == {
        "id",
        "title",
        "subject",
        "persona",
        "is_favorite",
        "updated_at",
        "preview",
    }
    assert item["title"] == "Second question about geometry"
    assert item["is_favorite"] is False
    assert item["preview"]  # last message preview

    # get
    detail = (await client.get(f"/v1/conversations/{c1}", headers=auth())).json()
    assert [m["role"] for m in detail["messages"]] == ["user", "assistant"]
    assert set(detail["messages"][0]) == {"id", "role", "content", "created_at"}
    assert detail["messages"][0]["content"] == "First question about algebra"

    # favorite + rename (does not reorder history)
    r = await client.patch(
        f"/v1/conversations/{c1}", json={"is_favorite": True, "title": "Algebra"}, headers=auth()
    )
    assert (
        r.status_code == 200 and r.json()["is_favorite"] is True and r.json()["title"] == "Algebra"
    )
    page = (await client.get("/v1/conversations", headers=auth())).json()
    assert [i["id"] for i in page["items"]] == [c2, c1]
    assert page["items"][1]["is_favorite"] is True

    # new message bumps conversation to the top
    await chat(client, "More algebra", conversation_id=c1)
    page = (await client.get("/v1/conversations", headers=auth())).json()
    assert [i["id"] for i in page["items"]] == [c1, c2]

    # delete
    assert (await client.delete(f"/v1/conversations/{c1}", headers=auth())).status_code == 204
    assert (await client.get(f"/v1/conversations/{c1}", headers=auth())).status_code == 404
    page = (await client.get("/v1/conversations", headers=auth())).json()
    assert [i["id"] for i in page["items"]] == [c2]
    assert (await client.delete(f"/v1/conversations/{c1}", headers=auth())).status_code == 404


async def test_cursor_pagination_newest_first(client: httpx.AsyncClient) -> None:
    ids = []
    for i in range(7):
        _, ev = await chat(client, f"question number {i}")
        ids.append(str(ev[0][1]["conversation_id"]))
    expected = list(reversed(ids))

    seen: list[str] = []
    cursor = None
    pages = 0
    while True:
        params = {"limit": 3, **({"cursor": cursor} if cursor else {})}
        body = (await client.get("/v1/conversations", params=params, headers=auth())).json()
        seen += [i["id"] for i in body["items"]]
        pages += 1
        cursor = body["next_cursor"]
        if cursor is None:
            break
    assert pages == 3 and seen == expected


async def test_pagination_validation(client: httpx.AsyncClient) -> None:
    assert (await client.get("/v1/conversations?limit=0", headers=auth())).status_code == 422
    assert (await client.get("/v1/conversations?limit=500", headers=auth())).status_code == 422
    r = await client.get("/v1/conversations?cursor=%%%not-a-cursor", headers=auth())
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_cursor"


async def test_cross_user_isolation_404_not_403(client: httpx.AsyncClient) -> None:
    _, ev = await chat(client, "alice's private chat", user="alice")
    cid = str(ev[0][1]["conversation_id"])

    assert (await client.get(f"/v1/conversations/{cid}", headers=auth("bob"))).status_code == 404
    r = await client.patch(f"/v1/conversations/{cid}", json={"title": "pwned"}, headers=auth("bob"))
    assert r.status_code == 404
    assert (await client.delete(f"/v1/conversations/{cid}", headers=auth("bob"))).status_code == 404
    assert (await client.get("/v1/conversations", headers=auth("bob"))).json()["items"] == []
    # nonexistent id looks identical to a foreign id
    ghost = await client.get(f"/v1/conversations/{uuid.uuid4()}", headers=auth("bob"))
    foreign = await client.get(f"/v1/conversations/{cid}", headers=auth("bob"))
    assert ghost.status_code == foreign.status_code == 404
    assert ghost.json() == foreign.json()

    # still intact for alice
    detail = (await client.get(f"/v1/conversations/{cid}", headers=auth("alice"))).json()
    assert detail["title"] == "alice's private chat" and len(detail["messages"]) == 2


async def test_invalid_uuid_path_is_422(client: httpx.AsyncClient) -> None:
    assert (await client.get("/v1/conversations/not-a-uuid", headers=auth())).status_code == 422


async def test_patch_validation(client: httpx.AsyncClient) -> None:
    _, ev = await chat(client, "hello there")
    cid = str(ev[0][1]["conversation_id"])
    assert (
        await client.patch(f"/v1/conversations/{cid}", json={"title": ""}, headers=auth())
    ).status_code == 422
    assert (
        await client.patch(f"/v1/conversations/{cid}", json={"is_favorite": "yes!"}, headers=auth())
    ).status_code == 422
    assert (
        await client.patch(f"/v1/conversations/{cid}", json={"user_id": "x"}, headers=auth())
    ).status_code == 422
