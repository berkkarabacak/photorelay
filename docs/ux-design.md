# PhotoRelay — UX Design

Version 0.1 · Status: initial design

---

## 1. Experience principle

> The user should never have to understand MTP, SMB, networking, checksums,
> folders, or synchronization.

Every screen is designed for the moment a transfer goes wrong — because that
is the moment every competing product fails. Interruption is presented as a
*state the product handles*, never as an error the user must solve.

## 2. The one-sentence promise

**"Pick your photos. Press Transfer. Walk away."**

Supporting promise, shown everywhere state surfaces:

- Connection lost → **"Connection lost — waiting for phone…"**
- Reconnected → **"Connected — resuming transfer…"**

No modal error dialogs. No "retry?" buttons for network conditions. The app
retries by itself, forever, with backoff.

## 3. Core flows

### 3.1 First run & pairing (target: under 60 seconds)

```mermaid
flowchart LR
    A[Install PC app] --> B[PC shows QR code<br/>"Scan with the PhotoRelay app"]
    B --> C[Install/open phone app<br/>camera opens immediately]
    C --> D[Scan QR]
    D --> E[Both screens show the<br/>same 6 words → tap Confirm]
    E --> F["Choose: Back up everything /<br/>Pick albums"]
    F --> G[Press Transfer]
```

Rules:

- No account creation, ever.
- The phone app's first screen *is* the scanner — no setup wizard before
  pairing.
- The SAS word check is mandatory but lightweight (one tap per side).
- If mDNS works, subsequent launches skip QR entirely: "Pixel 8 found — tap
  to connect."

### 3.2 Transfer

One screen, three zones:

1. **Headline state** — one sentence, present tense:
   *"Transferring 2,847 of 3,061 items — 41 min left"*
2. **Progress** — one bar showing **verified bytes**, not optimistic bytes;
   underneath: throughput, current file name, counts (done / remaining /
   already-backed-up).
3. **Detail (collapsed by default)** — per-file list and the event log, for
   curious users. Never required.

The user can close the laptop lid, unplug the phone, or kill the app at any
moment. The headline simply changes to the waiting message. This behavior
is demoed live on the website.

### 3.3 Interruption & resume

| Situation | PC shows | Phone shows |
| --- | --- | --- |
| Wi-Fi drops | "Connection lost — waiting for phone…" | "Connection lost — waiting for PC…" |
| Reconnect | "Connected — resuming transfer…" then normal headline | same |
| PC app closed | — | "PC app not reachable — will keep retrying" |
| Phone app killed | "Waiting for phone…" | (on relaunch) straight into "Resuming…" |
| Disk full | "PC disk is full — free 12 GB to continue" (blocks, never fails) | "PC needs space — paused, will resume" |

Nothing in these states asks the user a question. Questions are only for
things the product genuinely cannot decide (free disk space, grant
permission).

### 3.4 Completion

Headline: **"Done. 3,061 items backed up and verified."**

Sub-line: "214 were already backed up — skipped automatically."

Then: a single "Verify a copy" affordance for the paranoid (runs Level-3
SHA-256 checks), and a quiet suggestion to enable automatic background
backup.

## 4. Copy deck (normative strings)

| Key | String |
| --- | --- |
| `state.transferring` | Transferring {done} of {total} items — {eta} left |
| `state.waiting_phone` | Connection lost — waiting for phone… |
| `state.waiting_pc` | Connection lost — waiting for PC… |
| `state.resuming` | Connected — resuming transfer… |
| `state.verifying` | Verifying {done} of {total}… |
| `state.complete` | Done. {total} items backed up and verified. |
| `state.disk_full` | PC disk is full — free {needed} to continue |
| `pairing.scan` | Point your phone's camera at this code |
| `pairing.confirm` | Do both screens show the same 6 words? |
| `dedup.note` | {n} were already backed up — skipped automatically |

Tone rules: present tense, no exclamation marks, no blame ("connection
lost", never "you disconnected"), numbers formatted with thousands
separators, times rounded to the minute.

## 5. What the user never sees

- Error codes, stack traces, "retry/cancel" dialogs for network conditions
- File paths as primary UI (they exist in Details for power users)
- The words MTP, TCP, TLS, checksum, manifest, chunk (docs may; UI does not)
- A "Start over" button — there is nothing to start over

## 6. Accessibility & platforms

- All state conveyed by text, not color alone; interruption states use
  motion (subtle pulse) plus text.
- Minimum contrast WCAG AA; headline state readable at arm's length
  (≥ 20 pt equivalent).
- Windows: tray-first app; window optional. Phone: transfer works from a
  notification; app UI optional during transfer.
- Localization-ready: all strings keyed (§4); pluralization via ICU.

## 7. Website UX (this repo)

The website is the product's front door and a teaching tool:

1. **Explain the problem** — visitors must recognize their own pain in
   under 10 seconds.
2. **Demonstrate the protocol** — a live, in-browser simulation of a
   3,061-item transfer with a "Simulate disconnect" button. Visitors
   *feel* the resume behavior before installing anything.
3. **Document the design** — the specs in `docs/` are linked as first-class
   content for technical evaluators and contributors.

The demo is not a mockup of the UI; it is a working model of the protocol
state machine (journal, chunk map, resume offsets) implemented in
TypeScript against the same constants as the spec.
