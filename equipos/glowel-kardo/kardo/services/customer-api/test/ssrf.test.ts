import { describe, expect, it } from "vitest";
import { isUnsafeIp } from "../src/ssrf.js";

describe("isUnsafeIp", () => {
  it.each([
    "10.0.0.5",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "fe80::1",
    "fc00::1",
    "fd12:3456:789a::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "not-an-ip",
    // Security review 2026-10: ranges the first version missed.
    "fe90::1",
    "febf::1",
    "::7f00:1",
    "64:ff9b::7f00:1",
    "2002:7f00:1::1",
    "2001:db8::1",
    "192.0.0.1",
    "192.0.2.10",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.9",
    "255.255.255.255",
    "::ffff:7f00:1",
    "::ffff:a9fe:a9fe",
  ])("treats %s as unsafe", (ip) => {
    expect(isUnsafeIp(ip)).toBe(true);
  });

  it.each([
    "93.184.216.34",
    "8.8.8.8",
    "2606:4700:4700::1111",
    "2a03:2880:f12f:83:face:b00c::25de",
    "172.32.0.1",
  ])("treats %s as safe (public)", (ip) => {
    expect(isUnsafeIp(ip)).toBe(false);
  });
});
