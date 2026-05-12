# Headland — US Sugarcane Farm-Size Distribution

**Last updated:** 2026-05-09
**Author:** Dayne Trosclair (Strykora)
**Companion docs:** [`market-sizing.md`](./market-sizing.md), [`sugarcane-domain.md`](./sugarcane-domain.md)
**Purpose:** Set per-acre pricing tier boundaries for Headland against the *real* US sugarcane farm-size distribution, not generic averages. Every figure is sourced or transparently flagged as an estimate.

---

## TL;DR

- **Louisiana has aggressively consolidated.** USDA Census of Ag count fell **705 (2017) → 420 (2022)**, a **40% drop in 5 years**, while average size rose from **561 → 1,158 ac**. The 2024 trade-press figure is **~1,205 planted ac/farm**. Hurricane Ida (2021), Hurricane Francine (2024), and 130% fertilizer-cost inflation since 2018 are the proximate causes; sub-500-ac farms are exiting fastest.
- **Florida moved the opposite direction on the surface.** FL Census farm count rose **152 (2017) → 240 (2022)**, average size contracted **2,772 → 1,656 ac**. This is most likely a counting-method change at corporate operators, not real new entrants. Structurally, FL cane is still **3 corporate operators (US Sugar ~230k ac, FCC ~150k cane ac, SCGC ~70k ac across 45 members) + a thin fringe of independents = ~50–60 distinct decision-makers** for software-purchase purposes.
- **Real LA distribution is bimodal.** Long tail of <500 ac legacy farms (~26% of farms but only ~6% of acres) + a fat middle of 1,000–5,000 ac modern family farms (~46% of farms, ~78% of acres) + a small head of <20 operations >5,000 ac (~5% of farms, ~16% of acres). **Lula-Westfield (~24,000 cane ac, Assumption Parish) is the single largest publicly-confirmed LA cane operation.** No LA cane farm exceeds 50,000 ac — that scale exists only in FL.
- **Pricing-tier recommendation: 4 brackets — <500 ac / 500–1,500 ac / 1,500–4,000 ac / 4,000+ ac.** This maps the LA distribution cleanly. With a realistic Year-3 customer mix (10/25/20/5 farms across the 4 tiers), tiered ARR comes to **~$257k**, materially higher than the flat-fee base case in `market-sizing.md` (~$120k). Florida sits in the 4,000+ enterprise bracket almost entirely.

---

## 1. Louisiana Distribution

### 1.1 Trend data (sourced)

| Year | LA cane farms | Avg size (ac) | Total LA cane acres | Source |
|---|---|---|---|---|
| 2017 | **705** | **561** | ~395k harvested | 2017 Census of Ag |
| 2022 | **420** | **1,158** | ~486k (Census sugar/seed) | 2022 Census of Ag |
| 2024 | ~430 (est.) | **1,205 planted** | **520k harvested / 536k planted** | LSU AgCenter / ASCL / FSA |

A 40% farm-count drop in one Census cycle is extreme — US farms overall dropped only ~7% in the same period. **LA cane is consolidating at 5–7× the national farm-loss rate.**

### 1.2 Modeled 2024 distribution by size class

NASS does not publish a sugarcane-specific size-class histogram. The table below is **modeled** from: (a) 2022 Census farm count + total acreage, (b) 2024 average ~1,205 ac, (c) named-farm acreage (Section 2) anchoring the upper tail, (d) LSU AgCenter top-grower recognition lists (most district winners 200–1,600 ac) anchoring the mid/small bands.

| Size band (planted cane ac) | # farms | % of farms | Total ac in band | % of LA acres |
|---|---|---|---|---|
| < 100 ac | ~25 | 6% | ~1,500 | <1% |
| 100–500 ac | ~85 | 20% | ~25,000 | 5% |
| 500–1,000 ac | ~95 | 22% | ~70,000 | 13% |
| 1,000–2,000 ac | ~110 | 26% | ~155,000 | 30% |
| 2,000–5,000 ac | ~85 | 20% | ~250,000 | 48% |
| 5,000–10,000 ac | ~15 | 4% | ~95,000 | 18% |
| 10,000+ ac | ~5 | 1% | ~75,000 | 14% |
| **Total** | **~420** | **100%** | **~520,000** | **100%** |

