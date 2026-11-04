"""POST /v1/documents/from-url. No real network: fake resolver + httpx.MockTransport."""

from __future__ import annotations

import asyncio
import socket
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass, field

import httpx
import pytest

from app.services.container import Services
from app.services.urlfetch import html_to_text, is_public_ip
from app.vector.store import DOC_CHUNKS
from tests.conftest import auth
from tests.pdfutil import make_pdf

PUBLIC = "93.184.216.34"
HTML = (
    "<html><head><title>Cell Biology 101</title><style>.x{color:red}</style></head>"
    "<body><script>alert('xss')</script><h1>Mitochondria</h1>"
    "<p>Mitochondria produce ATP energy for the cell.</p><noscript>enable js</noscript></body></html>"
)


@dataclass
class Net:
    """Programmable fake internet."""

    dns: dict[str, list[str]] = field(default_factory=dict)
    handler: Callable[[httpx.Request], httpx.Response] = lambda r: httpx.Response(404)
    requests: list[httpx.Request] = field(default_factory=list)

    async def resolve(self, host: str, port: int) -> list[str]:
        if host not in self.dns:
            raise socket.gaierror("NXDOMAIN")
        return self.dns[host]

    def transport(self) -> httpx.AsyncBaseTransport:
        def handle(request: httpx.Request) -> httpx.Response:
            self.requests.append(request)
            return self.handler(request)

        return httpx.MockTransport(handle)


@pytest.fixture
def net(svc: Services) -> Net:
    n = Net(dns={"example.com": [PUBLIC], "docs.example.com": ["93.184.216.35"]})
    svc.url_resolver = n.resolve
    svc.url_transport_factory = n.transport
    return n


def ok(body: bytes | str, ctype: str) -> httpx.Response:
    return httpx.Response(200, content=body, headers={"content-type": ctype})


async def post_url(client: httpx.AsyncClient, url: str, user: str = "alice") -> httpx.Response:
    return await client.post("/v1/documents/from-url", json={"url": url}, headers=auth(user))


async def status_of(client: httpx.AsyncClient, doc_id: str, user: str = "alice") -> str:
    r = await client.get(f"/v1/documents/{doc_id}", headers=auth(user))
    return str(r.json()["status"])


# --- happy paths --------------------------------------------------------------------------------
async def test_html_page_is_fetched_extracted_and_ingested(
    client: httpx.AsyncClient, net: Net, svc: Services
) -> None:
    net.handler = lambda r: ok(HTML, "text/html; charset=utf-8")
    r = await post_url(client, "http://example.com/notes/cells.html?x=1")
    assert r.status_code == 202
    body = r.json()
    assert set(body) == {"id", "name", "status"}
    assert body["name"] == "Cell Biology 101" and body["status"] == "processing"
    assert await status_of(client, body["id"]) == "ready"

    me = (await client.get("/v1/me", headers=auth())).json()
    assert await svc.vectors.count_user(DOC_CHUNKS, me["id"]) >= 1

    # the request was pinned to the validated IP, keeping the Host header; nothing sensitive sent
    (req,) = net.requests
    assert req.url.host == PUBLIC and req.headers["host"] == "example.com"
    assert req.url.path == "/notes/cells.html" and req.url.query == b"x=1"
    assert req.headers["user-agent"].startswith("VidyaAI-DocumentFetcher/")
    for h in ("cookie", "authorization", "x-forwarded-for", "origin", "referer"):
        assert h not in req.headers


async def test_html_script_and_style_text_is_not_ingested(
    client: httpx.AsyncClient, net: Net, fakes: object
) -> None:
    net.handler = lambda r: ok(HTML, "text/html")
    text, title = html_to_text(HTML, 10_000)
    assert title == "Cell Biology 101"
    assert "alert" not in text and "color:red" not in text and "enable js" not in text
    assert "Mitochondria produce ATP energy for the cell." in text
    assert (await post_url(client, "http://example.com/")).status_code == 202


async def test_pdf_is_fetched_and_ingested(client: httpx.AsyncClient, net: Net) -> None:
    pdf = make_pdf("Photosynthesis converts light into chemical energy. " * 30)
    net.handler = lambda r: ok(pdf, "application/pdf")
    r = await post_url(client, "https://docs.example.com/files/Photo%20Notes.pdf")
    assert r.status_code == 202 and r.json()["name"] == "Photo Notes.pdf"
    assert await status_of(client, r.json()["id"]) == "ready"
    (req,) = net.requests
    assert req.url.scheme == "https" and req.url.host == "93.184.216.35"
    assert req.extensions["sni_hostname"] == "docs.example.com"  # TLS verified against the name


