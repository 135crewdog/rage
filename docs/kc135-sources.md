# KC-135R sources

Where the data for a future KC-135R flight model would come from, what each source holds, and whether it may be used. This is a source register, not a data file: no numbers from it go into code until they've been checked against the original scan and put into a data file of their own, the way `docs/f16-data.md` was.

Compiled 26 October 2026 from five parallel searches (airframe, relatives, engine, airplane, refuelling), then checked for releasability by a separate pass.

## The owner's rule

Never use data from official US Air Force flight manuals or performance manuals (any T.O. 1C-135 series "Dash-1", its performance supplements, checklists, air-refuelling T.O.s such as 1-1C-1, engine T.O.s), whether found directly, leaked, or quoted second-hand, unless the document carries a very clear and legally sturdy releasability statement. **Even then, nothing from it is used without the owner's explicit permission.** Ill-begotten USAF data must not be used.

How the searches applied it:

- No flight manual, performance manual or checklist was opened. None turned up directly.
- Public-release reports that **cite** a T.O. for a value: that value is excluded, the rest of the report is judged on its own.
- Pilot commentary and forums, where the Dash-1 is often quoted: excluded unopened.
- Proprietary manufacturer manuals on sharing sites (Boeing, CFM): excluded unopened.
- DTIC documents without a clear Distribution A statement: excluded.
- Anything with a clean statement but doubtful provenance: listed under **Owner decisions** and not used.

Status used below: **Usable** (clean statement, no flight-manual provenance), **Decision** (see Owner decisions), **Excluded**.

## 1. What can be built, in one page

A credible KC-135R model can be built without any flight manual, but it will be a documented approximation, not a model checked to seven digits like the F-16.

- **The airframe is the KC-135A's.** NASA and Boeing tested KC-135A models in wind tunnels and flew a KC-135A in the winglet programme, so the real airframe has public data. The 707 idea becomes a backup rather than the base: the KC-135, 707-120 and 720 share essentially one wing (130.8 ft span, 2,433 ft², 241.9 in mean chord, 35° sweep), so 720 and 707-120 data transfer with little wing scaling. The 707-320B's wing is about 19% bigger and a different planform, so its data needs real re-referencing.
- **The engine is well covered.** The KC-135R's F108 is the CFM56-2B, rated in the European type certificate. A published open thrust-lapse model, international emissions-databank fuel flows and NASA big-fan transient data finish it.
- **Most aerodynamic data is plotted, not tabulated.** It has to be digitised from figures, which costs time and adds error.
- **The biggest gaps** are elevator, aileron and spoiler effectiveness, all rate derivatives, transonic tail and trim, KC-135R-specific effects (CFM56 nacelles, larger stabiliser), and mass properties for the R. One thesis would fill most of them (Owner decision 1). Otherwise they're estimated with the Air Force's public DATCOM handbook or a vortex-lattice code and checked against the tail-on low-speed tunnel data.
- **It will fly like a conventional jet**, not fly-by-wire: tab-driven manual surfaces with a boosted rudder, a moving stabiliser trimmed by hand, a yaw damper, and a lightly damped Dutch roll without it. The public flight-test data gives the Dutch roll's damping and period as a validation target.
- **Air refuelling is feasible.** The boom is well documented in Air Force research, and a tanker-wake model validated against a Learjet flown behind a real KC-135 exists. A boom envelope with clean provenance does not (Owner decision 5).

## 2. Airframe aerodynamics (KC-135A family)