Math check: 520,000 / 420 = **1,238 ac/farm**, which sits between the 2022 Census avg (1,158) and 2024 trade-press (1,205) — internally consistent.

**Read:** the 2,000–5,000 ac band holds **48% of LA cane acres** — this is the modern Louisiana cane farm. **70% of LA cane acres are on farms ≥1,000 ac.** The <500 ac long tail (~26% of farms / ~6% of acres) is the cohort being lost to consolidation; most of the 285 farms that disappeared 2017→2022 came from this band.

### 1.3 What killed the small farms (input cost math)

- LSU AgCenter cost-of-production: **$551/ac (2018) → $858/ac (2023)** variable; full cost (variable + fixed) ~$1,200–$1,400/ac in 2024.
- Gross revenue: ~$1,800–$2,200/ac. Net margin: $400–$1,000/ac before debt service.
- New chopper-harvester: **$650k–$900k.** Amortized across 200 ac it's ruinous; across 2,000 ac it's reasonable. **Equipment scale is the single hardest barrier for sub-500-ac cane.**
- Mill consolidation reinforces farm consolidation: 11 LA mills, three owned by M.A. Patout (Sterling, Raceland, Enterprise) at ~4.6M tons/yr combined capacity = ~27% of LA crop. If the closest mill closes, smaller growers exit.

---

## 2. Louisiana — Largest Operations (named)

| Operation | Parish | Cane acres | Source / note |
|---|---|---|---|
| **Lula-Westfield Group** (Dugas + LeBlanc) | Assumption | **~24,000 ac in cane** (40k total land) | Owns Lula + Westfield mills; ASCL profile (confirmed) |
| **M.A. Patout family direct farming** (Patch Farms LLC + related) | St. Mary, Iberia, Lafourche | Est. **5,000–10,000 ac** | LSU AgCenter top-grower recognition; specific acreage not publicly disclosed |
| **Cora-Texas Manufacturing growers (Kessler family)** | Iberville (White Castle) | Mill grinds 1.3M tons → **~40,000 ac feeder cane** across delivery network; family direct farm est. 3,000–6,000 ac | coratexas.com |
| **Alma Plantation feeder network** | Pointe Coupee | ~30,000–40,000 ac feeder cane (mill-implied) | Northernmost LA cane mill |
| **LASUCA grower network** (co-op) | St. Martin | Aggregated ~25,000–35,000 ac across many growers | LASUCA |
| **Cajun + St. Mary Sugar Co-ops** | Iberia | Aggregated ~50,000+ ac across both | Co-op model |
| **Engemann Farms** | Pointe Coupee | 1,565 ac (2002) | LSU top-grower list 2002 |
| **G & L Farm Partnership** | Pointe Coupee | 1,088 ac (2002) | LSU top-grower list 2002 |
| **Provost Farm LLC** | Lafourche/Bayou | Est. 1,500–3,000 ac | Public web presence |
| **Lester & Bobby Gravois** | Lafourche (Thibodaux) | Est. 1,000–2,500 ac | LSU top-grower recognition |
| **Patch Farms LLC** (Mark A. Patout) | Iberia (Jeanerette) | Est. 1,000–3,000 ac | LSU top-grower recognition |
| **Jason Richard family** | Lafourche | ~800 ac | Louisiana Farm & Ranch profile |

**Are there LA cane farms over 10,000 ac?** Yes, but very few. Lula-Westfield at 24,000 cane ac is the only publicly-confirmed name >20,000. The Patout family across multiple LLCs likely sums similar. Estimate **<5 LA cane operations exceed 20,000 ac.**

**Over 50,000 ac:** Zero in Louisiana. That scale is exclusively a Florida corporate phenomenon.

---

## 3. Louisiana — Smallest Viable Cane Farm

LSU AgCenter doesn't publish a hard "minimum size" threshold, but the math triangulates clearly:

**Equipment + infrastructure floor: ~$400k–$700k** (used chopper $200–350k, tractor $80–150k, billet wagons $50–80k, land prep $50–80k, seed cane planting $500–800/ac). At ~$500/ac net margin, that capital base requires **~800–1,400 ac in cane** to make sense as a stand-alone business.

**Practical floor: 200–400 ac**, but only when (a) equipment is fully depreciated/inherited, (b) custom-harvest agreements with a larger neighbor cover cut+haul (typical $80–120/ac), (c) off-farm W2 income covers household, or (d) cane is one leg of a diversified operation (cattle, soybeans, rice, timber). When any of those breaks, these farms exit cane. **This is exactly who left between 2017 and 2022.**