async def test_plain_text_is_fetched(client: httpx.AsyncClient, net: Net) -> None:
    net.handler = lambda r: ok("Newton's second law: F = m a. " * 20, "text/plain; charset=utf-8")
    r = await post_url(client, "http://example.com/law.txt")
    assert r.status_code == 202 and r.json()["name"] == "law.txt"
    assert await status_of(client, r.json()["id"]) == "ready"


async def test_page_without_text_ends_up_failed(client: httpx.AsyncClient, net: Net) -> None:
    net.handler = lambda r: ok("<html><body><script>1</script></body></html>", "text/html")
    r = await post_url(client, "http://example.com/empty")
    assert r.status_code == 202
    assert await status_of(client, r.json()["id"]) == "failed"


async def test_ipv6_target_is_pinned_with_brackets(client: httpx.AsyncClient, net: Net) -> None:
    net.dns["v6.example.com"] = ["2606:2800:220:1:248:1893:25c8:1946"]
    net.handler = lambda r: ok("hello world study notes", "text/plain")
    assert (await post_url(client, "http://v6.example.com/a.txt")).status_code == 202
    (req,) = net.requests
    assert req.url.host == "2606:2800:220:1:248:1893:25c8:1946"
    assert req.headers["host"] == "v6.example.com"


# --- SSRF: addresses ---------------------------------------------------------------------------
BLOCKED_ADDRS = [
    "127.0.0.1",
    "10.0.0.5",
    "172.16.9.9",
    "192.168.1.10",
    "169.254.169.254",  # cloud metadata
    "100.64.0.1",  # CGNAT
    "0.0.0.0",  # noqa: S104
    "224.0.0.1",
    "240.0.0.1",
    "198.18.0.1",
    "::1",
    "::",
    "fe80::1",
    "fd00:ec2::254",  # AWS IPv6 metadata
    "fc00::1",
    "::ffff:127.0.0.1",  # IPv4-mapped loopback
    "::ffff:10.0.0.1",
    "64:ff9b::7f00:1",  # NAT64 embedding 127.0.0.1
    "2002:7f00:1::1",  # 6to4 embedding 127.0.0.1
    "ff02::1",
]


@pytest.mark.parametrize("addr", BLOCKED_ADDRS)
async def test_hostname_resolving_to_internal_address_is_blocked(
    client: httpx.AsyncClient, net: Net, addr: str
) -> None:
    net.dns["evil.example.com"] = [addr]
    net.handler = lambda r: ok("secret", "text/plain")
    r = await post_url(client, "http://evil.example.com/")
    assert r.status_code == 422 and r.json()["error"]["code"] == "url_blocked"
    assert net.requests == []  # never connected


async def test_mixed_dns_answer_is_blocked(client: httpx.AsyncClient, net: Net) -> None:
    net.dns["rebind.example.com"] = [PUBLIC, "127.0.0.1"]
    r = await post_url(client, "http://rebind.example.com/")
    assert r.status_code == 422 and r.json()["error"]["code"] == "url_blocked"
    assert net.requests == []


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/",
        "http://127.0.0.1:80/admin",
        "http://[::1]/",
        "http://169.254.169.254/latest/meta-data/",
        "http://10.1.2.3/",
        "http://[::ffff:7f00:1]/",
        "http://[fd00:ec2::254]/",
        "http://0.0.0.0/",
    ],
)
async def test_literal_internal_ips_are_blocked(
    client: httpx.AsyncClient, net: Net, url: str
) -> None:
    r = await post_url(client, url)
    assert r.status_code == 422 and r.json()["error"]["code"] == "url_blocked", r.text
    assert net.requests == []