| # | Source | What it gives | Status |
|---|---|---|---|
| A1 | **NASA TM 73,250** (Hedstrom & Whitcomb, 1977). Static aerodynamic characteristics of a 0.035-scale modified NKC-135 at Mach 0.28. https://ntrs.nasa.gov/api/citations/19780004068/downloads/19780004068.pdf | The only complete, tail-on C-135 airframe test: α −8° to 20°, β −18° to 8°, flaps 0/30/40/50°, ailerons ±10/±20°, rudder ±10/±27°, stabiliser 0° or 6°. CN, CA, CY, CL, CD, Cl, Cm, Cn; static margin. Use the basic WBNH6V/WBNH0V runs, not the radome configurations. No elevator. Plots. "Unlimited". | Usable |
| A2 | **NASA TP-1119**, Winglets IV (Meyer, 1978). Full-span KC-135A model, Mach 0.30. https://ntrs.nasa.gov/api/citations/19780010054/downloads/19780010054.pdf | Tail on and off, stabiliser 0/−4/−10°, flaps 0/30/50°, ailerons. CL, CD, Cm, CY, Cl, Cn; β derivatives; aileron effectiveness. Plots. "Unclassified - Unlimited". | Usable |
| A3 | **AFFDL-TR-77-23** (Boeing D6-45090, Ishimitsu & Zanton, 1977). Design and Analysis of Winglets for Military Aircraft, Phase II. https://apps.dtic.mil/sti/tr/pdf/ADA046152.pdf | Full-scale KC-135A geometry table (wing, both tails, chords, sweep, dihedral, incidence, stabiliser travel). Trimmed low-speed polars to CLmax at flaps 30° and 50°. Mach 0.50–0.95 wing-body data: drag rise, drag-divergence boundary, buffet onset, Mach tuck, sideslip derivatives (no tail). "Approved for public release; distribution unlimited." Two items in it come from Boeing's flight-manual substantiation report (Owner decision 2); the rest is wind-tunnel test data. | Usable, minus decision 2 |
| A4 | **NASA TM-85920** (Curry & Bowers, 1985). Ground-effect analysis of a jet transport. https://ntrs.nasa.gov/api/citations/19850007378/downloads/19850007378.pdf | Flight-measured ground effect for the KC-135 and the Boeing 720, which it calls "nearly identical"; a recommended ground-effect model. Plots. "Unclassified-Unlimited"; public domain. | Usable |
| A5 | **Montoya, KC-135 Winglet Flight Results** (NASA Dryden, c. 1980). https://ntrs.nasa.gov/api/citations/19810010485/downloads/19810010485.pdf | Full-scale **flight** lift-drag polar at Mach 0.78 and a buffet boundary. Plots. No statement in the copy read; NTRS record still to confirm. | Usable once the NTRS record is confirmed |
| A6 | **NASA CP-2211**, KC-135 Winglet Program Review (1982). https://ntrs.nasa.gov/citations/19840019618 | Flight lift and drag at Mach 0.70–0.80 (Lux paper), buffet boundaries (Dodson), fuel mileage, loads, flutter. The Lux and Dodson papers weren't reached by the text tool and need reading by hand. NTRS: "Public Use Permitted". | Usable |
| A7 | **NASA TP-1163**, Winglets V (Jacobs, 1978). https://ntrs.nasa.gov/api/citations/19780012138/downloads/19780012138.pdf | Mach 0.50–0.95 wing-body lateral-directional derivatives (no tail). The author warns its **drag data are not representative**. "Unclassified - Unlimited". | Usable, not for drag |
| A8 | **NASA TN D-8473**, Winglets I (Jacobs, Flechner, Montoya, 1977). https://ntrs.nasa.gov/api/citations/19780012121/downloads/19780012121.pdf | Semispan KC-135A at Mach 0.30–0.80: wing-body CL-α and Cm through cruise Mach. "Unclassified - Unlimited". | Usable |
| A9 | Pressure and load parts: **TN D-8474** (II), **TN D-8478** (III, not opened), **TM-78786**, **TP-2619** (VII), **TN D-8260**. URLs in the research notes. | Pressures and span loads, and the wing's planform, thickness and twist. For checking a vortex-lattice model and setting the wake's span loading. | Usable |
| A10 | **USAF KC-135 fact sheet.** https://www.af.mil/About-Us/Fact-Sheets/Display/Article/1338706/kc-135-fact-sheet/ | Official basics: span, length, height, MTOW 322,500 lb, transfer fuel, speed, ceiling. | Usable |
| A11 | **FlightGear KC-135** (GPL). https://github.com/FGMEMBERS/KC135 | A generic template estimate, not data. | Not a source |

## 3. Relatives: 367-80, 707, 720

