# F-16 data

The numbers the flight model runs on. `docs/flight-model.md` says how to use them; this file only holds data.

**What this is.** The low-fidelity F-16 model from Stevens, Lewis and Johnson, *Aircraft Control and Simulation* (2nd ed. 2003, 3rd ed. 2015, Wiley). Its data come from NASA wind-tunnel and simulator work published as NASA TP-1538 (Nguyen et al., December 1979), a US Government work marked public use permitted.

**How it was checked.** Every table was compared cell by cell across seven independent open-source implementations of the book's model. Where they disagree, the value here is the one that reproduces the book's own two worked examples (section 6) exactly. Cells where sources disagreed are in **bold**; section 7 lists the alternatives. Do not "correct" a bold cell: the check cases will fail.

**Copyright.** Re-key these numbers into our own code. Do not copy source files from any of the implementations named in `docs/flight-model.md`; several are GPL and some have no licence at all.

**Units.** Imperial, as in the book: ft, slug, lbf, ft/s, psf, degrees in all tables, radians per second for body rates.

---

## 1. Geometry, mass and inertia

| Quantity | Value | Notes / source agreement |
|---|---|---|
| Weight | 20,500 lb (nominal) | The book code uses `RM = 1.57E-3` (1/mass, 1/slug), i.e. m = 636.94 slug, which is 20,490 lb at g = 32.17. NASA TM-2003-212145 Table 1 gives 20,500 lb. Russell uses m = 636.94 slug. mcflight uses 20,490.446 lb. |
| g | 32.17 ft/s^2 | All implementations |
| S, wing area | 300 ft^2 | All |
| b, span | 30 ft | All |
| cbar, MAC | 11.32 ft | All |
| xcgr, reference CG | 0.35 cbar | The aero data are referenced here. `xcg` is a free parameter: the book check case uses 0.40, the trim table 0.35, and Russell's default is 0.30. |
| Jxx | **9,496** slug-ft^2 | Book code, NASA TM-2003-212145, Russell, mcflight, JSBSim, isrlab. Two repos (FlightMechanics.jl mass props, ljnewton) have **9,456**. This is a typo: the book's printed c1..c9 constants back-solve to 9,496 exactly, and the check case only matches with 9,496. |
| Jyy | 55,814 slug-ft^2 | All |
| Jzz | 63,100 slug-ft^2 | All |
| Jxz | 982 slug-ft^2 | All. JSBSim writes `-982` because of its own sign convention for ixz. |
| Hx (engine angular momentum) | 160 slug-ft^2/s | Fixed and constant, along body x. All implementations; NASA TM-2003-212145 agrees. |

Inertia constants as hard-coded in the book's subroutine `F` (copied verbatim in AeroBench `subf16_model.py`):

```
c1 = -.770     c2 = .02755    c3 = 1.055e-4
c4 = 1.642e-6  c5 = .9604     c6 = 1.759e-2
c7 = 1.792e-5  c8 = -.7336    c9 = 1.587e-5
```

With G = Jxx*Jzz - Jxz^2 these are, in order:

* c1 = ((Jyy-Jzz)Jzz - Jxz^2)/G
* c2 = (Jxx-Jyy+Jzz)Jxz/G
* c3 = Jzz/G
* c4 = Jxz/G
* c5 = (Jzz-Jxx)/Jyy
* c6 = Jxz/Jyy
* c7 = 1/Jyy
* c8 = (Jxx(Jxx-Jyy)+Jxz^2)/G
* c9 = Jxx/G

For a bit-exact match with the book check case, use the rounded constants.


---

## 2. Aerodynamic tables

Breakpoints:

* alpha = -10:5:45 (12 points)
* el = -24:12:24 (5 points)
* beta = 0:5:30 for CL and CN (used with |beta|)
* beta = -30:10:30 (signed) for DLDA, DLDR, DNDA and DNDR


### 2.1 CX(alpha, el), X-body-axis force coefficient: 5 rows (el) x 12 columns (alpha)