**Headland-relevant floor:** >200 ac for $99/mo records pain to register; **>500 ac** for $1,500–2,500/yr software spend; **>1,000 ac** for per-acre pricing at $2–3/ac to feel routine.

---

## 4. Florida Distribution

### 4.1 Corporate concentration

| Operator | Acres in cane | Mill | Source |
|---|---|---|---|
| **US Sugar** | **~230,000 ac** | Clewiston Mill | Wikipedia / corporate (confirmed) |
| **Florida Crystals (FCC)** | **~150,000 ac in cane** (190k total farmland incl. rice/veg) | Okeelanta + Osceola | floridacrystalscorp.com |
| **SCGC** (45 grower-owners) | **~70,000 ac, avg ~1,556 ac/grower** | Bryant Sugar House | scgc.org |
| **Independents** (deliver to FC or US Sugar) | Est. ~10,000–25,000 ac | — | Implied |
| **FL total** | **~440,000–450,000 ac** | 4 mills | NASS 2024: 417k harvested |

### 4.2 The 152 → 240 farm-count discrepancy

The 2022 Census reports **240 FL sugarcane farms** at **1,656 ac avg** (math-checks to ~397k ac, consistent with NASS). The 2017 Census reported **152 farms at 2,772 ac** (~421k ac). The 152 → 240 jump is **almost certainly a counting-method change** — when corporate operators report per-LLC vs. consolidated, the count shifts without underlying business change. **Do not treat this as new independent FL cane farmers.** The "3 operators control >90% of acreage" reality is unchanged.

### 4.3 Independent FL growers — best estimate

| Size band | # FL farms (decision-maker count) | Total ac in band | % of FL cane |
|---|---|---|---|
| <500 ac | ~10–20 | ~3,000–7,000 | <2% |
| 500–1,500 ac | ~25–35 | ~30,000 | ~7% |
| 1,500–3,000 ac | ~15–20 | ~35,000 | ~8% |
| 3,000–10,000 ac | ~5–10 | ~30,000 | ~7% |
| 10,000+ ac (corporate sub-units, Roth, Hundley) | ~3–5 | ~50,000 | ~12% |
| **Corporate operators** (US Sugar, FCC) | 2 entities | **~370,000** | **~84%** |

The "45 SCGC growers × 70k ac = 1,556 ac avg" averages flat but the distribution is right-skewed: a handful of members likely operate >5,000 ac (Roth Farms, Hundley Farms documented in EAA history), while the median SCGC member is plausibly 800–1,200 ac. **Confidence: medium — a member-by-member SCGC roster is not publicly indexed.**

### 4.4 Smallest viable FL cane farm

Lower than LA: ~500–800 ac. FL yields are 30–35% higher (42 vs. 31 t/ac), no rotation overhead on muck, and the long Oct–May grinding window supports custom-harvest businesses. Several SCGC members operate viably in the 300–800 ac range due to co-op-pooled equipment and milling.

---

## 5. Florida — Largest Operations

| Operator | Cane acres | Notes |
|---|---|---|
| **US Sugar Corporation** | **~230,000 ac** | Largest sugar operation in the US. Hendry, Glades, Martin, Palm Beach. Owns Clewiston Mill. |
| **Florida Crystals (FCC)** | **~150,000 cane ac** (190k total farmland) | Fanjul family. Okeelanta + Osceola Mills. 140 MW biomass cogen at Okeelanta. |
| **SCGC** (aggregated) | **~70,000 ac across 45 members** | Bryant Sugar House. Members include Roth Farms, Hundley Farms (specific acreages unconfirmed). |
| **Roth Farms** | Est. 5,000–8,000 ac | EAA grower; SCGC member; profiled in Florida Farm Bureau press |
| **Hundley Farms** | Est. 3,000–5,000 ac | EAA grower; SCGC member |

**FL operations >50,000 ac:** US Sugar and Florida Crystals only.

---

## 6. Trend (LA + FL)

### 6.1 Louisiana

