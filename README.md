# Read Twice

A calm second eye for pages that look off.

Read Twice is a free, open-source browser extension that watches for the patterns
behind online scams and shows a short, plain-language warning **before** you click,
type, pay, or call. It's built for non-technical adults — especially anyone handling
money, invoices, or unfamiliar payment requests on the open web — and it speaks like
a friend who happened to glance over your shoulder, not a security alarm.

It does not block pages, track you, or shout. It notices something specific, tells you
what it noticed in one sentence, and trusts you to decide.

## How it works

On each page, a small local engine checks for the shapes scams take — a brand-new
domain asking for payment, a page pretending to be the IRS or USPS, urgency language,
a payment form that sends your card somewhere unexpected, a fake support number. If
something matches, a warm **amber** ("worth pausing") or **coral** ("close this tab")
banner slides in at the top of the page. That's it.

Everything runs on your device. The extension makes exactly **one** outbound call by
default — an anonymous domain-registration lookup (RDAP) to check how new a site is —
and that's cached for 30 days and can be turned off. No analytics, no telemetry, no
accounts, no AI reading your pages.

## Status

**v0.1.0, in active development — built in the open.** The heuristic engine is being
implemented rule by rule; the banner and the remaining rules are under construction.
Not yet published to the Chrome Web Store or Firefox Add-ons. Expect rough edges — and
feel free to watch the work happen on `dev`.

## Development

```sh
pnpm install
pnpm dev      # Vite + crxjs HMR; load the built dir as an unpacked extension
pnpm build    # production build to dist/
pnpm test     # unit tests (Vitest)
pnpm typecheck
```

> **Poseidon note:** running `pnpm test` here needs the rolldown-wasi shim —
> see the device notes for the `NAPI_RS_NATIVE_LIBRARY_PATH` workaround.

## The detection rules live in a separate repo

The heuristic rules — the patterns, phrase lists, and the labeled scam/legit fixture
corpus — live in a companion repository, [`read-twice-rules`][rules], under a Creative
Commons license. They're community-contributable and independently auditable; this
extension bundles a copy at build time. See that repo to propose a new rule or report
a scam we missed.

[rules]: https://github.com/kVadrum/read-twice-rules

## License

Code is [MIT](LICENSE). The **Read Twice** name, wordmark, logo, and verdict colour
palette are trademarks of KeMeK Network / kVadrum and are **not** covered by the MIT
grant — fork the code freely, but ship it under your own name. See the trademark
notice in [LICENSE](LICENSE).
