import test from "node:test";
import assert from "node:assert/strict";
import { certificateHostnameError } from "../dist/checks/tls.js";

test("explicit TLS hostname verification accepts matching DNS and IP SANs", () => {
  const dnsCertificate = {
    subject: { CN: "example.com" },
    subjectaltname: "DNS:example.com, DNS:*.example.net",
  };
  const ipCertificate = {
    subject: {},
    subjectaltname: "IP Address:127.0.0.1",
  };

  assert.equal(certificateHostnameError("example.com", dnsCertificate), undefined);
  assert.equal(certificateHostnameError("127.0.0.1", ipCertificate), undefined);
});

test("explicit TLS hostname verification rejects mismatches", () => {
  const certificate = {
    subject: { CN: "example.com" },
    subjectaltname: "DNS:example.com",
  };
  assert.match(
    certificateHostnameError("api.example.com", certificate),
    /not in the cert's altnames|does not match/i,
  );
});

test("an IP target rejects a certificate with only a matching-looking DNS SAN", () => {
  const dnsOnlyCertificate = {
    subject: { CN: "127.0.0.1" },
    subjectaltname: "DNS:127.0.0.1",
  };

  assert.match(
    certificateHostnameError("127.0.0.1", dnsOnlyCertificate),
    /IP Address|not in the cert's list|does not match/i,
  );
});