| el (deg) \ alpha (deg) | -10 | -5 | 0 | 5 | 10 | 15 | 20 | 25 | 30 | 35 | 40 | 45 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| -24 | -.099 | -.081 | -.081 | -.063 | -.025 | .044 | .097 | .113 | .145 | .167 | .174 | .166 |
| -12 | -.048 | -.038 | -.040 | -.021 | .016 | .083 | .127 | .137 | .162 | .177 | .179 | .167 |
| 0 | -.022 | -.020 | -.021 | -.004 | .032 | .094 | .128 | .130 | .154 | .161 | .155 | .138 |
| 12 | -.040 | -.038 | -.039 | -.025 | .006 | .062 | .087 | .085 | .100 | .110 | .104 | .091 |
| 24 | -.083 | -.073 | -.076 | -.072 | -.046 | .012 | .024 | .025 | .043 | .053 | .047 | .040 |

### 2.2 CY, side-force coefficient (closed form, no table)

```
CY = -.02*beta + .021*(ail/20) + .086*(rdr/30)        (beta, ail, rdr in deg)
```

### 2.3 CZ(alpha, beta, el), Z-body-axis force coefficient

```
CZ = CZ0(alpha) * (1 - (beta/57.3)^2) - .19*(el/25)
```

| alpha (deg) | -10 | -5 | 0 | 5 | 10 | 15 | 20 | 25 | 30 | 35 | 40 | 45 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CZ0 | .770 | .241 | -.100 | -.416 | -.731 | -1.053 | -1.366 | -1.646 | -1.917 | -2.12 | -2.248 | -2.229 |

### 2.4 CL(alpha, beta), rolling moment (`CL` in the book means roll coefficient Cl, not lift)

The table is defined for beta >= 0. Use it as **Cl = sign(beta) * table(alpha, |beta|)**.

| beta (deg) \ alpha (deg) | -10 | -5 | 0 | 5 | 10 | 15 | 20 | 25 | 30 | 35 | 40 | 45 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | .000 | .000 | .000 | .000 | .000 | .000 | .000 | .000 | .000 | .000 | .000 | .000 |
| 5 | -.001 | -.004 | -.008 | -.012 | -.016 | **-.019** | **-.020** | **-.020** | -.015 | -.008 | -.013 | -.015 |
| 10 | -.003 | -.009 | -.017 | -.024 | -.030 | **-.034** | **-.040** | **-.037** | -.016 | -.002 | -.010 | -.019 |
| 15 | -.001 | -.010 | -.020 | -.030 | -.039 | **-.044** | **-.050** | **-.049** | -.023 | -.006 | -.014 | -.027 |
| 20 | .000 | -.010 | -.022 | -.034 | -.047 | **-.046** | **-.059** | **-.061** | -.033 | -.036 | -.035 | -.035 |
| 25 | .007 | -.010 | -.023 | -.034 | -.049 | **-.046** | **-.068** | **-.071** | -.060 | -.058 | -.062 | -.059 |
| 30 | .009 | -.011 | -.023 | -.037 | -.050 | **-.047** | **-.074** | **-.079** | -.091 | -.076 | -.077 | -.076 |

### 2.5 CM(alpha, el), pitching moment: 5 rows (el) x 12 columns (alpha)

| el (deg) \ alpha (deg) | -10 | -5 | 0 | 5 | 10 | 15 | 20 | 25 | 30 | 35 | 40 | 45 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| -24 | .205 | .168 | .186 | .196 | .213 | .251 | .245 | .238 | .252 | .231 | .198 | .192 |
| -12 | .081 | .077 | .107 | .110 | .110 | .141 | .127 | .119 | .133 | .108 | .081 | .093 |
| 0 | -.046 | -.020 | -.009 | -.005 | -.006 | .010 | .006 | -.001 | .014 | .000 | -.013 | .032 |
| 12 | -.174 | -.145 | -.121 | -.127 | -.129 | -.102 | -.097 | -.113 | -.087 | -.084 | -.069 | -.006 |
| 24 | -.259 | -.202 | -.184 | -.193 | -.199 | -.150 | -.160 | -.167 | -.104 | -.076 | -.041 | -.005 |

### 2.6 CN(alpha, beta), yawing moment

The table is defined for beta >= 0. Use it as **Cn = sign(beta) * table(alpha, |beta|)**.