async def test_alternative_ip_notations_are_checked_after_resolution(
    client: httpx.AsyncClient, net: Net
) -> None:
    # getaddrinfo expands decimal/octal/hex IPv4 forms; whatever it returns is validated
    for host in ("2130706433", "0x7f.1", "0177.0.0.1"):
        net.dns[host] = ["127.0.0.1"]
        r = await post_url(client, f"http://{host}/")
        assert r.status_code == 422, host
        assert r.json()["error"]["code"] in ("url_blocked", "invalid_url"), host
    assert net.requests == []


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost/",
        "http://LOCALHOST./",
        "http://metadata.google.internal/computeMetadata/v1/",
        "http://printer.local/",
        "http://db.internal/",
        "http://foo.localhost/",
    ],
)
async def test_internal_hostnames_are_blocked_without_dns(
    client: httpx.AsyncClient, net: Net, url: str
) -> None:
    r = await post_url(client, url)
    assert r.status_code == 422 and r.json()["error"]["code"] == "url_blocked"
    assert net.requests == []


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "ftp://example.com/a.pdf",
        "gopher://example.com/",
        "javascript:alert(1)",
        "data:text/plain,hi",
        "//example.com/a.pdf",
        "example.com/a.pdf",
        "http://",
        "http://user:pw@example.com/",
        "http://example.com@evil.example.com/",
        "http://example.com:99999999/",
    ],
)
async def test_bad_schemes_and_shapes_are_rejected(
    client: httpx.AsyncClient, net: Net, url: str
) -> None:
    r = await post_url(client, url)
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_url", (url, r.text)
    assert net.requests == []


@pytest.mark.parametrize(
    "url", ["http://example.com:22/", "http://example.com:8080/", "https://example.com:6379/"]
)
async def test_non_web_ports_are_blocked(client: httpx.AsyncClient, net: Net, url: str) -> None:
    r = await post_url(client, url)
    assert r.status_code == 422 and r.json()["error"]["code"] == "url_blocked"
    assert net.requests == []


async def test_dns_failure_is_a_clean_502(client: httpx.AsyncClient, net: Net) -> None:
    r = await post_url(client, "http://nonexistent.example.com/")
    assert r.status_code == 502 and r.json()["error"]["code"] == "fetch_failed"


def test_is_public_ip_unit() -> None:
    assert is_public_ip("93.184.216.34") and is_public_ip("2606:2800:220:1:248:1893:25c8:1946")
    assert is_public_ip("8.8.8.8") and is_public_ip("1.1.1.1")
    assert not any(is_public_ip(a) for a in BLOCKED_ADDRS)
    assert not is_public_ip("not-an-ip")


# --- SSRF: redirects ----------------------------------------------------------------------------
def redirect(location: str, code: int = 302) -> httpx.Response:
    return httpx.Response(code, headers={"location": location})


async def test_redirect_to_private_ip_is_blocked(client: httpx.AsyncClient, net: Net) -> None:
    net.dns["internal.example.com"] = ["10.0.0.7"]

    def handler(r: httpx.Request) -> httpx.Response:
        return redirect("http://internal.example.com/secret")

    net.handler = handler
    r = await post_url(client, "http://example.com/start")
    assert r.status_code == 422 and r.json()["error"]["code"] == "url_blocked"
    assert len(net.requests) == 1  # first hop only; the private hop was never contacted


@pytest.mark.parametrize(
    "location",
    [
        "http://169.254.169.254/latest/meta-data/",
        "http://127.0.0.1:80/",
        "http://[::1]/",
        "http://localhost/",
    ],
)
async def test_redirect_to_literal_internal_target_is_blocked(
    client: httpx.AsyncClient, net: Net, location: str
) -> None:
    net.handler = lambda r: redirect(location, 301)
    r = await post_url(client, "http://example.com/start")
    assert r.status_code == 422 and r.json()["error"]["code"] == "url_blocked"
    assert len(net.requests) == 1


async def test_redirect_to_non_http_scheme_is_rejected(client: httpx.AsyncClient, net: Net) -> None:
    net.handler = lambda r: redirect("file:///etc/passwd")
    r = await post_url(client, "http://example.com/start")
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_url"
    assert len(net.requests) == 1


async def test_redirect_chain_is_followed_and_each_hop_revalidated(
    client: httpx.AsyncClient, net: Net
) -> None:
    def handler(r: httpx.Request) -> httpx.Response:
        if r.url.path == "/a":
            return redirect("/b", 301)  # relative
        if r.url.path == "/b":
            return redirect("http://docs.example.com/c", 307)  # different host
        return ok("study notes about cells and energy", "text/plain")

    net.handler = handler
    r = await post_url(client, "http://example.com/a")
    assert r.status_code == 202
    assert [(q.url.host, q.url.path) for q in net.requests] == [
        (PUBLIC, "/a"),
        (PUBLIC, "/b"),
        ("93.184.216.35", "/c"),
    ]
    assert [q.headers["host"] for q in net.requests] == [
        "example.com",
        "example.com",
        "docs.example.com",
    ]