| # | Source | What it gives | Status |
|---|---|---|---|
| R1 | **Boeing D6-20659** series for NASA Ames (1968), "An Analysis of Methods for Predicting the Stability Characteristics of an Elastic Airplane". Appendix C: https://ntrs.nasa.gov/api/citations/19690003076/downloads/19690003076.pdf. Summary (NASA CR-73277): https://ntrs.nasa.gov/api/citations/19690003073/downloads/19690003073.pdf | **Tabulated** rigid and elastic longitudinal and lateral-directional derivatives for the 707-320B, Mach 0.1–1.0 at 10,000 and 35,000 ft (Appendix C Tables 16 and 18, pp. 137–162; Summary Tables 4 and 5). The only public cruise-Mach derivative set for a production 707. Values not yet extracted. Standard NASA contractor-report statement, no limitation. | Usable |
| R2 | **NASA TN D-3971** (Langley, 1967). 367-80 in-flight simulator. https://ntrs.nasa.gov/api/citations/19670019704/downloads/19670019704.pdf | **Tabulated** derivative set, weight, CG and inertias for the Dash 80 at approach (135 kt, flaps 20° and 30°). Modes match NASA flight data (R3). Some lateral rows were scrambled in the text layer; match them on the scan. | Usable |
| R3 | **NASA TN D-4804** (Crane, Sommer, Healy, 1968). https://ntrs.nasa.gov/api/citations/19680027603/downloads/19680027603.pdf | Dash 80 approach handling and flight-measured modes. Validation. | Usable |
| R4 | **FAA type certificate data sheets 4A21** (707-100/-200), **4A26** (707-300), **4A28** (720). Read from govdocs1 copies; current revisions on https://drs.faa.gov | Speed limits, weights, MAC and LEMAC, CG limits, engines. No control-surface travels. Comparison only: the KC-135 has no FAA type certificate. | Usable |
| R5 | **NASA CR-635** (Boeing, 1966); **AGARD Report 528** (1966); **NASA TM-4084** (1988, Boeing 720). URLs in the research notes. | Dash 80 geometry and inertias; 720 weights, elevator servo model. | Usable |
| R6 | **NASA CR-96008** (Teper, 1969, includes a DC-8); **NASA CR-2144** (Heffley & Jewell, 1972, includes a CV-880M). | Same-class jets, not 707s. Cross-checks only. | Usable |
| R7 | **Boeing Airplane Characteristics for Airport Planning**, 707 and 720. https://www.boeing.com/content/dam/boeing/v2/airports/acaps/707.pdf | Dimensions. Boeing copyright: use dimensions as facts, don't copy figures. | Usable for dimensions |
| R8 | **NASA CR-66125** (Boeing D6-10743) and **CR-66126** (D6-19856). | Dash 80 lift, drag and lateral static plots. | Decision 3 |

## 4. Engine: F108 / CFM56-2B

| # | Source | What it gives | Status |
|---|---|---|---|
| E1 | **EASA type certificate data sheet E.066**, CFM56-2 and -3, Issue 02 (2023). https://www.easa.europa.eu/fr/downloads/7691/en | The CFM56-2B (KC-135R): take-off 9,786 daN (22,000 lbf) and maximum continuous 9,599 daN, sea-level static; weight, rotor-speed and temperature limits; hydromechanical control; **no thrust reverser** in its type design. Published openly by the regulator. | Usable |
| E2 | **ICAO Aircraft Engine Emissions Databank**, via the OpenAP open-source package. https://www.easa.europa.eu/en/domains/environment/icao-aircraft-engine-emissions-databank | Bypass ratio 6.0, pressure ratio 23.5, fuel flow at 100/85/30/7% thrust. Verify against the official spreadsheet. | Usable |
| E3 | **Bartel & Young** (J. Aircraft, 2008) thrust-lapse equations, with constants printed in the open **OpenAP paper** (Sun et al., *Aerospace*, 2020, CC BY). https://www.mdpi.com/2226-4310/7/8/104 | The recommended thrust model: take-off thrust with Mach and altitude, three-segment climb model. Needs a cruise reference thrust; estimates agree on 4,600–5,000 lbf at about 35,000 ft, Mach 0.8, but no primary figure exists. | Usable |
| E4 | **OpenConcept CFM56 deck** (MIT licence). https://github.com/mdolab/openconcept | A generic CFM56-7B-class engine table, for cross-checking lapse shape and cruise fuel flow. Some bad cells. | Usable, cross-check |
| E5 | **14 CFR 33.73 and 25.119**; **NASA TP-97-206217** (MD-11 engines-only flight control); **NASA TM-2009-215668** and **TM-2010-216810** (C-MAPSS). | Spool-up: a high-bypass engine is slow near idle, about a 1 s time constant above 20% thrust; flight idle to 95% thrust within 5 s is the certification ceiling. | Usable |
| E6 | **USAF fact sheet**: "21,634 pounds each engine". | Matches neither certified rating; unexplained. Note it, use E1. | Usable, noted |

## 5. Geometry, mass, controls and validation