| beta (deg) \ alpha (deg) | -10 | -5 | 0 | 5 | 10 | 15 | 20 | 25 | 30 | 35 | 40 | 45 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | .000 | .000 | .000 | .000 | .000 | .000 | .000 | .000 | .000 | .000 | .000 | .000 |
| 5 | .018 | .019 | .018 | .019 | .019 | .018 | .013 | .007 | .004 | -.014 | -.017 | -.033 |
| 10 | .038 | .042 | .042 | .042 | .043 | .039 | .030 | .017 | .004 | -.035 | -.047 | -.057 |
| 15 | .056 | .057 | .059 | .058 | .058 | .053 | .032 | .012 | .002 | -.046 | -.071 | -.073 |
| 20 | .064 | .077 | .076 | .074 | .073 | .057 | .029 | .007 | .012 | -.034 | -.065 | -.041 |
| 25 | .074 | .086 | .093 | .089 | .080 | .062 | .049 | .022 | .028 | -.012 | -.002 | -.013 |
| 30 | .079 | .090 | .106 | .106 | .096 | .080 | .068 | .030 | .064 | .015 | .011 | -.001 |

### 2.7 DLDA(alpha, beta), roll due to aileron (per unit ail/20)

beta is **signed**, -30..30 in 10-degree steps. There is no symmetry trick for this table or the three below.

| beta (deg) \ alpha (deg) | -10 | -5 | 0 | 5 | 10 | 15 | 20 | 25 | 30 | 35 | 40 | 45 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| -30 | -.041 | -.052 | -.053 | -.056 | -.050 | -.056 | -.082 | -.059 | -.042 | -.038 | -.027 | -.017 |
| -20 | -.041 | -.053 | -.053 | -.053 | -.050 | -.051 | -.066 | -.043 | -.038 | -.027 | -.023 | -.016 |
| -10 | -.042 | -.053 | -.052 | -.051 | -.049 | -.049 | -.043 | -.035 | -.026 | -.016 | -.018 | -.014 |
| 0 | -.040 | -.052 | -.051 | -.052 | -.048 | -.048 | -.042 | -.037 | -.031 | -.026 | -.017 | -.012 |
| 10 | -.043 | -.049 | -.048 | -.049 | -.043 | -.042 | -.042 | -.036 | -.025 | -.021 | -.016 | -.011 |
| 20 | -.044 | -.048 | -.048 | -.047 | -.042 | -.041 | -.020 | -.028 | -.013 | -.014 | -.011 | -.010 |
| 30 | -.043 | -.049 | -.047 | -.045 | -.042 | -.037 | -.003 | -.013 | -.010 | -.003 | -.007 | -.008 |

### 2.8 DLDR(alpha, beta), roll due to rudder (per unit rdr/30)

| beta (deg) \ alpha (deg) | -10 | -5 | 0 | 5 | 10 | 15 | 20 | 25 | 30 | 35 | 40 | 45 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| -30 | .005 | .017 | .014 | .010 | -.005 | .009 | .019 | .005 | -.000 | -.005 | -.011 | .008 |
| -20 | .007 | .016 | .014 | .014 | .013 | .009 | .012 | .005 | .000 | .004 | .009 | .007 |
| -10 | .013 | .013 | .011 | .012 | .011 | .009 | .008 | .005 | **-.002** | .005 | .003 | .005 |
| 0 | .018 | .015 | .015 | .014 | .014 | .014 | .014 | .015 | .013 | .011 | .006 | .001 |
| 10 | .015 | .014 | .013 | .013 | .012 | .011 | .011 | .010 | .008 | .008 | .007 | .003 |
| 20 | .021 | .011 | .010 | .011 | .010 | .009 | .008 | .010 | .006 | .005 | .000 | .001 |
| 30 | .023 | .010 | .011 | .011 | .011 | .010 | .008 | .010 | .006 | .014 | .020 | .000 |

### 2.9 DNDA(alpha, beta), yaw due to aileron (per unit ail/20)

| beta (deg) \ alpha (deg) | -10 | -5 | 0 | 5 | 10 | 15 | 20 | 25 | 30 | 35 | 40 | 45 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| -30 | .001 | -.027 | -.017 | -.013 | -.012 | -.016 | .001 | .017 | .011 | .017 | .008 | .016 |
| -20 | .002 | -.014 | -.016 | -.016 | -.014 | -.019 | -.021 | .002 | .012 | **.015** | .015 | .011 |
| -10 | -.006 | -.008 | -.006 | -.006 | -.005 | -.008 | -.005 | .007 | .004 | .007 | .006 | .006 |
| 0 | -.011 | -.011 | -.010 | -.009 | -.008 | -.006 | .000 | .004 | .007 | .010 | .004 | .010 |
| 10 | -.015 | -.015 | -.014 | -.012 | -.011 | -.008 | -.002 | .002 | .006 | .012 | .011 | .011 |
| 20 | -.024 | -.010 | -.004 | -.002 | -.001 | .003 | .014 | .006 | -.001 | .004 | .004 | .006 |
| 30 | -.022 | .002 | -.003 | -.005 | -.003 | -.001 | -.009 | -.009 | -.001 | .003 | -.002 | .001 |