async def test_three_redirects_allowed_four_rejected(client: httpx.AsyncClient, net: Net) -> None:
    def chain(n: int) -> Callable[[httpx.Request], httpx.Response]:
        def handler(r: httpx.Request) -> httpx.Response:
            hop = int(r.url.path.strip("/") or 0)
            if hop < n:
                return redirect(f"/{hop + 1}")
            return ok("final study notes text", "text/plain")

        return handler

    net.handler = chain(3)
    assert (await post_url(client, "http://example.com/0")).status_code == 202
    net.requests.clear()
    net.handler = chain(4)
    r = await post_url(client, "http://example.com/0")
    assert r.status_code == 502 and "redirect" in r.json()["error"]["message"].lower()
    assert len(net.requests) == 4


async def test_redirect_loop_terminates(client: httpx.AsyncClient, net: Net) -> None:
    net.handler = lambda r: redirect("/loop")
    r = await post_url(client, "http://example.com/loop")
    assert r.status_code == 502 and len(net.requests) == 4


async def test_redirect_without_location_fails(client: httpx.AsyncClient, net: Net) -> None:
    net.handler = lambda r: httpx.Response(302)
    assert (await post_url(client, "http://example.com/")).status_code == 502


async def test_cookies_are_never_forwarded_between_hops(
    client: httpx.AsyncClient, net: Net
) -> None:
    def handler(r: httpx.Request) -> httpx.Response:
        if r.url.path == "/login":
            return httpx.Response(
                302, headers={"location": "/doc", "set-cookie": "session=abc; Path=/"}
            )
        return ok("notes with enough words to be ingested", "text/plain")

    net.handler = handler
    assert (await post_url(client, "http://example.com/login")).status_code == 202
    assert all("cookie" not in q.headers for q in net.requests)


# --- size / type / errors -----------------------------------------------------------------------
async def test_declared_oversize_is_rejected_without_reading(
    client: httpx.AsyncClient, net: Net
) -> None:
    net.handler = lambda r: httpx.Response(
        200, headers={"content-type": "application/pdf", "content-length": str(50 * 1024 * 1024)}
    )
    r = await post_url(client, "http://example.com/huge.pdf")
    assert r.status_code == 413 and r.json()["error"]["code"] == "payload_too_large"


async def test_streamed_oversize_aborts_early(
    client: httpx.AsyncClient, net: Net, svc: Services
) -> None:
    svc.settings.url_fetch_max_bytes = 1000
    sent = 0

    async def body() -> AsyncIterator[bytes]:
        nonlocal sent
        for _ in range(1000):
            sent += 1
            yield b"x" * 100

    net.handler = lambda r: httpx.Response(
        200, headers={"content-type": "text/plain"}, content=body()
    )
    r = await post_url(client, "http://example.com/endless.txt")
    assert r.status_code == 413
    assert sent < 20  # stopped as soon as the cap was crossed


async def test_exactly_at_the_limit_is_accepted(
    client: httpx.AsyncClient, net: Net, svc: Services
) -> None:
    svc.settings.url_fetch_max_bytes = 1000
    net.handler = lambda r: ok("a" * 1000, "text/plain")
    assert (await post_url(client, "http://example.com/ok.txt")).status_code == 202


@pytest.mark.parametrize(
    "ctype", ["image/png", "application/json", "application/zip", "video/mp4", "", "text/css"]
)
async def test_wrong_content_type_is_rejected(
    client: httpx.AsyncClient, net: Net, ctype: str
) -> None:
    net.handler = lambda r: ok(b"\x89PNG....", ctype)
    r = await post_url(client, "http://example.com/x")
    assert r.status_code == 422 and r.json()["error"]["code"] == "unsupported_type"


async def test_pdf_type_must_really_be_a_pdf(client: httpx.AsyncClient, net: Net) -> None:
    net.handler = lambda r: ok("<html>nope</html>", "application/pdf")
    r = await post_url(client, "http://example.com/fake.pdf")
    assert r.status_code == 422 and r.json()["error"]["code"] == "content_mismatch"


