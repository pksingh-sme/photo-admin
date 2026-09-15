# Application security standard

**Requirement:** `FR-SEC-004` (Sprint 0 item 0.11)

This file names the standard we test against. It does not replace a verification report, and it does not assign owners.

## Decision

The PhotoPrint Admin section and API are designed, built and verified against **OWASP Application Security Verification Standard (ASVS), Level 2**. Verification is required **before production release**.

Cardholder data is out of PCI DSS scope for this system: payment card data is delegated to a PSP. That does not lower the ASVS target.

## Why Level 2

Level 2 is the right target because this platform:

- processes personal data, including customer photographs (`FR-SEC-003`)
- operates under GDPR, including erasure and residency obligations
- handles payment *flows*, while card data itself is handled by a PSP

Level 3 is for systems where compromise threatens life or critical infrastructure. The extra cost is not proportionate here.

Level 1 is a baseline for low-assurance systems. It is not enough for tenant isolation, personal photographs, or GDPR-grade erasure.

## Edition

The named standard is **ASVS Level 2**. The exact ASVS edition (for example 4.0.3, with chapters V1–V14) is pinned when the third-party verification is booked — not invented here. Until that pin, ownership mapping uses the ASVS 4.x V1–V14 chapter layout.

## Still required from the team

This document records the name of the standard. Item 0.11 is **agreed** only when the sponsor has signed it. The following are not for an agent to invent:

| Action | Status |
|---|---|
| Sponsor agreement on ASVS Level 2 as the target | Outstanding |
| Mapping of ASVS V1–V14 chapters to owners | Outstanding |
| Pre-release verification booked with a third party | Outstanding |
| ASVS control IDs referenced from the relevant `.cursor/rules` files, so the standard shapes the code rather than sitting only in this file | Outstanding |

## Chapter breakdown (owners to be filled)

Use this table when assigning owners. Do not treat an empty owner as “everyone”.

| Chapter | Topic | Owner |
|---|---|---|
| V1 | Architecture, design and threat modelling | — |
| V2 | Authentication | — |
| V3 | Session management | — |
| V4 | Access control | — |
| V5 | Validation, sanitization and encoding | — |
| V6 | Stored cryptography | — |
| V7 | Error handling and logging | — |
| V8 | Data protection | — |
| V9 | Communication | — |
| V10 | Malicious code | — |
| V11 | Business logic | — |
| V12 | Files and resources | — |
| V13 | API and web service | — |
| V14 | Configuration | — |

Controls that already have a BRD home (tenancy `FR-TEN-*`, secrets `FR-SEC-001`, erasure `FR-SEC-007`, EEA residency `FR-SEC-005`) still count as ASVS Level 2 work. They are not a substitute for the chapter mapping or the third-party verification.