### 2.10 DNDR(alpha, beta), yaw due to rudder (per unit rdr/30)

| beta (deg) \ alpha (deg) | -10 | -5 | 0 | 5 | 10 | 15 | 20 | 25 | 30 | 35 | 40 | 45 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| -30 | -.018 | -.052 | -.052 | -.052 | -.054 | -.049 | -.059 | -.051 | -.030 | -.037 | -.026 | -.013 |
| -20 | -.028 | -.051 | -.043 | -.046 | -.045 | -.049 | -.057 | -.052 | -.030 | -.033 | -.030 | -.008 |
| -10 | -.037 | -.041 | -.038 | -.040 | -.040 | -.038 | -.037 | -.030 | -.027 | -.024 | -.019 | -.013 |
| 0 | -.048 | -.045 | -.045 | -.045 | -.044 | -.045 | -.047 | -.048 | -.049 | -.045 | -.033 | -.016 |
| 10 | -.043 | -.044 | -.041 | -.041 | -.040 | -.038 | -.034 | -.035 | -.035 | -.029 | -.022 | -.009 |
| 20 | -.052 | -.034 | -.036 | -.036 | -.035 | -.028 | -.024 | -.023 | -.020 | -.016 | -.010 | -.014 |
| 30 | -.062 | -.034 | -.027 | -.028 | -.027 | -.027 | -.023 | -.023 | -.019 | -.009 | -.025 | -.010 |

### 2.11 DAMP(alpha), damping derivatives (book order D(1)..D(9))

| coef \ alpha (deg) | -10 | -5 | 0 | 5 | 10 | 15 | 20 | 25 | 30 | 35 | 40 | 45 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| D1 CXq | -.267 | -.110 | .308 | 1.34 | 2.08 | 2.91 | 2.76 | 2.05 | 1.50 | 1.49 | 1.83 | 1.21 |
| D2 CYr | .882 | .852 | .876 | .958 | .962 | .974 | .819 | .483 | .590 | 1.21 | -.493 | -1.04 |
| D3 CYp | -.108 | -.108 | -.188 | .110 | .258 | .226 | .344 | .362 | .611 | .529 | .298 | **-2.27** |
| D4 CZq | -8.80 | -25.8 | -28.9 | -31.4 | -31.2 | -30.7 | -27.7 | -28.2 | -29 | -29.8 | -38.3 | -35.3 |
| D5 Clr | -.126 | -.026 | .063 | .113 | .208 | .230 | .319 | .437 | .680 | .100 | .447 | -.330 |
| D6 Clp | -.360 | -.359 | -.443 | -.420 | -.383 | -.375 | -.329 | -.294 | -.230 | -.210 | -.120 | -.100 |
| D7 Cmq | -7.21 | **-.540** | -5.23 | -5.26 | -6.11 | -6.64 | -5.69 | -6.00 | -6.20 | -6.40 | -6.60 | -6.00 |
| D8 Cnr | -.380 | -.363 | -.378 | -.386 | -.370 | -.453 | -.550 | -.582 | -.595 | -.637 | -1.02 | -.840 |
| D9 Cnp | .061 | .052 | .052 | -.012 | -.013 | -.024 | .050 | .150 | .130 | .158 | .240 | .150 |


---

## 3. Building the total coefficients (book subroutine `F`)

This section is identical in the AeroBench Python and Matlab ports, the Fortran port, mcflight and Russell (lofi branch), apart from the aileron divisor noted below.

```
dail = ail/20          # NOTE: 20, not 21.5 (see section 7). Check case confirms /20.
drdr = rdr/30
CXT = CX(alpha,el)
CYT = CY(beta,ail,rdr)
CZT = CZ(alpha,beta,el)
CLT = CL(alpha,beta) + DLDA(alpha,beta)*dail + DLDR(alpha,beta)*drdr
CMT = CM(alpha,el)
CNT = CN(alpha,beta) + DNDA(alpha,beta)*dail + DNDR(alpha,beta)*drdr

# damping
TVT = .5/VT ; B2V = b*TVT ; CQ = cbar*q*TVT
D   = DAMP(alpha)
CXT += CQ*D1
CYT += B2V*(D2*r + D3*p)
CZT += CQ*D4
CLT += B2V*(D5*r + D6*p)
CMT += CQ*D7 + CZT*(xcgr - xcg)                    # uses CZT *after* its q-damping term
CNT += B2V*(D8*r + D9*p) - CYT*(xcgr - xcg)*cbar/b # uses CYT *after* its damping terms
```

