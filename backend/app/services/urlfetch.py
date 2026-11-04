"""SSRF-safe document fetcher for "Add from URL".

Defence in depth:
  * only http/https on ports 80/443, no userinfo, no obviously internal hostnames;
  * the hostname is resolved by US and every returned address must be globally routable (IPv4 and
    IPv6; private, loopback, link-local, metadata, CGNAT, multicast, reserved, NAT64/6to4/Teredo
    and IPv4-mapped forms are all refused);
  * the connection is PINNED to the validated address (Host header + TLS SNI/verification keep the
    original hostname), so DNS rebinding between check and connect is not possible;
  * redirects are never followed by the HTTP client: each hop is re-validated from scratch
    (max `max_redirects`);
  * the body is streamed and aborted past `max_bytes`; an overall deadline bounds the whole fetch;
  * no cookies, no credentials, no proxies from the environment; a fresh client per hop so
    Set-Cookie can never leak to the next hop.
"""

from __future__ import annotations

import asyncio
import ipaddress
import logging
import socket
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Final
from urllib.parse import urljoin, urlsplit

import httpx

from app.errors import AppError

log = logging.getLogger("app.urlfetch")

USER_AGENT: Final = "VidyaAI-DocumentFetcher/1.0 (+study assistant; single-page fetch)"
ALLOWED_PORTS: Final = {80, 443}
BLOCKED_HOST_SUFFIXES: Final = (".localhost", ".local", ".internal", ".localdomain", ".home.arpa")
BLOCKED_HOSTS: Final = {"localhost", "metadata", "metadata.google.internal", "instance-data"}

HTML_TYPES: Final = {"text/html", "application/xhtml+xml"}
TEXT_TYPES: Final = {"text/plain"}
PDF_TYPES: Final = {"application/pdf"}
ALLOWED_TYPES: Final = HTML_TYPES | TEXT_TYPES | PDF_TYPES

_EXTRA_BLOCKED_NETS: Final = tuple(
    ipaddress.ip_network(n)
    for n in (
        "0.0.0.0/8",
        "100.64.0.0/10",  # CGNAT
        "192.0.0.0/24",
        "192.88.99.0/24",
        "198.18.0.0/15",
        "240.0.0.0/4",
        "64:ff9b::/96",  # NAT64 (embeds an IPv4 address)
        "64:ff9b:1::/48",
        "2002::/16",  # 6to4
        "2001::/32",  # Teredo
        "2001:db8::/32",
        "100::/64",
    )
)

Resolver = Callable[[str, int], Awaitable[list[str]]]
TransportFactory = Callable[[], httpx.AsyncBaseTransport]


def _blocked(code: str, message: str = "That address is not allowed") -> AppError:
    return AppError(422, code, message)


def _fetch_failed(message: str = "Could not fetch that URL") -> AppError:
    return AppError(502, "fetch_failed", message)


async def system_resolver(host: str, port: int) -> list[str]:
    loop = asyncio.get_running_loop()
    infos = await loop.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    return list(dict.fromkeys(str(info[4][0]) for info in infos))


def is_public_ip(value: str) -> bool:
    try:
        ip = ipaddress.ip_address(value.split("%", 1)[0])
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    if (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
        or not ip.is_global
    ):
        return False
    return not any(ip in net for net in _EXTRA_BLOCKED_NETS if net.version == ip.version)


@dataclass(frozen=True)
class Target:
    url: httpx.URL  # original URL
    host: str
    port: int
    ip: str


