# Deck reference — the William Tell pattern (mađarice)

The deck Bela is actually played with is the **Tell pattern** (*Tell-mintájú kártya*,
*doppeldeutsche Karten*), designed by József Schneider in Pest, **1835**. The pattern itself is long
public-domain; modern printings (Piatnik etc.) are copyrighted artwork, so our deck is an **original
SVG interpretation of the traditional composition** — nothing traced.

Reference imagery for eyeballing (public-domain / documentation):
- IPCS pattern sheet: https://i-p-c-s.org/pattern/tell-1.html
- Wikimedia photos: https://commons.wikimedia.org/wiki/Category:William_Tell_pattern
- History: https://kepmas.hu/en/why-swiss-william-tell-playing-card-discovering-secret-hungarian-deck

## The canon, card by card

### Aces (as) — the four seasons

The aces (historically deuces — they carry **two pips**) break from the Tell theme and show the
seasons. Scene canon per IPCS:

| Suit | Season | Scene |
|---|---|---|
| srce (hearts) | Proljeće / Tavasz / Spring | a girl with flowers |
| bundeva (bells) | Ljeto / Nyár / Summer | a weary reaper with a scythe |
| list (leaves) | Jesen / Ősz / Autumn | grape pressing at a vat |
| žir (acorns) | Zima / Tél / Winter | two men in fur hats by a campfire |

Our rendering: two pips flanking the top, framed scene in the middle, season name on a banner,
localized (hr/sr-Cyrl/en) via `@belot/i18n`.

### Courts — double-headed, characters from Schiller's *Wilhelm Tell*

All courts are **double-headed** (mirrored half-figures about a centre rule). Obers and Unters are
**named characters** with a name ribbon; kings are generic royalty **on horseback**.

| Suit | Kralj (K) | Baba / Ober (B) | Dečko / Unter (D) |
|---|---|---|---|
| žir | mounted king | **Tell Vilmos** — crossbow, feathered cap | Harras Rudolf — halberdier |
| srce | mounted king | Gessler Hermann — the tyrant: tall hat, staff | Kuoni pásztor — shepherd's crook |
| bundeva | mounted king | Stüszi vadász — hunter: horn, feather | Reding Itell — raised sword (Rütli oath) |
| list | mounted king | Rudenz Ulrich — young noble: sword, circlet | Fürst Walter — bearded elder, scroll |

Distinguishing conventions we reproduce:
- **Ober vs Unter = pip position**: Ober's suit pip sits **high** (beside the head), Unter's sits
  **low** (by the centre rule). This is the origin of the Croatian *gornjak/dolnjak* nicknames.
- Kings: crown + sceptre, horse's head and neck rising through the half-figure.
- Courts are **multicoloured** (blue/red/green/yellow garb mixed per character) — suit identity is
  carried by the pip, not by tinting the whole figure. This is how a real deck reads.
- Name ribbons carry the short traditional name: TELL, GESSLER, STÜSZI, RUDENZ, HARRAS, KUONI,
  REDING, FÜRST.

### Number cards VII–X

Repeated pips in two columns (lower half printed inverted), Roman numeral corner indices.
**VII of acorns carries the maker's name in a central panel** — the traditional signature spot;
ours reads **BELA ŠTIH**.

### App-side deviations from the physical deck (deliberate)

- Corner indices on every card (physical courts have none) — thumb-fan usability on a phone.
- One centred name ribbon per court half instead of edge-printed names — legibility at 46–58 px.
- Season banners localized rather than Hungarian-only.