The order matters: the CG-transfer terms use the already-damped CZT and CYT.

Forces and moments then use

* qbar*S*CXT + Thrust (thrust acts along +x body)
* qbar*S*CYT
* qbar*S*CZT
* qbar*S*b*CLT
* qbar*S*cbar*CMT
* qbar*S*b*CNT

The moment equations in `F` are:

```
pdot = (c2*p + c1*r + c4*Hx)*q + qbar*S*b*(c3*CLT + c4*CNT)
qdot = (c5*p - c7*Hx)*r + c6*(r*r - p*p) + qbar*S*cbar*c7*CMT
rdot = (c8*p - c2*r + c9*Hx)*q + qbar*S*b*(c4*CLT + c9*CNT)
```

Force equations are in the body axes: u, v, w come from VT, alpha and beta. Then

```
udot = r*v - q*w - g*sin(theta) + RM*(qbar*S*CXT + T)
vdot = p*w - r*u + g*cos(theta)*sin(phi) + RM*qbar*S*CYT
wdot = q*u - p*v + g*cos(theta)*cos(phi) + RM*qbar*S*CZT
```

These are converted to VTdot, alphadot and betadot, followed by the standard Euler-angle kinematics and the flat-earth navigation equations.

### Sign conventions (control surfaces)

All deflections are in degrees. Per Russell's manual and the table signs:

* **+el** = trailing-edge down: nose-down pitching moment (CM decreases with el) and less negative CZ.
* **+ail** gives negative rolling moment (DLDA < 0): right aileron down, left up, and roll rate p decreases.
* **+rdr** gives negative yawing moment (DNDR < 0) and positive side force (+.086).

### Interpolation

Piecewise-linear in each table dimension, and **linear extrapolation from the end segment** outside the breakpoints (not clamping). The book implements this with `fix()` and a `1.1*sign()` trick; any interpolation with the same behaviour gives identical results. Rows of the bilinear tables are the second variable (el or beta), columns are alpha. The CL and CN tables are looked up with |beta| and multiplied by sign(beta). The four control tables (DLDA, DLDR, DNDA, DNDR) use signed beta from -30 to 30.

---

## 4. Engine model

### 4.1 Throttle gearing TGEAR: throttle thtl in [0, 1] to commanded power CPOW in [0, 100] %

```
CPOW = 64.94*thtl              if thtl <= 0.77      (0.77 -> 50% = MIL)
CPOW = 217.38*thtl - 117.38    otherwise            (1.0  -> 100% = MAX A/B)
```

### 4.2 Power lag PDOT and RTAU (state POW, in %)

```
RTAU(dp) = 1.0                if dp <= 25
         = 0.1                if dp >= 50
         = 1.9 - 0.036*dp     otherwise              (1/s)

PDOT(P3=actual, P1=command):
  if P1 >= 50:
     if P3 >= 50: T = 5.0 ; P2 = P1
     else:        P2 = 60.0 ; T = RTAU(P2-P3)
  else:
     if P3 >= 50: T = 5.0 ; P2 = 40.0
     else:        P2 = P1 ; T = RTAU(P2-P3)
  POWdot = T*(P2 - P3)
```

All of AeroBench (Python and Matlab), mcflight, FlightMechanics.jl and ljnewton agree on this.

### 4.3 THRUST(POW, ALT, MACH), in lbf

Breakpoints: Mach 0:0.2:1.0 and altitude 0:10,000:50,000 ft.

**Orientation warning.** In the book's Fortran, `DIMENSION A(0:5,0:5)` is filled column-major, so the six numbers on each printed DATA line are **one Mach value across altitudes 0..50k**. The tables below are laid out that way: row = Mach, column = altitude. The check case only reproduces with this orientation.

