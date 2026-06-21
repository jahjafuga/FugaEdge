import type * as React from 'react'

// Static SVG flag imports via country-flag-icons. Each subpath is its own
// module so Vite tree-shakes the bundle to exactly the flags we list here
// (~46 components × ~1 KB each ≈ 50 KB raw, gzipped much smaller).
//
// Country codes covered:
//   - Every ISO in REGION_MAP (src/core/country/regions.ts) so any
//     auto-detected or manually-set country we recognize gets a flag.
//   - SHELL_JURISDICTIONS so manual overrides on shell-incorporated
//     companies (Cayman / Bermuda / BVI / Marshall / Jersey / Guernsey /
//     Isle of Man) render correctly too.
//
// Adding a new code: import it below AND add it to FLAG_COMPONENTS.

// Region: USA
import US from 'country-flag-icons/react/3x2/US'
// Region: China (with Macau)
import CN from 'country-flag-icons/react/3x2/CN'
import MO from 'country-flag-icons/react/3x2/MO'
// Region: Hong Kong
import HK from 'country-flag-icons/react/3x2/HK'
// Region: Singapore
import SG from 'country-flag-icons/react/3x2/SG'
// Region: Israel
import IL from 'country-flag-icons/react/3x2/IL'
// Region: Canada
import CA from 'country-flag-icons/react/3x2/CA'
// Region: UK
import GB from 'country-flag-icons/react/3x2/GB'
// Region: Europe
import DE from 'country-flag-icons/react/3x2/DE'
import FR from 'country-flag-icons/react/3x2/FR'
import IT from 'country-flag-icons/react/3x2/IT'
import ES from 'country-flag-icons/react/3x2/ES'
import NL from 'country-flag-icons/react/3x2/NL'
import CH from 'country-flag-icons/react/3x2/CH'
import SE from 'country-flag-icons/react/3x2/SE'
import NO from 'country-flag-icons/react/3x2/NO'
import DK from 'country-flag-icons/react/3x2/DK'
import FI from 'country-flag-icons/react/3x2/FI'
import IE from 'country-flag-icons/react/3x2/IE'
import BE from 'country-flag-icons/react/3x2/BE'
import AT from 'country-flag-icons/react/3x2/AT'
import PT from 'country-flag-icons/react/3x2/PT'
import LU from 'country-flag-icons/react/3x2/LU'
import GR from 'country-flag-icons/react/3x2/GR'
import PL from 'country-flag-icons/react/3x2/PL'
import CZ from 'country-flag-icons/react/3x2/CZ'
import HU from 'country-flag-icons/react/3x2/HU'
// Region: Australia (with NZ)
import AU from 'country-flag-icons/react/3x2/AU'
import NZ from 'country-flag-icons/react/3x2/NZ'
// Region: Japan
import JP from 'country-flag-icons/react/3x2/JP'
// Region: Korea
import KR from 'country-flag-icons/react/3x2/KR'
// Region: Taiwan
import TW from 'country-flag-icons/react/3x2/TW'
// Region: India
import IN from 'country-flag-icons/react/3x2/IN'
// Region: LatAm
import MX from 'country-flag-icons/react/3x2/MX'
import BR from 'country-flag-icons/react/3x2/BR'
import AR from 'country-flag-icons/react/3x2/AR'
import CL from 'country-flag-icons/react/3x2/CL'
import CO from 'country-flag-icons/react/3x2/CO'
import PE from 'country-flag-icons/react/3x2/PE'
// SHELL_JURISDICTIONS — manual overrides may select these even though
// resolveCountryFromPolygon never returns them as the operations country.
import KY from 'country-flag-icons/react/3x2/KY'
import BM from 'country-flag-icons/react/3x2/BM'
import VG from 'country-flag-icons/react/3x2/VG'
import MH from 'country-flag-icons/react/3x2/MH'
import JE from 'country-flag-icons/react/3x2/JE'
import GG from 'country-flag-icons/react/3x2/GG'
import IM from 'country-flag-icons/react/3x2/IM'
// Outside REGION_MAP (folds into the 'Other' region) but present on real
// trades — added so it renders a flag, not the code-pill fallback.
import CI from 'country-flag-icons/react/3x2/CI'

type FlagSvgComponent = (
  props: React.HTMLAttributes<SVGElement>,
) => React.JSX.Element

export const FLAG_COMPONENTS: Record<string, FlagSvgComponent> = {
  US,
  CN, MO,
  HK,
  SG,
  IL,
  CA,
  GB,
  DE, FR, IT, ES, NL, CH, SE, NO, DK, FI, IE, BE, AT, PT, LU, GR, PL, CZ, HU,
  AU, NZ,
  JP,
  KR,
  TW,
  IN,
  MX, BR, AR, CL, CO, PE,
  KY, BM, VG, MH, JE, GG, IM,
  CI,
}