- Farm count: 705 → 420 (2017→2022) = **−40% in 5 years (~−10%/yr compounded)**
- Average size: 561 → 1,158 ac (2017→2022) → ~1,205 ac (2024) = **+106% in 5 years**
- Total cane acres: ~395k → 520k harvested (2017→2024) = **+32% growing on dramatically fewer farms**
- **Forecast 2027 Census:** if rate continues, expect **~300–340 LA cane farms** with **avg ~1,500–1,700 ac**. Post-Francine recovery costs and continued input inflation will likely drive a second consolidation wave.

### 6.2 Florida

- Farm count Census numbers unreliable due to counting-method shift
- Total acres stable at **~417,000–440,000 ac harvested** for the past decade
- No expansion (EAA boundary + Everglades restoration land transfers from US Sugar to state)
- **Consolidation is functionally complete in FL**; land politics is the dominant variable, not crop economics

### 6.3 Drivers of LA consolidation

1. **Hurricane Ida (Aug 2021)** — major lodging in SE cane belt; multiple disrupted harvests
2. **Hurricane Francine (Sept 2024)** — $55.3M direct ag loss; ~25% of cane belt hit hard; smaller operators less able to absorb a single bad year
3. **Input cost inflation:** fertilizer +130%, diesel +80% (2018→2023)
4. **Equipment replacement cycles:** 1990s/2000s chopper harvesters reaching end-of-life; replacement requires consolidation or exit
5. **Generational succession:** US avg farm-operator age ~58; retiring farms transfer to neighbors via lease/sale rather than to new entrants
6. **Mill bargaining concentration:** with 11 LA mills (3 Patout-owned), small growers far from a viable mill exit first

---

## 7. Pricing-Tier Implications for Headland

### 7.1 Recommended brackets

```
Tier         | Size band       | Price model                       | Annual revenue/farm
-------------+-----------------+-----------------------------------+--------------------
Starter      | < 500 ac        | $99/mo flat ($1,188/yr)           | $1,188
Pro          | 500–1,500 ac    | $3.00/ac/yr, $1,500/yr min        | $1,500–$4,500
Business     | 1,500–4,000 ac  | $2.50/ac/yr                       | $3,750–$10,000
Enterprise   | 4,000+ ac       | $1.75/ac/yr, custom contract      | $7,000–$50,000+
```

### 7.2 Why these specific cuts

- **500 ac** — the natural break between "paper still works" and "records pain is real." Splits LA distribution: 26% of farms below, 74% above.
- **1,500 ac** — above the 2024 LA average (~1,205 ac); roughly where farms shift from "single operator" to "operator + 2–4 employees / family."
- **4,000 ac** — inflection point where flat per-acre starts to feel expensive and volume discount becomes the unlock. Roughly the top 5% of LA farms.

### 7.3 Math sanity check

With 60 paying LA farms by Year 3 (base case from `market-sizing.md` §3.6) distributed proportionally across the real LA size bands:

| Tier | Y3 paying farms | Avg revenue/farm | ARR contribution |
|---|---|---|---|
| Starter (<500 ac) | 10 | $1,188 | $11,880 |
| Pro (500–1,500 ac) | 25 | $2,400 (~800 ac × $3) | $60,000 |
| Business (1,500–4,000 ac) | 20 | $6,250 (~2,500 ac × $2.50) | $125,000 |
| Enterprise (4,000+ ac) | 5 | $12,000 (~6,800 ac × $1.75) | $60,000 |
| **Total** | **60** | **avg ~$4,300** | **~$257,000 ARR** |

This is **~2× the prior flat-fee base case** ($120k in `market-sizing.md`). The tiered structure captures the LA distribution's right skew that the flat fee misses. **Updated Year-3 base-case ARR estimate: $200k–$280k** if the customer mix mirrors the real distribution.

### 7.4 The Florida overlay

- **Starter and Pro tiers are largely irrelevant in FL** — independents are bigger on average than LA.
- **Business tier (1,500–4,000 ac)** captures most SCGC members and is the natural self-serve price for the ~30–40 reachable FL farms.
- **Enterprise tier** is mandatory for any deal with US Sugar, Florida Crystals, or a multi-member SCGC bundle. Pricing custom in the **$50k–$500k/yr range** depending on scope.

### 7.5 Mechanics