```
H = .0001*ALT ; I = fix(H) ; if I>=5: I=4 ; DH = H - I
RM = 5*MACH  ; M = fix(RM); if M>=5: M=4 ; DM = RM - M ; CDH = 1-DH
bilinear(X) = S + (T-S)*DM,  S = X[M][I]*CDH + X[M][I+1]*DH,  T = X[M+1][I]*CDH + X[M+1][I+1]*DH   (X[mach][alt])
TMIL = bilinear(MIL) ; TIDL = bilinear(IDLE) ; TMAX = bilinear(MAX)
POW < 50 : T = TIDL + (TMIL-TIDL)*POW*.02
POW >= 50: T = TMIL + (TMAX-TMIL)*(POW-50)*.02
```

The book has no lower clamp. AeroBench adds `alt<0 -> 0.01` and `M<=0 -> 0`, which is a good idea in JS.

Idle (POW 0):

| Mach \ altitude (ft) | 0 | 10000 | 20000 | 30000 | 40000 | 50000 |
|---|---|---|---|---|---|---|
| 0.0 | 1060 | 670 | 880 | 1140 | 1500 | 1860 |
| 0.2 | 635 | 425 | 690 | 1010 | 1330 | 1700 |
| 0.4 | 60 | 25 | 345 | 755 | 1130 | 1525 |
| 0.6 | -1020 | **-710** | -300 | 350 | 910 | 1360 |
| 0.8 | -2700 | -1900 | -1300 | -247 | 600 | 1100 |
| 1.0 | -3600 | -1400 | -595 | -342 | -200 | 700 |

Military (POW 50):

| Mach \ altitude (ft) | 0 | 10000 | 20000 | 30000 | 40000 | 50000 |
|---|---|---|---|---|---|---|
| 0.0 | 12680 | 9150 | 6200 | 3950 | 2450 | 1400 |
| 0.2 | 12680 | 9150 | 6313 | 4040 | 2470 | 1400 |
| 0.4 | 12610 | 9312 | 6610 | 4290 | 2600 | 1560 |
| 0.6 | 12640 | 9839 | 7090 | 4660 | 2840 | 1660 |
| 0.8 | 12390 | 10176 | 7750 | 5320 | 3250 | 1930 |
| 1.0 | 11680 | 9848 | 8050 | 6100 | 3800 | 2310 |

Maximum / afterburner (POW 100):

| Mach \ altitude (ft) | 0 | 10000 | 20000 | 30000 | 40000 | 50000 |
|---|---|---|---|---|---|---|
| 0.0 | 20000 | 15000 | 10800 | 7000 | 4000 | 2500 |
| 0.2 | 21420 | 15700 | 11225 | 7323 | 4435 | 2600 |
| 0.4 | 22700 | 16860 | 12250 | 8154 | 5000 | 2835 |
| 0.6 | 24240 | 18910 | 13760 | 9285 | 5700 | 3215 |
| 0.8 | 26070 | 21075 | 15975 | 11115 | 6860 | 3950 |
| 1.0 | 28886 | 23319 | 18300 | 13484 | 8642 | 5057 |

Thrust is applied along +x body through the CG. There is no thrust moment. The engine gyroscopic effect enters only through Hx = 160.

### 4.4 Atmosphere / air-data computer ADC(VT, ALT)

The same in AeroBench, Russell, ljnewton and the Fortran port:

```
R0   = 2.377e-3                 # slug/ft^3
TFAC = 1 - .703e-5*ALT
T    = 519*TFAC  ; if ALT >= 35000: T = 390      # deg R
RHO  = R0*TFAC**4.14
MACH = VT/sqrt(1.4*1716.3*T)
QBAR = .5*RHO*VT*VT
PS   = 1715*RHO*T               # static pressure, psf (Russell/ljnewton output)
```

Note that RHO keeps using the troposphere power law above 35,000 ft; only T is frozen. The fit is intended for 0-50,000 ft.

---

## 5. Control limits, actuators and validity ranges