| # | Source | What it gives | Status |
|---|---|---|---|
| G1 | A3's geometry table, cross-checked by A4, R4 and A9. | Wing, tails, chords, sweep, dihedral, incidence, stabiliser travel (one value is unclear in the scan). | Usable |
| G2 | **USAF Accident Investigation Board report, KC-135R 63-8877 (Shell 77), 2013**, a publicly releasable report. Mirror: https://code7700.com/pdfs/usaf/usaf_aib_050313_kc135_manas.pdf; official copy in the Air Force FOIA Reading Room. | The board's own flight-data findings: Dutch roll period about 5 s, ±3° yaw, ±5° bank, autopilot interaction, rudder power unit and series yaw damper exist. **Every passage the report cites to the flight manual is excluded.** | Usable, board findings only |
| G3 | **FAA airworthiness directives** 64-10-02, 65-13-01, 80-07-02 (707/720). | Stabiliser trim green band, electrical limit and actuator brake; rudder power unit tests. Existence and behaviour, not numbers. | Usable |
| G4 | **NASA TM-2005-213162** and Williams 1988 (NASA zero-g operations). | Parabola profile: a good check case for pitch control and energy. | Usable |
| G5 | **AFIT thesis, J. Smith 2007** (public release). https://scholar.afit.edu/cgi/viewcontent.cgi?article=3971&context=etd | A 1998 Air Force flight-test trim point (about 240,000 lb, 21,000 ft, 622 ft/s, 2.5° pitch). | Usable |
| G6 | Crenshaw 1976 thesis: inertias, flight-test derivatives, modes. | The only public KC-135 inertias and full derivative set. | Decision 1 |

## 6. Air refuelling

| # | Source | What it gives | Status |
|---|---|---|---|
| F1 | **Smith & Kunz 2006**, AFRL-VA-WP-TP-2006-342. https://apps.dtic.mil/sti/pdfs/ADA464364.pdf | Boom geometry, ruddevators, weight breakdown, multibody equations. "Approved for public release". | Usable |
| F2 | **Mortensen 1997**, AFIT/GE/ENY/97S-01. https://apps.dtic.mil/sti/pdfs/ADA329325.pdf | Boom weights itemised, ruddevator aero, tube stiffness, a linear KC-135R model at Crenshaw's cruise condition. Its envelope table is Decision 5. | Usable, minus decision 5 |
| F3 | **J. Smith 2007** (G5). | Tanker-boom coupling, trim results. | Usable |
| F4 | **Bihrle 2002**, AFRL-VA-WP-TR-2006-3170. https://apps.dtic.mil/sti/pdfs/ADA459237.pdf | Measured 1/13-scale KC-135 wake and its effect on a receiver; contour plots. | Usable |
| F5 | **Dogan, Sato & Blake 2005**, AIAA 2005-6264 (DTIC copy, public release). https://apps.dtic.mil/sti/pdfs/ADA445129.pdf; **Waishek 2007** and **Lewis 2008** UT Arlington theses (CC BY-NC-SA). | The practical wake model: wing and tail horseshoe vortices averaged into a wind and wind gradient at the receiver. Lewis validates it against a Learjet behind a KC-135 (about 3–4 m/s downwash at contact). The equations themselves are in papers not yet opened. | Usable |
| F6 | **Devuono 2007**, AFIT (public release). https://scholar.afit.edu/cgi/viewcontent.cgi?article=3982&context=etd | AFRL vortex-lattice KC-135 flowfield as a grid. | Usable |
| F7 | Contact position, about 83 ft aft and 21 ft below the tanker CG (Dogan 2005, Waishek 2007, Mortensen 1997, consistent with each other). | A research definition, not from a T.O. | Usable |
| F8 | ARSAG documents and the NATO refuelling standard. | Boom envelope. | Decision 4 |

## 7. Owner decisions

None of these is used until the owner says so. Recommendations in brackets.