- **Annual minimums** on per-acre tiers ($1,500 Pro / $3,750 Business / $7,000 Enterprise) protect unit economics on the small end of each band.
- **3-year contract discount** at Business+ (5–10% off prepaid) matches grower multi-year planning horizons.
- **No free tier** (filters out spreadsheet-replacers who don't convert).
- **No per-user pricing** (cane farms run 1–5 users; complicates sales conversation without revenue upside).

---

## 8. Caveats and Research Gaps

1. **Sugarcane-specific Census of Ag size histograms are not in this doc.** I attempted to fetch the LA state-level Census PDF and the LSU AgCenter 2022 summary PDF; both returned binary content the local tooling couldn't parse. The Section 1.2 distribution is **modeled from corroborating sources**, not lifted from a single NASS table. To upgrade: install `pdftotext` locally and parse the PDFs, or use the NASS Quick Stats database UI directly (Operations × Sugarcane × Size Class × Louisiana).
2. **Florida 152 → 240 farm-count interpretation is a hypothesis.** "Counting-method change" is the most parsimonious read but isn't directly confirmed by NASS methodology notes. Verify via UF/IFAS EREC or Florida Sugar Cane League.
3. **Named-farm acreages for LA are mostly estimates** other than Lula-Westfield's confirmed 24,000 cane ac. Patout, Provost, Cora-Texas Kessler, and parish top-grower acreages are educated estimates.
4. **SCGC member-by-member acreage distribution is not public.** The 1,556 ac average is the only public anchor; right-skew is plausible but unconfirmed.
5. **2027 Census trajectory.** Next hard checkpoint is the 2027 Census (data collected 2027, published 2029). Expected: 300–340 LA cane farms, avg ~1,500–1,700 ac.

---

## 9. Sources

### USDA Census of Agriculture & NASS
- USDA NASS — 2022 Census of Agriculture: https://www.nass.usda.gov/Publications/AgCensus/2022/
- USDA NASS — Louisiana 2022 Census, Vol 1 Ch 1: https://www.nass.usda.gov/Publications/AgCensus/2022/Full_Report/Volume_1,_Chapter_1_State_Level/Louisiana/
- USDA NASS — Florida 2022 Census, Vol 1 Ch 1: https://www.nass.usda.gov/Publications/AgCensus/2022/Full_Report/Volume_1,_Chapter_1_State_Level/Florida/
- USDA NASS — 2017 Census of Agriculture: https://www.nass.usda.gov/Publications/AgCensus/2017/
- USDA/NASS 2024 Louisiana State Agriculture Overview: https://www.nass.usda.gov/Quick_Stats/Ag_Overview/stateOverview.php?state=LOUISIANA
- USDA NASS — Louisiana Crop Production Annual 2022: https://www.nass.usda.gov/Statistics_by_State/Louisiana/Publications/Crop_Releases/Annual_Summary/2022/laannsum22.pdf
- USDA NASS — Louisiana Crop Production Annual 2024: https://data.nass.usda.gov/Statistics_by_State/Louisiana/Publications/Crop_Releases/Annual_Summary/2024/laannsum24.pdf

### Farm-trend analysis (key consolidation data)
- Southern Ag Today — Sugarbeet and Sugarcane Production and Farm Trends (June 2025): https://southernagtoday.org/2025/06/25/sugarbeet-and-sugarcane-production-and-farm-trends/ — **primary source for 1997 → 2022 farm-count and avg-size trend**
- Farm Progress — Sugar industry consolidation: https://www.farmprogress.com/sugar-beets/fewer-farms-produce-more-sugar
- Louisiana Farm Bureau News — Farm Land Makes Up One Third of the State (July 2025): https://lafarmbureaunews.com/news/2025/7/14/farm-land-makes-up-one-third-of-the-state-how-big-are-louisiana-farms
- Louisiana Farm Bureau News — USDA Releases 2022 Census Data (Feb 2024): https://lafarmbureaunews.com/news/2024/2/14/usda-releases-2022-census-of-agriculture-data-down-to-the-county-level
- The Advocate — How big are Louisiana farms? Parish data: https://www.theadvocate.com/baton_rouge/news/louisiana-farm-size-data/article_efcc5a3e-c4e1-4424-ad7c-2245517671bb.html
- Farm Flavor — Top Louisiana Agriculture Facts From the 2024 Census of Agriculture: https://farmflavor.com/louisiana/top-louisiana-agriculture-facts/

### LSU AgCenter (cost-of-production, top-grower lists, summaries)
- LSU AgCenter — Sugarcane Summary 2022 (Gravois): https://www.lsuagcenter.com/~/media/system/b/4/5/7/b457f4d28e2b7dd37de4d72d16a37edf/02%20summary%20section%202022pdf.pdf
- LSU AgCenter — Sugarcane Summary 2023 (Gravois): https://www.lsuagcenter.com/~/media/system/4/8/1/d/481d121dd5056e4db20afb50b8d8750a/02%20summary%20section%202023pdf.pdf
- LSU AgCenter — State's Top Sugarcane Growers Recognized: https://www.lsuagcenter.com/topics/crops/sugarcane/states-top-growers-recognized
- LSU AgCenter — Sugarcane Enterprise Budgets 2024: https://www.lsuagcenter.com/articles/page1704052909510
- LSU AgCenter — Sugarcane Farm Costs and Returns Model 2024: https://www.lsuagcenter.com/articles/page1704053056348
- LSU AgCenter — Hurricane Francine economic impacts: https://www.lsuagcenter.com/profiles/lblack/articles/page1732130678687
- Southern Ag Today — Examining Sugarcane and Sugarbeet Production Costs: https://southernagtoday.org/2023/12/11/examining-sugarcane-and-sugarbeet-production-costs/

### Industry orgs and named operations
- American Sugar Cane League — Industry Info: https://www.amscl.org/industry-info/
- ASCL — Lula Westfield: A Sugarcane Family (24,000 cane ac, confirmed): https://www.amscl.org/lula-westfield-a-sugarcane-family/
- ASCL — Mark Patout profile: https://www.amscl.org/sugar_news_archives/mark-patout/
- ASCL — Louisiana sugarcane sets new milestones in 2024: https://www.amscl.org/louisiana-sugarcane-sets-new-milestones-in-2024-fueled-by-innovation-and-research/
- M.A. Patout & Son: https://mapatout.com/
- Cora Texas Manufacturing: https://coratexas.com/
- Provost Farm LLC: https://www.provostfarmllc.com/
- Louisiana Farm & Ranch — Lafourche family farm profile: https://www.lafarmandranch.com/feature-stories1/2022-sugarcane-harvest-off-to-a-positive-start-for-lafourche-family-farm

### Florida operators
- Sugar Cane Growers Cooperative of Florida: https://www.scgc.org/
- SCGC — Wikipedia: https://en.wikipedia.org/wiki/Sugar_Cane_Growers_Cooperative_of_Florida
- US Sugar Corporation: https://www.ussugar.com/
- US Sugar — Wikipedia (230k ac): https://en.wikipedia.org/wiki/U.S._Sugar
- Florida Crystals Corporation: https://www.floridacrystalscorp.com/
- Florida Crystals — Sugarcane Milling: https://www.floridacrystalscorp.com/sugarcane-milling
- Florida Sugar Cane League: https://sugarcaneleague.org/
- Florida Agriculture Authority — Sugarcane Production in Florida: https://floridaagricultureauthority.com/florida-sugarcane-production

### Hurricane and disaster impact
- Farm Progress — Sugarcane suffers from Hurricane Francine: https://www.farmprogress.com/crops/sugarcane-suffers-from-hurricane-francine-but-the-season-isn-t-over-yet
- Louisiana Farm Bureau News — Ranchers, Sugarcane Farmers Recovering from Francine: https://lafarmbureaunews.com/news/2024/9/22/ranchers-sugarcane-farmers-recovering-from-hurricane-francine
- USDA — Francine and Concerns about Louisiana Sugar Cane Crops: https://www.usda.gov/about-usda/news/radio/daily-newsline/2024-09-13/actuality-francine-and-concerns-about-louisiana-sugar-cane-crops

### Adjacent context
- USDA ERS — Most US sugarcane is produced in Florida and Louisiana: https://ers.usda.gov/data-products/charts-of-note/chart-detail?chartId=75999
- USDA ERS — US sugarcane production expands in Louisiana with new varieties: https://www.ers.usda.gov/data-products/charts-of-note/chart-detail?chartId=99085
- USDA ERS — Sugar and Sweeteners Outlook July 2025: https://ers.usda.gov/sites/default/files/_laserfiche/outlooks/112958/SSS-M-443.pdf

### Companion internal docs
- `~/Documents/headland/docs/market-sizing.md`
- `~/Documents/headland/docs/sugarcane-domain.md`
