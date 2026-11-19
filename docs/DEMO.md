# Live demo script: Lantern

What the presenters say and do, in three acts, in about 4 minutes. Anyone on the team can run it.
Rehearse it at least once on the venue Wi-Fi.

- **Setup lives in the README.** The steps for building, loading and checking the presenting laptop are in [`README.md` → Demo runbook](../README.md#demo-runbook). Do those first.
- **Present with the deck:** [`deck/lantern-demo-deck.html`](../deck/lantern-demo-deck.html). It's a single file that works offline: arrow keys to move, and day or night mode. When you reach the slide **"A working slice, not a mockup."**, switch to Chrome and run the three acts below. Then come back to the deck for the roadmap slide.

| Act | Story | Time |
|---|---|---|
| 1 | A scam link arrives in the family chat, and Lantern marks it before anyone clicks | ~1.5 min |
| 2 | Someone asks the Lantern Assistant about it, in plain words, in English or Bahasa | ~1.5 min |
| 3 | The checker goes offline, and Lantern says so honestly instead of pretending | ~1 min |

## Roles

- **Driver**: at the laptop, connected to the projector. Clicks and types.
- **Sender**: holds the phone and sends the scam messages into the chat on cue.
- **Narrator**: speaks the lines below and moves the deck. The Driver can also narrate if you're short of people.

---

## The day before

- [ ] **Laptop set up** per the README Demo runbook: built, loaded unpacked into a fresh Chrome profile, icon pinned.
- [ ] **Demo WhatsApp account.** Log in to WhatsApp Web in that profile with a demo number, not a personal one. Make a group called **Family** with the Sender's phone in it.
- [ ] **Check the badges on the real WhatsApp Web.** Badges have only been checked on test pages so far. Send yourself one link from Act 1 and make sure a badge appears. If none appears, tell the extension owner the same day, and plan to skip Act 1 steps 2–8.
- [ ] **Know what the assistant says.** Without a model key on the server, the assistant answers from a keyword mock. Run Act 2 once and note what it says, so nobody is surprised on stage.
- [ ] **Prepare the messages.** The Sender saves them in the phone's Notes app, ready to copy and paste.
- [ ] **Record a backup video.** Screen-record one good run of all three acts.
- [ ] **Run the simulation:** `cd extension && npm run sim -- --live` checks the real server. 13 of 16 checks pass. The 3 failures are two kinds of link that the live server rates only 🟡, so don't use them on stage:
  - a bare IP address, such as `http://203.0.113.7/...`
  - `real-bank.com@evil.top`

## 30 minutes before

- [ ] Run `curl <API_BASE>/health` and check it returns `{"status":"ok"}`. The address is in `extension/src/config.ts`. If the tunnel has restarted, follow the README runbook to refresh it, then rebuild and press **Reload** on Lantern in `chrome://extensions`.
- [ ] Laptop: turn on Do Not Disturb and close every app that can pop up. Zoom Chrome to 125%.
- [ ] Open the deck in one window. In the demo Chrome profile, open two tabs: (1) WhatsApp Web on the **Family** chat, and (2) a neutral site, such as a news page.
- [ ] Phone: charged, on Do Not Disturb, Notes open.
- [ ] Have a phone hotspot ready in case the venue Wi-Fi fails.

---

## Act 1: the link in the chat (about 1.5 min)

| Step | Who | Do | What the audience sees |
|---|---|---|---|
| 1 | Narrator | *"This is Mak's family group. Scams don't arrive on strange websites; they arrive here, from people she trusts."* | The WhatsApp Family chat |
| 2 | Sender | Sends `Jom lunch pukul 1? https://www.google.com/maps/place/Nasi+Kandar` | Green badge |
| 3 | Sender | Sends `Mak, bank kata kena update akaun sebelum malam ni https://maybank2u-secure-login.xyz/login` | **Red badge** within about a second, before anyone clicks |
| 4 | Driver | Hovers over the red badge | The plain-language reason |
| 5 | Narrator | *"Lantern read the link before she did. Only the shape of the link leaves her computer, never the chat."* | |
| 6 | Driver | Clicks the red link | The **warning page** opens instead of the fake bank page |
| 7 | Narrator | *"One big, easy button: go back. Continuing is possible, but it's the hard choice."* | |
| 8 | Driver | Clicks **Go back to safety** | Back in the chat |
| 9 | Driver | In tab 2, types `secure-maybank.login-verify.top/acc` into the address bar | The warning page again |
| 10 | Narrator | *"It isn't only chat. A link from an SMS or an email, typed in or clicked anywhere, gets the same check."* | |

**Other links that work live:**

| Link | Badge |
|---|---|
| `https://bit.ly/3xYzAbc` | 🟡 be careful |
| `https://xn--pypal-4ve.com/signin` (fake PayPal) | 🔴 |
| `https://www.maybank2u.com.my/home/m2u/common/login.do` (the real bank) | 🟢 |

## Act 2: ask the Lantern Assistant (about 1.5 min)

| Step | Who | Do | What the audience sees |
|---|---|---|---|
| 1 | Driver | Clicks the Lantern icon to open the side panel | The Lantern Assistant chat, with starter questions |
| 2 | Driver | Pastes the link `https://maybank2u-secure-login.xyz/login` and clicks **Check** | A HIGH verdict card, with the reasons and what was checked |
| 3 | Driver | Opens **What leaves this device** | Only the redacted link details |
| 4 | Narrator | *"This list is everything that left her computer: no full address, no chat, no name."* | |
| 5 | Driver | Clicks **Ask Lantern Assistant to explain** | The assistant explains in plain words |
| 6 | Driver | Taps the quick reply **What if I already clicked?** (there are also **Why?** and **I already paid**) | Plain next steps |
| 7 | Driver | Switches **EN → BM** and pastes `Parcel anda tertahan. Bayar RM2.50 sekarang atau parcel dipulangkan.` | The verdict and help in Bahasa Melayu (the quick reply becomes **Kalau saya dah klik?**) |
| 8 | *Optional* | Driver attaches a screenshot of a scam message (paste, drop, or **Attach**) | A verdict that lists "the screenshot" under what was checked |

Whatever you paste goes to the server and appears on its dashboard (with no login), so only paste demo text. The assistant's wording comes from a model, or from the keyword mock when no key is set. Don't promise an exact sentence.

## Act 3: when the checker is down (about 1 min)

| Step | Who | Do | What the audience sees |
|---|---|---|---|
| 1 | Narrator | *"Now the hard case: what if our server can't be reached?"* | |
| 2 | Driver | Turns off the laptop's Wi-Fi | |
| 3 | Driver | In the side panel, pastes `https://secure-maybank.login-verify.top/acc` and clicks **Check** | **Not checked**: treat it as unverified |
| 4 | Narrator | *"Lantern never shows green when it couldn't check. If it can't ask the server, it says so, and she treats the link as unverified."* | |
| 5 | Driver | Turns Wi-Fi back on | |

This matches the code: with no answer from the server, links show Not checked, the warning page does not appear, and the assistant says it did not answer. Rehearse it once anyway.

---

## If something goes wrong

| Problem | Do this |
|---|---|
| No badge appears in WhatsApp | Carry on with step 9 of Act 1 (address bar), then Act 2. They don't depend on WhatsApp |
| Every badge says ⚠︎ Not checked | The server or tunnel is down. Say *"this is our Act 3"* and do Act 3 now, then use the README's backup steps (local gateway, or `npm run mock-api`) |
| Venue Wi-Fi is down | Switch to the phone hotspot |
| No internet at all | Use the deck's three interactive simulations (chat badges, warning page, assistant panel). They're built into the deck and need no internet. Or run `cd extension && npm run sim -- --headed` |
| Laptop problem | Play the backup video |
| The assistant is slow (it can take up to about 20 s) | Narrate over it. The card shows it's checking. Don't click twice |

## Q&A answers worth having ready

- **"Does it work on my phone?"** Not yet: it's a desktop Chrome extension. On a phone, you copy the message or a screenshot into the assistant. Native app coverage is not in v1.
- **"Do you read my chats?"** No. For links, only the redacted shape leaves the device, and the panel shows exactly what is sent. Text you paste into the assistant yourself is sent to be checked, and nothing is saved on the device.
- **"What if the server is wrong?"** No model can lower a verdict to safe: models give evidence, code sets the threshold. On-device brand rules raise known lookalikes to HIGH. If the server can't be reached, the link shows Not checked, never green.
