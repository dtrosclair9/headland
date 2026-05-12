# Headland — Market Sizing

**Last updated:** 2026-05-07
**Author:** Dayne Trosclair (Strykora)
**Companion doc:** [`sugarcane-domain.md`](./sugarcane-domain.md) — read that first for industry vocabulary, mill operators, acreage by parish/county, and grower org structure.

---

## What this doc is

This is the internal market-sizing analysis for **Headland**, a field-mapping and records SaaS targeting US sugarcane growers in **Louisiana** and **Florida** (the only two states with active US mainland cane production in 2026 — Texas closed its last raw-sugar mill in 2024; Hawaii's last commercial harvest was 2016).

It is written to be **defensible**, not aspirational. Every farm count, acreage figure, and price assumption is sourced or transparently flagged as an estimate. The math is shown end-to-end so future-me (or a partner / investor) can stress-test the numbers without re-deriving them.

**Update cadence:** revisit annually after each Census of Agriculture release (next full Census 2027) and whenever a competitor publishes a price change. NASS Crop Production updates the harvested-acreage figure each spring.

---

## TL;DR

- **TAM is small but real.** ~850 US sugarcane farms managing ~937,000 harvested acres (LA 520k + FL 417k). At a $1,500/yr/farm price the absolute revenue ceiling is roughly **$1.27M ARR**; at $3/ac/yr it's **$2.81M ARR**. This is a niche, not a mass market.
- **SAM is mostly Louisiana family farms.** Florida is structurally hostile to SaaS (3 corporate operators control >90% of FL acreage and have internal systems). Filtering LA's ~700 farms for size + tech-readiness + non-locked-in yields ~250–350 realistically reachable buyers. SAM ≈ **$375k–525k ARR** at $1,500/farm/yr.
- **SOM at 3 years is a $75k–$180k ARR business, base case.** A solo founder with deep South-LA ties, parish-level SEO, and one or two design-partner farms can plausibly land 50–120 paying LA farms by year 3. High case touches $250k ARR if a co-op or factory channel partnership lands. Florida is a corporate-sale motion, not a SaaS motion.
- **The honest pitch.** Headland is a **defensible $100k–$300k ARR specialty-SaaS business** by year 3 if focused on LA family farms; pushing past $1M ARR realistically requires (a) winning a co-op as a reseller, (b) cracking a corporate FL operator as one custom deal, or (c) expanding the platform to an adjacent crop (rice, citrus) that shares the South-Louisiana grower base. As a cash-flowing, founder-owned tool it works; as a venture-scale SaaS it doesn't, unless it broadens beyond cane.

---

## 1. TAM (Total Addressable Market)

### 1.1 Farm count

The cleanest hard number for "how many sugarcane farms exist in the US" comes from the **USDA NASS Census of Agriculture**, which counts operations harvesting sugarcane for sugar on the long form (it's a separately tabulated commodity). The most recent full Census is **2022** (published 2024); the prior was 2017.

Approximate counts, drawn from Census of Agriculture tabulations and the grower-org rosters cross-referenced in the domain doc (ASCL, SCGC, Florida Sugar Cane League, mill grower lists):

| Region | Operations harvesting cane for sugar | Notes |
|---|---|---|
| **Louisiana** | **~650–720** | ASCL and the 11 LA mills' grower rosters together cover roughly 650–700 distinct grower entities; the Census number has historically tracked similarly. Many growers deliver to one mill; some deliver to two. |
| **Florida** | **~140–160** | SCGC alone has 45 grower-owners; US Sugar farms its own ~230k acres in-house (counts as one entity, though it has many internal "farms"); Florida Crystals farms its own acreage; remaining independents deliver to FC or SCGC. |
| **US total** | **~800–880** | Texas exit (2024) removed ~100 RGV-area cane operations from the count. |

I'm using a **point estimate of 850 US cane operations: 700 LA + 150 FL**, consistent with the user-supplied figure and within the Census range.

**A note on FL "farm count" vs. acreage:** Florida is dominated by three corporate operators — **US Sugar** (~230,000 acres farmed in-house), **Florida Crystals** (~150,000+ acres farmed in-house and through affiliates), and **Sugar Cane Growers Cooperative of Florida / SCGC** (~70,000 acres across 45 grower-owners). The "150 farms" number in FL is misleading: in practice three buyers control the digital purchase decision for the vast majority of FL acreage. We will revisit this in the SAM section.

### 1.2 Total acreage

From the domain doc, cross-referenced with USDA NASS Crop Production 2024 and FSA reports:

| State | Harvested acres (sugar + seed) | Source |
|---|---|---|
| Louisiana | **520,000** harvested (NASS 2024); **~536,000** planted (FSA 2024) | NASS Louisiana Annual 2024; FSA acreage reports cited in ASCL crop summary |
| Florida | **417,000** harvested (NASS 2024) | NASS 2024; UF/IFAS EREC reports ~417k–440k depending on year |
| **US total** | **~937,000 harvested** | NASS |

For TAM math I'll use **940,000 acres** as a clean round number. Year-to-year variation is ±5%.

### 1.3 TAM revenue ceiling — per-farm pricing

If 100% of US cane farms subscribed at flat-fee pricing:

| Price/farm/yr | × 850 farms | TAM ceiling |
|---|---|---|
| $500 | 850 × $500 | **$425,000** |
| $1,500 | 850 × $1,500 | **$1,275,000** |
| $5,000 | 850 × $5,000 | **$4,250,000** |

### 1.4 TAM revenue ceiling — per-acre pricing

If 100% of US cane acres were on the platform:

| Price/ac/yr | × 940,000 ac | TAM ceiling |
|---|---|---|
| $1 | 940k × $1 | **$940,000** |
| $3 | 940k × $3 | **$2,820,000** |
| $5 | 940k × $5 | **$4,700,000** |

### 1.5 Reading the ceiling

Two things are immediately clear:

1. **Per-acre pricing dramatically outperforms per-farm flat fees** because of the FL acreage concentration. A flat $1,500/farm captures the same $1,500 from US Sugar (230k acres) as from a 200-acre Iberia Parish family farm. Per-acre at $3 captures **$690,000 from US Sugar alone** vs. $600 from the small farm — and that's the point.
2. **The whole US cane market, even captured 100%, is a $1–5M ARR business.** That's enough for a healthy founder-owned business but **not enough on its own** for a venture-scale SaaS path. The TAM math is the most important honesty check in this whole doc: if you raise money against this, you are implicitly raising against expansion to adjacent crops or geographies, not against US cane alone.

### 1.6 TAM expansion — order of magnitude only

Rough acreage scale, no detailed math:

| Expansion target | Approximate acreage / hectarage | Order of magnitude vs. US cane |
|---|---|---|
| **Mexico cane** | ~700k–800k hectares (~1.7–2.0M acres) | ~2× US |
| **Caribbean** (DR, Jamaica, Belize, Guyana, Guatemala) | ~1M+ ha combined | ~2.5× US |
| **Brazil cane** | ~8M+ hectares (~20M acres) | ~20× US — but Solinftec and others entrenched |
| **US rice** (LA/AR/MS/TX/CA) | ~2.5M acres | ~2.7× US cane |
| **US citrus** (FL/CA/TX) | ~600k–700k acres | ~0.7× US cane |
| **US table beets / sugar beets** | ~1.1M acres sugar beets (MN/ND/MI/ID) | ~1.2× US cane |

**Practical read:** Brazil is the only path to true scale, and it's also the path with the strongest incumbents (Solinftec, Climate FieldView Brasil, Strider). Mexico + Caribbean are interesting because they're underserved but require Spanish localization and on-the-ground partnerships. The cleanest US expansion is **rice + sugarcane bundling** — same growers in LA/TX use the same platform for both crops; the data model overlaps heavily (variety, planting date, irrigation, harvest tickets).

---

## 2. SAM (Serviceable Addressable Market)

SAM = the slice of TAM that **realistically would buy field-mapping SaaS** if Headland hit them with a polished pitch. Filter the TAM on three axes: size, tech-readiness, and competitor lock-in.

### 2.1 Filter 1 — Operation size

Below ~100 acres, a grower can fit field records on a clipboard or in a spreadsheet without much pain. Pain (and willingness to pay) starts climbing at:

- **>200 ac:** records start mattering for FSA-578 reporting and crop insurance APH; pain real but episodic.
- **>500 ac:** multiple varieties on different fields, multi-year stubble tracking, scouting becomes meaningful, mill ticket reconciliation gets tedious.
- **>1,000 ac:** clear ROI on a $1,500–$5,000/yr tool; likely already using *something* (Excel + a mapping app + paper).

USDA Census-style size distribution for LA cane farms, estimated from the 520k LA acres / ~700 farm denominator (avg ~743 ac/farm) and grower-roster anecdata (the long-tail of small farms is real but a minority of acreage):

| Size band | Approx. share of LA farms | Approx. share of LA acres |
|---|---|---|
| <100 ac | ~20% | ~2% |
| 100–500 ac | ~35% | ~15% |
| 500–1,500 ac | ~30% | ~35% |
| 1,500–5,000 ac | ~12% | ~30% |
| >5,000 ac | ~3% | ~18% |

Setting the cutoff at **>200 ac** keeps roughly **75–80% of LA farms** (~525–560 farms) and ~98% of LA acreage in the SAM funnel. Setting it at **>500 ac** drops to **~45% of farms** (~315) but still ~83% of acres.

For Headland's positioning (a polished mapping/records tool, not a grain-marketing or accounting suite), the realistic floor is **>200 ac**. Below that the buyer either uses paper or doesn't pay.

### 2.2 Filter 2 — Tech-readiness / operator age

The standard ag-demographics number is from USDA NASS: the **average age of US principal farm operators is ~58** (2022 Census). Cane is similar. But cane farms in South Louisiana are heavily multi-generational, and the buying decision for software is increasingly made by the **30–45 year-old "next-generation" operator** — the son, son-in-law, or daughter who came back from LSU with an ag-business degree, runs the iPad in the truck, and pushes the older generation toward digital tools.

Anecdata-grade estimate for LA cane: **40–50% of farms >200 ac have a "next-gen" decision-maker actively involved.** That's the core SaaS-receptive cohort. The rest are reachable but require the older operator to be sold directly, which is much harder.

Applying this filter to LA's ~525–560 farms in the size-eligible bucket: **~210–280 farms** pass both size and tech-readiness filters.

### 2.3 Filter 3 — Competitor lock-in

This is where direct intelligence is thinnest, but here's the defensible read:

- **farmmind.org** — direct competitor, sugarcane-specific. Public info on their footprint is limited; based on the user's own market scan, they are a small operation themselves, not a dominant player. **Estimated LA cane share: <5%** (a handful of design-partner farms at most). Not yet entrenched.
- **Climate FieldView (Bayer)** — built around row crops (corn, soy, cotton, wheat). Cane-specific records (variety, stubble year, billet vs. whole-stalk, mill-ticket CRS/TRS) are not well supported. Many cane farmers who *also* grow soybeans in rotation may have FieldView for the soy side, but cane records still live elsewhere. **Estimated LA cane "primary tool" share: <10%.**
- **Granular (Corteva)** — financial/operational management, more enterprise-leaning. Pricing is high enough that small/mid LA farms don't bite. **Estimated LA cane share: <5%.**
- **Trimble Ag / Trimble Farmer Pro / Connected Farm** — strongest position via existing Trimble GPS/guidance hardware on tractors and harvesters. If a grower has a Trimble display in the cab, they may use the Trimble cloud for as-applied maps. **Estimated LA cane share: 15–25% for as-applied maps; lower for full records.**
- **AgWorld** — strong in row crops and irrigated permanent crops; light footprint in LA cane. **<5%.**
- **OneSoil** — free tier popular for satellite NDVI viewing; not really a records system. Many growers may have it open in a browser tab but it's not the system of record. **Not a paid-tier competitor.**
- **Spreadsheet + paper + FSA's GIS** — the actual incumbent. **Probably 60–70% of LA cane farms** have no farm-software subscription and run on paper, Excel, and the FSA county-office printout. That's the real SAM Headland is fighting for.

**Net of competitor lock-in:** assume ~25–35% of LA size+age-eligible farms are already locked into something they won't easily leave (mostly Trimble guidance ecosystems where the field boundaries already live). That leaves **~150–210 LA farms** as the realistic SAM after all three filters.

### 2.4 Florida SAM

Florida is structurally different. Filter the ~150 FL "farms":

- **US Sugar** (~230k ac) — runs Clewiston Mill, has internal IT and likely custom software. Selling to them is an enterprise sale, not a SaaS subscription. **Outside SAM** for self-serve pricing.
- **Florida Crystals** (~150k+ ac) — same story. Has internal systems and parent company (Fanjul / FCC) discipline. **Outside SAM** for self-serve.
- **SCGC's 45 grower-owners** (~70k ac, avg ~1,500 ac/grower) — these *are* family-style operations and could plausibly buy SaaS, but the decision is gated through the co-op. **Possibly in SAM** if SCGC is sold a group deal.
- **Independent growers delivering to FC or US Sugar** (~50–80 entities) — partially in SAM; many are small relative to the US Sugar / FC scale and behave more like LA family farms.

**Realistic FL SAM after all filters: ~30–60 farms**, contingent on either an SCGC group deal or one-by-one outbound to independents. **Florida is not a self-serve geography.**

### 2.5 SAM revenue math

Combining LA + FL SAM:

| Scenario | LA SAM | FL SAM | Total | × $1,500/yr | × $3/ac (avg ~800 ac/farm) |
|---|---|---|---|---|---|
| Low | 150 | 30 | 180 | **$270,000** | ~$432,000 |
| Base | 180 | 45 | 225 | **$337,500** | ~$540,000 |
| High | 210 | 60 | 270 | **$405,000** | ~$648,000 |

**SAM ARR estimate: $270k–$650k** depending on pricing model.

The per-acre column assumes an average of ~800 ac/eligible-farm (skewed by the medium-large farms that pass the size filter). Per-acre pricing pulls in materially more revenue if you can land farms ≥1,500 ac.

---

## 3. SOM (Serviceable Obtainable Market — 3-year capture)

SOM is the slice of SAM Headland realistically signs in 3 years given the founder's actual constraints: **part-time** (Operations Supervisor at PSC Group is the W2 day job), **solo go-to-market**, no sales hire, but with **deep South Louisiana network** (the founder is a Louisianian and his father-in-law grows cane).

Capture-rate assumptions are calibrated against ag-SaaS reality: even with a perfect product and zero competition, getting a farmer to swap from paper to a paid tool takes 18–24 months from first conversation in many cases. Word of mouth is the dominant channel in cane country.

### 3.1 Year-by-year scenarios

#### Year 1 (May 2026 – May 2027)
**Activity:** finish MVP, land 1–2 design-partner farms (probably starting with father-in-law's farm + one referral), build 3–5 parish-level SEO landing pages targeting "sugarcane field mapping Iberia Parish", "sugarcane records app Louisiana", etc., publish 1–2 case studies once the design partners have data.

**Constraint:** the founder's day job + Strykora client work caps Headland's weekly hours.

| Scenario | Paying farms end Y1 | Notes |
|---|---|---|
| Low | 2 | Just the design partners convert to paid |
| Base | 5 | Design partners + 3 word-of-mouth referrals |
| High | 10 | Design partners + viral moment in one parish |

#### Year 2 (May 2027 – May 2028)
**Activity:** outbound (cold email + door-knock at parish ag co-op meetings + a booth at the LSU AgCenter sugarcane field day), 1 case study live, Headland is mentioned by name in at least one ASCL or LSU AgCenter context.

| Scenario | Paying farms end Y2 | Notes |
|---|---|---|
| Low | 8 | Slow grind |
| Base | 25 | Compounding word of mouth + one good co-op contact |
| High | 50 | Channel partnership with one mill or co-op |

#### Year 3 (May 2028 – May 2029)
**Activity:** brand recognition in the LA cane belt, possible FL push (likely via SCGC outreach), a part-time sales contractor or a virtual SDR, Headland is a "yeah, I've heard of those guys" name at the bar at the AmTech / ASSCT meeting.

| Scenario | Paying farms end Y3 | Notes |
|---|---|---|
| Low | 20 | Day-job constraints continue, no co-op deal |
| Base | 60–80 | LA word of mouth compounds; SCGC pilot lands |
| High | 120 | Co-op channel deal + first FL independents |

### 3.2 ARR scenarios at $1,500/farm/yr (flat fee)

| End of year | Low | Base | High |
|---|---|---|---|
| Y1 | $3,000 | $7,500 | $15,000 |
| Y2 | $12,000 | $37,500 | $75,000 |
| Y3 | **$30,000** | **$90,000–$120,000** | **$180,000** |

### 3.3 ARR scenarios at $3/ac/yr (per-acre)

Assumes an average paying-farm size of ~750 ac (smaller farms self-select out at this price; median LA cane farm in size-eligible bucket is ~750 ac).

| End of year | Low | Base | High |
|---|---|---|---|
| Y1 | $4,500 | $11,250 | $22,500 |
| Y2 | $18,000 | $56,250 | $112,500 |
| Y3 | **$45,000** | **$135,000–$180,000** | **$270,000** |

### 3.4 Hybrid pricing (likely the realistic plan)

Most ag-SaaS that wins this market segment uses a **tiered hybrid**:

- **Starter:** $99/mo flat ($1,188/yr) for farms <500 ac
- **Pro:** $3/ac/yr with a $2,000/yr minimum for farms 500–2,500 ac
- **Enterprise:** custom, $1.50–$2/ac/yr for farms >2,500 ac (volume discount)

Under this hybrid pricing, the **base-case Year 3 SOM is $90k–$150k ARR**, with ~70 paying farms across LA + a handful of FL independents.

### 3.5 What could push it past $250k ARR

Three discrete catalysts, each independently plausible:

1. **A mill or co-op channel deal.** If LASUCA, Cajun Sugar Co-op, or M.A. Patout (Patout owns Sterling, Raceland, and Enterprise Factory mills) bundles Headland into their grower-services package, the funnel widens 5–10x overnight. This is one phone call away — the founder's father-in-law network and the small number of mill operators (11 in LA) make this concrete, not aspirational. Probability of landing one such deal in 3 years: ~25–35%.
2. **An SCGC pilot.** SCGC's 45 grower-owners are the closest thing to a tractable FL beachhead. A successful pilot could produce $50k+ ARR from FL alone.
3. **An adjacent crop bolt-on.** South Louisiana rice growers (~400k acres, similar grower demographic, often the same families) are an obvious adjacency. Adding rice doubles the addressable LA acreage with marginal product work, since the records data model overlaps significantly.

### 3.6 SOM summary table

End-of-Year-3 ARR, base case, all assumptions explicit:

| Pricing model | Paying farms | Avg revenue/farm | ARR |
|---|---|---|---|
| Flat $1,500 | 60 | $1,500 | **$90,000** |
| Per-acre $3 | 60 | ~$2,250 | **$135,000** |
| Hybrid (tiered) | 60 | ~$2,000 | **$120,000** |

This is the number to plan against: **~$120k ARR by end of Year 3, base case, ~60 paying LA family farms.**

---

## 4. Pricing benchmarks

Direct, current published pricing for ag SaaS is famously opaque — most platforms gate quotes behind a sales conversation. The numbers below are what I have grounded knowledge for as of training-cutoff and what's commonly cited in trade press / G2 / Capterra reviews. **Where a number is anecdotal or a range, I flag it.** This table needs a fresh web pass before any external use.

| Platform | Target market | Typical pricing | Notes |
|---|---|---|---|
| **farmmind.org** | Sugarcane (direct competitor) | **Not publicly disclosed.** Likely freemium or low-end paid (sub-$1,000/yr/farm) based on company stage. | Verify via direct outreach or pricing page; this is the highest-priority gap in this doc. |
| **Climate FieldView (Bayer)** | Row crops (corn, soy, cotton) | Free tier (FieldView Plus) + Premium tier historically ~**$99–$999/yr** depending on add-ons; "Drive" hardware ~$599 one-time. Per-acre add-ons (e.g., FieldView Cab + analytics bundle) can run **$1–$3/ac/yr** for premium features. | Pricing has shifted multiple times; Bayer often bundles with seed purchases. |
| **Granular (Corteva)** | Mid-large row crop / progressive farms | Quote-based; commonly cited **$1–$3/ac/yr** for Granular Insights; **$3–$6/ac/yr** for Granular Business (full ERP-style). Minimums apply. | Higher-touch sales; not self-serve. |
| **Trimble Ag (Farmer Pro / Connected Farm)** | Trimble hardware customers | Bundle with hardware; software-only **~$300–$1,500/yr/farm** depending on tier; per-acre options exist for larger farms. | Lock-in is the GPS hardware, not the software. |
| **AgWorld** | Mid-large mixed farms (strong AU/NZ presence) | Quote-based; commonly cited **$2–$5/ac/yr**, with farm minimums. | Strong record-keeping reputation. |
| **OneSoil** | Free satellite NDVI / field viewer | Free for the consumer app; Pro tier **~$1–$2/ac/yr** when sold. | Mostly used as a free supplement, not a primary tool. |
| **AgriWebb** | Livestock + mixed; AU origin | Per-property tiers, commonly **$30–$150/mo** ($360–$1,800/yr) for small/mid; per-head pricing for large livestock. | Less relevant to cane (livestock-heavy product). |
| **Solinftec** | Brazil sugarcane (big incumbent) | Enterprise / per-fleet; not self-serve. Likely **>$10,000/yr** per operation given scale. | Direct reference for cane; pricing is not transparent. |
| **FarmLogs** (now part of Bushel) | Row crops; freemium historically | Free + Pro **$249–$499/yr/farm** historically. Repositioned post-acquisition. | Useful as a "how cheap can it go" floor. |
| **Cropster** | Coffee processing (not field) | Not a relevant comp for field mapping — included only because the user mentioned it; Cropster is a roastery/QC tool, not field SaaS. | Disregard for field-mapping benchmarking. |

### Pricing read

The defensible price band for a sugarcane-specific records + mapping SaaS, against the comp set above, is:

- **Floor:** $99/mo ($1,188/yr) flat starter — competitive with FarmLogs and FieldView Premium
- **Sweet spot:** $1,500–$3,000/yr/farm OR $2–$3/ac/yr with $1,500–$2,000 minimum — within Granular Insights / AgWorld range
- **Ceiling for SaaS self-serve:** $5,000/yr/farm — above this you need a sales rep

**Headland's positioning:** mid-tier, **$1,500–$3,000/yr** as a starting anchor, with per-acre overage pricing for farms >1,500 ac. This matches the willingness-to-pay implied by sugarcane's $1,800–$2,200/ac gross revenue (per LSU AgCenter enterprise budgets in the domain doc) — a $3/ac/yr tool is ~0.15% of gross. That's an easy "yes" on math; the hard part is the buying motion, not the price.

---

## 5. Headwinds and tailwinds

### 5.1 Headwinds

- **Average operator age (~58).** The decision-maker on most cane farms grew up on paper and is not in a hurry to change. Software adoption requires either a younger family member to drive it or a clear, painful, episodic event (e.g., a botched FSA report, a crop insurance dispute) that creates urgency.
- **Florida is a corporate market, not a SaaS market.** US Sugar, Florida Crystals, and (to a lesser extent) SCGC are the gatekeepers; they have internal IT and will not buy a $3/ac SaaS off a website. Any FL revenue is going to be a 6–12 month enterprise sale.
- **FSA already has the GIS data.** Every grower's field boundaries are already digitized at the FSA county office for compliance reporting (FSA-578). Many growers feel "the government already has my map" and don't see why they need their own. This is a genuine objection that requires a clear answer (the FSA map is for compliance only; growers can't easily get it back, query it, or layer scouting/operations data on it).
- **Trimble lock-in on guidance/hardware.** Farms with Trimble GPS displays in their tractors and harvesters already have field boundaries living in the Trimble cloud. Migrating off is friction.
- **Long sales cycle / grinding-season blackout.** Cane harvest runs September–January in LA and October–May in FL. A grower will not adopt new software during grinding. Practical selling windows are **February–August in LA**, narrower in FL. That cuts the year roughly in half.
- **Trust deficit on data.** Cane farmers are skeptical of any software that asks for yield data or mill ticket info — there's a cultural assumption that competitors or the mill itself could see it. Headland needs an explicit, simple data-privacy story.
- **Niche TAM.** As shown above, the absolute ceiling at 100% capture is $1–5M ARR. There is no "we'll figure out scale later" — scale requires geographic or crop expansion, not deeper US cane penetration.

### 5.2 Tailwinds

- **High per-acre revenue.** Cane is a high-value crop ($1,800–$2,200/ac gross — see domain doc §7). A $3/ac/yr software bill is 0.15% of revenue. This price-to-value math beats almost every other US row crop (corn at $400–$600/ac gross can't comfortably absorb $3/ac of software).
- **Generational succession is happening now.** Many LA cane farms are passing from boomers to millennials/Gen-X right now. The next-gen operator is far more receptive to SaaS, often pushing the older generation. Headland is timing this transition correctly.
- **FSA-578 reporting is annual, painful, and improvable.** Anything that exports a clean, accurate acreage map (planted vs. failed, by variety, by stubble year) directly into the FSA-578 format is **immediate, concrete value**. This is the single best wedge feature for Louisiana.
- **Mill-level concentration is a channel asset, not just a competitive risk.** With 11 LA mills and 4 FL mills, there are <20 entities that, if they bundle Headland into grower services, can deliver thousands of farms in one decision. A single co-op deal (e.g., LASUCA, Cajun Sugar, M.A. Patout's three mills) is potentially transformative.
- **Mapbox + NDVI on a phone is genuinely differentiating.** Cane farmers are still mostly running clipboard records. The product gap between paper and "satellite imagery + scouting pins on an iPad" is huge — the experience speaks for itself in a 5-minute demo.
- **The user's distribution edge is real and rare.** A Louisianian founder with a father-in-law in cane has access that out-of-state ag-tech founders simply don't have. South Louisiana ag is a referral economy; a cousin's introduction is worth more than a Google ad.
- **Regulatory and insurance pressure rising.** Crop insurance APH calculations, sugar program compliance, and increasing pesticide-record audits all push toward better digital records. Pain is growing, not shrinking.
- **Hurricane and freeze events generate urgency.** Hurricane Francine (Sept 2024) and Hurricane Ida (2021) lodged significant LA cane. Growers who lost records during a disaster are receptive to a backup digital system. Disaster events create concentrated buying windows.
- **Adjacent crops are right there.** South Louisiana rice growers, Acadia/Vermilion/Jeff Davis Parish in particular, share the demographic and the records pain. Same platform, second crop, doubles the LA acreage opportunity.

---

## 6. The honest pitch

Headland in 3 years, written without a marketing voice:

> **At realistic capture rates, Headland is a $90k–$180k ARR specialty-SaaS business by end of Year 3, built on roughly 60–120 paying Louisiana family cane farms at $1,500–$2,500 each.** That's a real, durable, founder-owned business with high gross margin and very low customer-acquisition cost (referral-driven), but it is not a venture-scale SaaS. Florida is structurally a corporate-sales motion, not a SaaS motion — touching it meaningfully requires either an SCGC pilot (~$50k incremental ARR if it lands) or a custom enterprise deal with US Sugar / Florida Crystals (~$100k+ if it lands, but with a 12-month sales cycle and meaningful product customization). Pushing past $300k ARR realistically requires (a) a mill or co-op channel partnership in LA — concrete and tractable, ~25–35% probability across 3 years given the founder's network, or (b) bolting on rice as a second crop, doubling the addressable LA acreage with marginal product investment. Pushing past $1M ARR requires either expansion to Mexico/Caribbean cane or a meaningful corporate sale; neither is a Year-3 outcome from a part-time solo founder. **Bottom line: as a cash-flowing $100–200k ARR business that funds the founder's life and proves out the platform for a future adjacency play, Headland works. As a "cane SaaS goes to $10M ARR" story, it doesn't pencil — and that's the most important thing to be honest about up front.**

---

## 7. Sources

### Census of Agriculture & farm counts
- USDA NASS — Census of Agriculture 2022 (full report): https://www.nass.usda.gov/Publications/AgCensus/2022/
- USDA NASS — Louisiana Crop Production Annual 2024: https://data.nass.usda.gov/Statistics_by_State/Louisiana/Publications/Crop_Releases/Annual_Summary/2024/laannsum24.pdf
- USDA NASS — Crop Production Sept 2024 (LA): https://www.nass.usda.gov/Statistics_by_State/Louisiana/Publications/Crop_Releases/Crop_Production_Monthly/2024/lacropsep24.pdf

### Industry orgs (grower count + mill rosters)
- American Sugar Cane League — Industry Info: https://www.amscl.org/industry-info/
- ASCL — Louisiana sugarcane sets new milestones in 2024: https://www.amscl.org/louisiana-sugarcane-sets-new-milestones-in-2024-fueled-by-innovation-and-research/
- Sugar Growers and Refiners of Louisiana (SUGAR): https://sugarlouisiana.com/
- Sugar Cane Growers Cooperative of Florida (SCGC): https://www.scgc.org/
- Florida Sugar Cane League: https://flsugar.com/ (also referenced via ASCL)
- US Sugar (corporate): https://www.ussugar.com/
- Florida Crystals: https://www.floridacrystalscorp.com/

### Acreage and per-acre economics
- USDA ERS — Sugar and Sweeteners Outlook July 2025: https://ers.usda.gov/sites/default/files/_laserfiche/outlooks/112958/SSS-M-443.pdf
- USDA ERS — Sugar and Sweeteners Policy: https://www.ers.usda.gov/topics/crops/sugar-and-sweeteners/policy
- LSU AgCenter — Sugarcane Enterprise Budgets 2024: https://www.lsuagcenter.com/articles/page1704052909510
- LSU AgCenter — Sugarcane Farm Costs and Returns Model 2024: https://www.lsuagcenter.com/articles/page1704053056348
- Southern Ag Today — Sugarcane and Sugarbeet Production Costs: https://southernagtoday.org/2023/12/11/examining-sugarcane-and-sugarbeet-production-costs/

### Competitor pricing (to be re-verified with fresh web research)
- farmmind.org — direct competitor; pricing page not publicly indexed in this doc — flagged as research gap
- Climate FieldView: https://climate.com/
- Granular: https://granular.ag/
- Trimble Ag: https://agriculture.trimble.com/
- AgWorld: https://www.agworld.com/
- OneSoil: https://onesoil.ai/
- AgriWebb: https://www.agriwebb.com/
- Solinftec: https://solinftec.com/
- Bushel/FarmLogs: https://bushelfarm.com/

### Crop insurance and FSA reporting (regulatory tailwind context)
- USDA RMA — Sugarcane Crop Provisions 2025: https://old.rma.usda.gov/-/media/RMA/Policies/Sugar-Cane/2025/Sugarcane-Crop-Provisions-25-0038.ashx
- USDA FSA — Crop Acreage Reporting fact sheet: https://www.fsa.usda.gov/sites/default/files/documents/fsa_cropacreagereporting_factsheet_24.pdf
- Farmers.gov — Crop Acreage Reports: https://www.farmers.gov/working-with-us/crop-acreage-reports

### Adjacent-crop expansion references
- USDA NASS — Rice acreage by state: https://www.nass.usda.gov/Statistics_by_Subject/?sector=CROPS
- LSU AgCenter — Rice production: https://www.lsuagcenter.com/topics/crops/rice
- USDA ERS — Sugar beet acreage (sugar program): https://www.ers.usda.gov/topics/crops/sugar-and-sweeteners/

### Companion internal doc
- `~/Documents/headland/docs/sugarcane-domain.md` — full geography, mill rosters, varieties, crop cycle, records, pests/diseases, economics. The grounded source for every farm-count and acreage figure cited in this market-sizing doc.

---

**Research gaps for next pass (when WebSearch / WebFetch are available):**
1. Verify exact 2022 Census of Agriculture sugarcane farm-count tabulations by state and size bucket.
2. Pull farmmind.org's actual pricing page or a direct quote.
3. Pull current Climate FieldView, Granular, AgWorld pricing pages (these change frequently).
4. Find a published USDA NASS size-distribution histogram for LA cane farms specifically (not just averages).
5. Confirm SCGC's grower-owner count (45 vs. recent reports).
6. Check whether any LA mill or co-op has already partnered with a software vendor (would tighten or invalidate the channel-partnership thesis).