| Item | Value | What it is from |
|---|---|---|
| Elevator (stabilator) | +/-25 deg | Book code comments as reproduced in the Fortran port (`-25 <= EL <= 25`). TP-1538 text gives a full nose-up stabilator of -25 deg. NASA TM-2003-212145 agrees. The table only spans +/-24; outside that it is linearly extrapolated. |
| Aileron | +/-21.5 deg | Book code comments. TP-1538 text: "the available -21.5 deg of da". **But the book normalises by 20** (`ail/20`), so full aileron gives 1.075 x the tabulated effectiveness. |
| Rudder | +/-30 deg | Book code comments. TP-1538: "full (-30 deg) rudder". Normalised by 30. |
| Throttle | 0..1 | TGEAR input |
| Actuator dynamics | **none in the book's nonlinear subroutine**: `F` takes surface positions directly | Book code |
| Actuators (Russell UMN sim) | First-order lag, time constant 0.0495 s (gain 1/0.0495, about 20.2 rad/s). Rate limits: elevator +/-60 deg/s, aileron +/-80 deg/s, rudder +/-120 deg/s. LEF: time constant 0.136 s, +/-25 deg/s, 0..25 deg. Thrust: +/-10,000 lb/s. | Russell 2003 manual section 2.5. These are *not* part of the book's appendix model. ljnewton/sim-f16 uses the same 0.0495 s lag and rate limits 80/120 for aileron/rudder, but 30 deg/s for elevator (60 commented out). |
| alpha range | -10..45 deg | Book code comments; NASA TM-2003-212145 |
| beta range | -30..30 deg | Same |
| Thrust table range | 0..50,000 ft, Mach 0..1 | Book code comments; NASA TM-2003-212145 |
| Russell's lofi trim limits | alt 5,000..40,000 ft; V 300..900 ft/s; thrust 1,000..19,000 lb | Russell's trim program only, not the model |

**What the low-fidelity model leaves out:**

* no Mach or compressibility effects in the aerodynamics (Mach enters only the thrust table)
* no leading-edge flap
* no speed brake, trailing-edge flaps, landing gear or ground effect
* no alpha-dot terms
* no data beyond alpha = 45 deg, so no deep stall or post-stall
* no elevator effect on lateral axes and no beta effect on CX or CM; the only longitudinal/lateral coupling is the (1-(beta/57.3)^2) factor on CZ
* the damping derivatives are functions of alpha only
* no flight control system: this is the bare airframe. TP-1538 studied a relaxed-static-stability configuration, and Russell notes that the lofi model has "a complete decoupling between longitudinal and lateral directions".

---

## 6. Verification data (book check cases, for your JS unit tests)

**Table 3.5-2** (3rd ed. p. 185, as reproduced in `mcflight/scripts/tests/eqm_f16.tst` and `FlightMechanics.jl/test/aircrafts/f16.jl`).

Inputs:

* xcg = 0.4
* u = [thtl 0.9, el 20, ail -15, rdr -20]
* x = [VT 500, alpha 0.5, beta -0.2, phi -1, theta 1, psi -1, p 0.7, q -0.8, r 0.9, pn 1000, pe 900, h 10000, POW 90]

Expected xdot:

```
VTdot -75.23724   alphadot -0.8813491  betadot -0.4759990
phidot 2.505734   thetadot 0.3250820   psidot 2.145926
pdot 12.62679     qdot 0.9649671       rdot 0.5809759
pndot 342.4439    pedot -266.7707      hdot 248.1241    POWdot -58.68999
```

The tables in this file, with the rounded c1..c9, give 12.626785 / 0.964967 / 0.580976 for p/q/r-dot. Every derivative is within 5e-5 %.

**Table 3.6-2** (steady wings-level trim, sea level, xcg = 0.35, as reproduced in `mcflight/scripts/tests/trim_straight_level.csv`). Columns are VT (ft/s), throttle, alpha (deg), el (deg):

```
130 .816 45.6 20.1 | 140 .736 40.3 -1.36 | 150 .619 34.6 .173 | 170 .464 27.2 .621
200 .287 19.7 .723 | 260 .148 11.6 -.090 | 300 .122 8.49 -.591 | 350 .107 5.87 -.539
400 .108 4.16 -.591| 440 .113 3.19 -.671 | 500 .137 2.14 -.756 | 540 .160 1.63 -.798
600 .200 1.04 -.846| 640 .230 .742 -.871 | 700 .282 .382 -.900 | 800 .378 -.045 -.943
```


---

## 7. Disagreements between implementations, and which one matches the book

Labels used below:

* **MC** = mcflight (Scilab, from the 2nd ed.)
* **FM** = FlightMechanics.jl (from the 3rd ed.)
* **RU** = Russell/UMN `lofi_F16_AeroData.c`
* **LN** = ljnewton/sim-f16 (Matlab)
* **AB** = AeroBenchVVPython
* **ABM** = AeroBenchVV Matlab (C. S. Clark, 1997; AB is a port of it, so not independent)
* **GZ** = gyzhangqm Fortran port
* **NASA** = TP-1538 high-fidelity data at de = 0 and LEF = 0, as shipped in Russell's package. This is used as an outside reference only.