1. **Crenshaw thesis**, AFIT GAE/MC/76D-5, 1976. https://apps.dtic.mil/sti/pdfs/ADA034940.pdf. "Approved for public release; distribution unlimited." It holds the only public KC-135 inertias and full derivative set, flight test and Boeing's analysis code, at cruise, climb and approach, plus mode data. Its stall speed and minimum control speed cite references with flight-manual-style page numbers; those two values are struck out regardless. Its inertias and flight-test derivatives come from "a Boeing document on -135 series aircraft", unidentified because the bibliography wasn't readable. *[Read its bibliography from the scan first. If that Boeing document isn't a flight manual or its substantiation report, use the thesis minus the two struck values.]*
2. **AFFDL-TR-77-23's two items from Boeing D6-5599**, "Substantiation Data Report for the KC-135A Flight Manual": take-off, touchdown and buffet lift coefficients by flap setting, and a full-scale drag figure. Boeing's engineering backup for the flight manual, not the manual itself. *[Don't use. The wind-tunnel data cover the same ground.]*
3. **NASA CR-66125 and CR-66126** (Boeing, Dash 80). Covers say "see limitations sheet", the sheet is missing, NTRS marks them public. *[Don't use unless R2 and R3 prove insufficient; they're Dash 80 approach data only.]*
4. **ARSAG boom-receptacle documents** AD1053142, AD1090244, AD1048313. Distribution A on the first and last (the second's statement needs checking by eye), but written as text for NATO's refuelling standards. Also **NATO ATP-3.3.4.2 / 3.3.4.5**, not opened. *[Leave until the refuelling milestone; decide then.]*
5. **Mortensen's envelope table**, credited to an unidentified "Philips", matching the generic NATO envelope. *[Same as 4.]*

## 8. Excluded

| What | Why |
|---|---|
| Any T.O. 1C-135 Dash-1, performance manual, checklist; T.O. 1-1C-1 and supplements; ATP-56 | Owner's rule. None was opened. |
| Locken 1983 AFIT thesis (ADA141118) | Describes the controls "as described by the current Tech. Order". |
| Hoganson 1983 AFIT thesis (ADA136895), procedures | Cites a refuelling T.O.; only its aerodynamic method is kept. |
| Gray 1979 (ADA079796), Stephenson 1998 (ADA391836), Williamson 2018 (AD1107533), Dittus 2003 (ADA431694) | Their refuelling or offload numbers cite T.O.s or ATP-56. |
| Boeing fuel freeze-point study (ADA152801) | States its KC-135 fuel data came from the technical orders. |
| Crenshaw's stall speed and minimum control speed | Flight-manual-style references. |
| Shell 77 report passages cited to the inflight manual | Second-hand T.O. content. |
| Code7700 case study and 1980 KC-135A take-off data page; forum threads | Pilot commentary that quotes, or is built from, the Dash-1. Not opened. |
| Scribd and similar copies of manuals, CFM operating instructions, copyrighted books | Proprietary or copyrighted; not opened. |
| AFFDL-TR-78-124 (ADA068324) | Couldn't be read; distribution unknown. |

## 9. Gaps, and how they'd be filled

| Gap | Fill |
|---|---|
| Elevator, aileron, spoiler and speed-brake effectiveness; hinge moments | Decision 1 if cleared (partly); otherwise USAF DATCOM (public) or a vortex-lattice code, checked against A1/A2 tail-on data. |
| All rate derivatives (Cmq, Clp, Cnr …) | Decision 1, or DATCOM/strip theory; R2 for approach. |
| Transonic tail, trim and Mach trim | Estimate; check against A5/A6 cruise polars. |
| KC-135R changes: CFM56 nacelles, larger stabiliser, inertia | Estimate from geometry; document as approximations. |
| Control-surface sizes and travel limits; stabiliser trim rate | Not public. Estimate from three-views and generic transport ratios; the owner's judgement tunes the feel, without numbers from the Dash-1. |
| Stall and post-stall beyond α 20° | Not public. Stall behaviour gets a documented, conservative model. |
| CG limits, takeoff, approach and stall speeds, Vmca | Not public outside T.O.s. Use 720/707 FAA values for comparison only. |
| Cruise thrust and flat-rating temperature of the CFM56-2B | Use the E3 estimates, stated as such. |
| Boom envelope | Decisions 4 and 5. |

## 10. Next steps

The research sandbox couldn't download PDFs, so every report was read through a text-extraction tool that sees poor scan text and stops after about 100 pages. Before anything goes into a data file:

1. **Read Crenshaw's bibliography** from the scan, to settle Decision 1. This decides how much has to be estimated.
2. **Extract the tabulated sets**: D6-20659 Tables 16 and 18 and Summary Tables 4 and 5 (R1); TN D-3971 Table 2-4 (R2).
3. **Read CP-2211's Lux and Dodson papers** by hand (A6).
4. **Digitise the key plots**: A1 and A2 force and moment curves, A3 drag rise and buffet, A4 ground effect.
5. **Find the open papers with the wake equations** (Venkataramanan's 2004 UT Arlington thesis; Lewis 2008).
6. Then write `docs/kc135-data.md` and a flight-model section the way the F-16's were, with an independent check.

The raw research notes behind this register, with every distribution statement quoted, are not in the repo, because some of them contain numbers from sources still awaiting the owner's decision.