async def test_octet_stream_is_accepted_only_if_it_is_a_pdf(
    client: httpx.AsyncClient, net: Net
) -> None:
    net.handler = lambda r: ok(
        make_pdf("Cells divide by mitosis and meiosis. " * 20), "application/octet-stream"
    )
    assert (await post_url(client, "http://example.com/dl")).status_code == 202
    net.handler = lambda r: ok(b"MZ\x90\x00 binary", "application/octet-stream")
    assert (await post_url(client, "http://example.com/dl")).status_code == 422


async def test_empty_body_and_http_errors(client: httpx.AsyncClient, net: Net) -> None:
    net.handler = lambda r: ok(b"", "text/plain")
    assert (await post_url(client, "http://example.com/e")).status_code == 422
    for code in (403, 404, 500):
        net.handler = lambda r, c=code: httpx.Response(c)  # type: ignore[misc]
        r = await post_url(client, "http://example.com/e")
        assert r.status_code == 502 and r.json()["error"]["code"] == "fetch_failed"
        assert str(code) in r.json()["error"]["message"]


async def test_connection_errors_and_timeouts(client: httpx.AsyncClient, net: Net) -> None:
    def refuse(r: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    def slow(r: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow")

    net.handler = refuse
    r = await post_url(client, "http://example.com/")
    assert r.status_code == 502 and r.json()["error"]["code"] == "fetch_failed"
    net.handler = slow
    r = await post_url(client, "http://example.com/")
    assert r.status_code == 504 and r.json()["error"]["code"] == "fetch_timeout"


async def test_overall_deadline_bounds_the_whole_fetch(
    client: httpx.AsyncClient, net: Net, svc: Services
) -> None:
    svc.settings.url_fetch_timeout_seconds = 0.2

    async def handler(request: httpx.Request) -> httpx.Response:
        await asyncio.sleep(5)
        return ok("late", "text/plain")

    svc.url_transport_factory = lambda: httpx.MockTransport(handler)
    r = await post_url(client, "http://example.com/")
    assert r.status_code == 504


# --- API behaviour ------------------------------------------------------------------------------
async def test_validation_and_auth(client: httpx.AsyncClient, net: Net) -> None:
    assert (
        await client.post("/v1/documents/from-url", json={"url": "http://example.com/"})
    ).status_code == 401
    h = auth()
    assert (await client.post("/v1/documents/from-url", json={}, headers=h)).status_code == 422
    assert (
        await client.post("/v1/documents/from-url", json={"url": ""}, headers=h)
    ).status_code == 422
    r = await client.post(
        "/v1/documents/from-url", json={"url": "http://example.com/", "x": 1}, headers=h
    )
    assert r.status_code == 422
    long = "http://example.com/" + "a" * 3000
    assert (
        await client.post("/v1/documents/from-url", json={"url": long}, headers=h)
    ).status_code == 422


async def test_shares_the_upload_rate_limit(client: httpx.AsyncClient, net: Net) -> None:
    net.handler = lambda r: ok("some study notes about cells", "text/plain")
    codes = [(await post_url(client, f"http://example.com/{i}.txt")).status_code for i in range(7)]
    assert codes == [202] * 5 + [429] * 2
    # the plain upload endpoint is throttled by the same per-user bucket
    r = await client.post(
        "/v1/documents",
        files={"file": ("a.pdf", make_pdf("x"), "application/pdf")},
        headers=auth(),
    )
    assert r.status_code == 429 and "retry-after" in r.headers
    # another user is unaffected
    assert (await post_url(client, "http://example.com/z.txt", user="bob")).status_code == 202


async def test_documents_are_private_to_the_owner(client: httpx.AsyncClient, net: Net) -> None:
    net.handler = lambda r: ok("alice private study notes here", "text/plain")
    doc_id = (await post_url(client, "http://example.com/n.txt")).json()["id"]
    assert (await client.get(f"/v1/documents/{doc_id}", headers=auth("bob"))).status_code == 404
    listing = (await client.get("/v1/documents", headers=auth())).json()["items"]
    assert [d["id"] for d in listing] == [doc_id]


async def test_blocked_requests_do_not_create_documents(
    client: httpx.AsyncClient, net: Net
) -> None:
    await post_url(client, "http://127.0.0.1/")
    assert (await client.get("/v1/documents", headers=auth())).json()["items"] == []