def parse_url(raw: str) -> httpx.URL:
    """Syntactic checks only (scheme, port, userinfo, hostname shape)."""
    raw = raw.strip()
    try:
        parts = urlsplit(raw)
        port = parts.port
    except ValueError:
        raise _blocked("invalid_url", "That does not look like a valid URL") from None
    if parts.scheme.lower() not in ("http", "https") or not parts.hostname:
        raise _blocked("invalid_url", "Only http and https URLs are supported")
    if parts.username is not None or parts.password is not None or "@" in parts.netloc:
        raise _blocked("invalid_url", "URLs with embedded credentials are not allowed")
    default = 443 if parts.scheme.lower() == "https" else 80
    if (port or default) not in ALLOWED_PORTS:
        raise _blocked("url_blocked", "Only the standard web ports (80/443) are allowed")
    host = parts.hostname.rstrip(".").lower()
    if host in BLOCKED_HOSTS or host.endswith(BLOCKED_HOST_SUFFIXES):
        raise _blocked("url_blocked")
    try:
        return httpx.URL(raw)
    except Exception:
        raise _blocked("invalid_url", "That does not look like a valid URL") from None


async def resolve_target(raw: str, resolver: Resolver) -> Target:
    url = parse_url(raw)
    host = url.host.strip("[]")
    port = url.port or (443 if url.scheme == "https" else 80)
    try:
        ipaddress.ip_address(host.split("%", 1)[0])
        addresses = [host]  # literal IP: nothing to resolve
    except ValueError:
        try:
            addresses = await resolver(host, port)
        except (OSError, UnicodeError):
            raise _fetch_failed("Could not resolve that host") from None
    if not addresses:
        raise _fetch_failed("Could not resolve that host")
    # Refuse if ANY answer is internal: a mixed answer is a classic rebinding setup.
    if not all(is_public_ip(a) for a in addresses):
        log.warning("url_blocked_private_address")
        raise _blocked("url_blocked")
    return Target(url=url, host=host, port=port, ip=addresses[0])


def _pinned_request(client: httpx.AsyncClient, t: Target) -> httpx.Request:
    pinned = t.url.copy_with(host=t.ip)
    host = f"[{t.host}]" if ":" in t.host else t.host
    host_header = host if t.port in (80, 443) else f"{host}:{t.port}"
    return client.build_request(
        "GET",
        pinned,
        headers={
            "Host": host_header,
            "User-Agent": USER_AGENT,
            "Accept": "application/pdf, text/html;q=0.9, text/plain;q=0.8",
        },
        extensions={"sni_hostname": t.host} if t.url.scheme == "https" else {},
    )


@dataclass(frozen=True)
class Fetched:
    url: str  # final URL after redirects
    content_type: str  # canonical media type, one of ALLOWED_TYPES
    charset: str | None
    data: bytes


def _media_type(header: str) -> tuple[str, str | None]:
    media, _, params = header.partition(";")
    charset = None
    for p in params.split(";"):
        k, _, v = p.strip().partition("=")
        if k.lower() == "charset" and v:
            charset = v.strip().strip("\"'")
    return media.strip().lower(), charset


async def fetch_url(
    raw_url: str,
    *,
    max_bytes: int,
    timeout_seconds: float,
    max_redirects: int = 3,
    resolver: Resolver = system_resolver,
    transport_factory: TransportFactory | None = None,
) -> Fetched:
    """Fetch `raw_url` safely or raise an AppError (422 blocked/type, 413 size, 502/504 fetch)."""
    try:
        async with asyncio.timeout(timeout_seconds):
            return await _fetch(
                raw_url, max_bytes, timeout_seconds, max_redirects, resolver, transport_factory
            )
    except TimeoutError:
        raise AppError(504, "fetch_timeout", "The server took too long to respond") from None