| Table / cell | Value used here (matches book check case) | Other value(s) | Evidence |
|---|---|---|---|
| **CL table, alpha = 15, 20, 25 columns, beta = 5..30** (18 cells) | "A" family: e.g. beta=5: -.019 -.020 -.020; beta=30: -.047 -.074 -.079 (MC, FM, RU, LN) | "B" family: beta=5: -.022 -.022 -.021; beta=10: -.041 -.045 -.040; beta=15: -.054 -.057 -.054; beta=20: -.060 -.069 -.067; beta=25: -.063 -.081 -.079; beta=30: -.068 -.089 -.088 (AB, ABM, GZ, csaf-controls, and the table FM keeps in a comment labelled "Morelli version") | The "A" family reproduces the 3rd-ed. check case exactly. The "B" family is off by 1.6 % in pdot and 0.54 % in rdot. **However, "B" is closer to the raw NASA TP-1538 data** (e.g. NASA at beta=10: -.043 -.044 -.041), and it is the version in the AeroBenchVV Matlab port (C. S. Clark lineage) and in the table FlightMechanics.jl attributes to Morelli. A plausible explanation, which I have not verified, is that the 1st edition (1992) / NASA tables carried "B" and the 2nd/3rd-edition program carries "A", but I could not check a 1st-edition copy directly. Use "A" to match the current book. "B" is arguably more physical. |
| CZ0 at alpha = 5 and 20 | -.416, -1.366 (MC, FM, RU, LN, GZ) | -.415, -1.355 (AB, ABM) | The trim table matches only with -1.366: at 200 ft/s, -1.355 gives alpha 19.85 instead of the book's 19.7. NASA data: -1.418 at alpha 20, so neither is a resample. |
| DLDR beta=-10, alpha=30 | -.002 (MC, FM, RU, LN, AB, ABM; NASA also -.002) | .000 (GZ; FM's "Morelli" comment) | The check case gives 1.37 % error in pdot with .000. |
| DNDA beta=-20, alpha=35 | .015 (MC, FM, LN; FM's "Morelli" too) | .016 (AB, ABM, RU, GZ; NASA gives .016) | Not discriminated by either check case. .015 is the 2nd/3rd-ed. reading. FM's Morelli copy instead has .016 at alpha=40, which looks like a transposition. |
| DAMP CYp at alpha=45 | -2.27 (MC, RU, LN, AB, ABM; NASA also -2.27) | -.227 (FM, which deliberately changed it to Morelli's value with the comment "-2.27 seems an error in Stevens"; GZ) | -2.27 is what the book and NASA print. -.227 is a plausibility edit. |
| DAMP Cmq at alpha=-5 | -.540 (MC, FM, RU, LN, AB, ABM) | -5.40 (GZ only) | Book value -.540. NASA data is -3.42, so the book value is suspicious but published. |
| DAMP CYp at alpha=0 | -.188 | -1.88 (MC only, typo) | |
| DAMP Cnp at alpha=5 | -.012 | -.102 (MC only, typo) | |
| DAMP CXq at alpha=-5 | -.110 | +.110 (RU only, typo) | |
| Idle thrust, Mach .6, 10,000 ft | -710 (MC, FM, LN, GZ) | -170 (AB, ABM) | -710 is monotone with its neighbours. -170 is a digit swap in the AeroBench lineage. |
| Jxx | 9,496 | 9,456 (FM mass props, LN) | See section 1. |
| Aileron normalisation | ail/20 (book, AB, MC, FM, GZ) | ail/21.5 (Russell `nlplant.c`, lofi and hifi) | The check case gives 2.6 % pdot error with /21.5. GZ's comment: "The aileron was normalized using 20.0 but the NASA report and S&L both have 21.5 deg. as maximum deflection." |
| DLDA..DNDR beta grid | -30:10:30 signed (book, AB, MC, FM, LN, GZ) | Russell's lofi `dmomdcon` reinterprets it as 0:5:30 using |beta| ("This part is changed from the orig tables since data is actually [0;5;30]") | Against NASA control-increment data, the -30:10:30 reading fits better: mean max error .003-.011 vs .009-.021. Russell's change is not the book. |
| Engine model in GZ | n/a | GZ replaces TGEAR, PDOT and the POW state with a direct throttle blend (`THTL/0.77`) and converts to SI | Not the book |