async def _fetch(
    raw_url: str,
    max_bytes: int,
    timeout_seconds: float,
    max_redirects: int,
    resolver: Resolver,
    transport_factory: TransportFactory | None,
) -> Fetched:
    current = raw_url
    for hop in range(max_redirects + 1):
        target = await resolve_target(current, resolver)
        transport = (
            transport_factory() if transport_factory else httpx.AsyncHTTPTransport(retries=0)
        )
        # New client per hop: no cookie jar carries over; trust_env=False ignores proxy env vars.
        async with httpx.AsyncClient(
            transport=transport,
            follow_redirects=False,
            trust_env=False,
            timeout=httpx.Timeout(timeout_seconds, connect=min(timeout_seconds, 5.0)),
        ) as client:
            request = _pinned_request(client, target)
            try:
                response = await client.send(request, stream=True)
            except httpx.TimeoutException:
                raise AppError(
                    504, "fetch_timeout", "The server took too long to respond"
                ) from None
            except httpx.HTTPError:
                raise _fetch_failed() from None
            try:
                if response.is_redirect:
                    location = response.headers.get("location")
                    if not location:
                        raise _fetch_failed("The server sent an invalid redirect")
                    if hop == max_redirects:
                        raise _fetch_failed("Too many redirects")
                    current = urljoin(str(target.url), location)
                    continue
                if response.status_code != 200:
                    raise _fetch_failed(f"The server answered with status {response.status_code}")
                media, charset = _media_type(response.headers.get("content-type", ""))
                declared = response.headers.get("content-length", "")
                if declared.isdigit() and int(declared) > max_bytes:
                    raise AppError(413, "payload_too_large", "That page is too large (10 MB max)")
                if media not in ALLOWED_TYPES and media != "application/octet-stream":
                    raise AppError(
                        422, "unsupported_type", "Only PDF, HTML and plain-text pages are supported"
                    )
                buf = bytearray()
                try:
                    async for chunk in response.aiter_bytes():
                        buf += chunk
                        if len(buf) > max_bytes:
                            raise AppError(
                                413, "payload_too_large", "That page is too large (10 MB max)"
                            )
                except httpx.TimeoutException:
                    raise AppError(
                        504, "fetch_timeout", "The server took too long to respond"
                    ) from None
                except httpx.HTTPError:
                    raise _fetch_failed() from None
                data = bytes(buf)
                if media == "application/octet-stream":
                    if data[:1024].find(b"%PDF-") < 0:
                        raise AppError(
                            422,
                            "unsupported_type",
                            "Only PDF, HTML and plain-text pages are supported",
                        )
                    media = "application/pdf"
                if media in PDF_TYPES and data[:1024].find(b"%PDF-") < 0:
                    raise AppError(
                        422, "content_mismatch", "File content does not match its declared type"
                    )
                if not data:
                    raise AppError(422, "empty_file", "That page is empty")
                return Fetched(url=str(target.url), content_type=media, charset=charset, data=data)
            finally:
                await response.aclose()
    raise _fetch_failed("Too many redirects")  # pragma: no cover - loop always returns/raises


# --- HTML -> text -------------------------------------------------------------------------------
_SKIP = {"script", "style", "noscript", "template", "svg", "head", "iframe", "object", "embed"}
_BLOCK = {
    "p", "div", "br", "li", "ul", "ol", "tr", "table", "section", "article", "header", "footer",
    "h1", "h2", "h3", "h4", "h5", "h6", "pre", "blockquote", "hr", "dd", "dt", "main", "nav",
}  # fmt: skip


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.title = ""
        self._skip_depth = 0
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "title":
            self._in_title = True
        elif tag in _SKIP:
            self._skip_depth += 1
        elif tag in _BLOCK:
            self.parts.append("\n")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in _BLOCK:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False
        elif tag in _SKIP:
            self._skip_depth = max(0, self._skip_depth - 1)
        elif tag in _BLOCK:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data
        elif self._skip_depth == 0:
            self.parts.append(data)


def html_to_text(html: str, max_chars: int) -> tuple[str, str]:
    """Return (text, title). Scripts/styles are dropped; no markup survives."""
    p = _TextExtractor()
    p.feed(html)
    p.close()
    lines = (" ".join(line.split()) for line in "".join(p.parts).splitlines())
    text = "\n".join(line for line in lines if line)
    return text[:max_chars], " ".join(p.title.split())


def decode_text(data: bytes, charset: str | None) -> str:
    for enc in (charset, "utf-8"):
        if not enc:
            continue
        try:
            return data.decode(enc)
        except (LookupError, UnicodeDecodeError):
            continue
    return data.decode("utf-8", errors="replace")
