// Hawaiʻi Dashboard - Embedded Data
//
// 26 metrics across 5 areas.
// Hawaiʻi values and medianSeries (50-state mathematical median, includes
// Hawaiʻi, excludes DC and Puerto Rico) sourced from federal agencies.
// Original baseline: 250814 HI Dashboard.xlsx
// Migration 2011-2019 backfilled from Census PEP 2019 vintage.

const DASHBOARD_DATA = {
  "violent_crime_rate": {
    "area": "Safety & Health",
    "metric": "Violent Crime Rate",
    "officialName": "Counts murder, non-negligent manslaughter, rape, robbery, and aggravated assault. Rate per 100,000 residents.",
    "sourceCategory": "federal",
    "unit": "per 100K",
    "unitLabel": "per 100K residents",
    "goodDirection": "down",
    "source": "FBI Crime Data Explorer",
    "sourceUrl": "https://cde.ucr.cjis.gov/",
    "whyItMatters": "Violent crime shapes whether people feel safe at home, at school, and in public.",
    "scale": {
      "denominator": 1441387,
      "denominatorRounded": 1440000,
      "unit": "residents",
      "countLabel": "reported violent-crime incidents a year",
      "year": 2023,
      "source": "Census NST-EST2024 (2023 estimate)"
    },
    "howToRead": "The median tracks the classic crime wave, peaking in the early 1990s then falling. Hawaiʻi has been better than the median throughout but peaked later, around 2016, before declining. The 1971 spike reflects incomplete early UCR reporting, not an actual increase. A visible step between 2020 and 2021 reflects FBI's switch from UCR-vintage state totals to CDE's NIBRS-era reconstructions, not actual one-year movement.",
    "potentialDrivers": "Hawaiʻi ranks among the safest states despite ranking last in housing affordability, a pattern most states do not show. Two things help explain the gap. <a href=\"https://www.census.gov/quickfacts/fact/table/HI/HSD410223\">Census QuickFacts</a> shows Hawaiʻi's 65+ share was 21.5 percent in 2024 versus 18.0 percent nationally, and <a href=\"https://ojjdp.ojp.gov/model-programs-guide/literature-reviews/age-boundaries-of-the-juvenile-justice-system\">DOJ's OJJDP</a> notes that offending peaks at ages 18 to 21, so an older population mechanically lowers exposure. Hawaiʻi's <a href=\"https://ag.hawaii.gov/cpja/files/2024/08/Gun-Violence-in-Hawaii-Landscape-Report-5-2024-Email-Version.pdf\">Attorney General gun violence report</a> found firearms were the least used weapon in violent index crimes and the state has some of the nation's most comprehensive gun laws. Measurement note: <a href=\"https://www.hawaiitourismauthority.org/media/14038/december-2024-visitor-statistics-press-release.pdf\">HTA reported</a> an average daily visitor census of 230,438 in 2024, which understates the at-risk population in the per-100,000 denominator.",
    "countyNarrative": "Honolulu County accounts for the majority of statewide violent crime by volume, reflecting its share of the state's population and visitor concentration. Among the neighbor islands, rates have rotated between counties, with Kauaʻi recording some of the highest per-capita rates in several recent years. County-level rates are volatile due to small populations, and single-year spikes can reflect individual incidents rather than sustained trends.",
    "useConsolidated": true,
    "dataNote": "Values 1960-2020 come from FBI's pre-NIBRS Crime in the United States annual reports (UCR vintage). Values from 2021 forward come from FBI Crime Data Explorer's NIBRS-era state reconstructions, which sum monthly agency submissions and can differ from UCR-vintage figures by 2-15% on overlap years; visible breaks across the 2020/2021 boundary reflect this methodology shift rather than actual one-year change. Pre-1985 UCR data reflects incomplete voluntary agency reporting; large single-year spikes (e.g., Hawaiʻi 1964, 1971) reflect coverage changes, not actual crime doubling. New York state is absent from 1960-1964 due to a reporting dispute.",
    "hawaii": {
      "1960": 21.8,
      "1961": 24.5,
      "1962": 36.9,
      "1963": 31,
      "1964": 82,
      "1965": 69.1,
      "1966": 83.3,
      "1967": 80,
      "1968": 85.1,
      "1969": 86.1,
      "1970": 121.8,
      "1971": 231.9,
      "1972": 155.5,
      "1973": 155.6,
      "1974": 208,
      "1975": 218.4,
      "1976": 229.3,
      "1977": 224.8,
      "1978": 270.1,
      "1979": 289.7,
      "1980": 299.5,
      "1981": 247.6,
      "1982": 255.7,
      "1983": 252.1,
      "1984": 231.9,
      "1985": 219.4,
      "1986": 245.2,
      "1987": 263.3,
      "1988": 257.1,
      "1989": 270.1,
      "1990": 280.9,
      "1991": 241.8,
      "1992": 258.4,
      "1993": 261.2,
      "1994": 262.2,
      "1995": 295.6,
      "1996": 280.6,
      "1997": 277.9,
      "1998": 246.9,
      "1999": 234.9,
      "2000": 243.8,
      "2001": 254,
      "2002": 262.9,
      "2003": 272.3,
      "2004": 254.6,
      "2005": 256,
      "2006": 280.7,
      "2007": 276.1,
      "2008": 272.5,
      "2009": 274.1,
      "2010": 264.3,
      "2011": 251.4,
      "2012": 239.2,
      "2013": 251.6,
      "2014": 259.2,
      "2015": 293.4,
      "2016": 309.2,
      "2017": 250.6,
      "2018": 248.6,
      "2019": 285.5,
      "2020": 254.2,
      "2021": 269.9,
      "2022": 275.9,
      "2023": 244.4,
      "2024": 230.5
    },
    "medianSeries": {
      "1960": 97,
      "1961": 88.9,
      "1962": 91.4,
      "1963": 92.1,
      "1964": 118.6,
      "1965": 135.15,
      "1966": 145.4,
      "1967": 159.05,
      "1968": 198.7,
      "1969": 220.7,
      "1970": 228.45,
      "1971": 272.5,
      "1972": 296.4,
      "1973": 292.2,
      "1974": 351.55,
      "1975": 385.75,
      "1976": 318.5,
      "1977": 348.9,
      "1978": 367.8,
      "1979": 413.65,
      "1980": 427.75,
      "1981": 439.2,
      "1982": 413.75,
      "1983": 386.45,
      "1984": 398.7,
      "1985": 411.45,
      "1986": 426.4,
      "1987": 420.15,
      "1988": 451.85,
      "1989": 472.7,
      "1990": 515.65,
      "1991": 549.5,
      "1992": 535,
      "1993": 509.35,
      "1994": 515.95,
      "1995": 512.6,
      "1996": 484.3,
      "1997": 456.7,
      "1998": 429.75,
      "1999": 397.35,
      "2000": 376.75,
      "2001": 379.95,
      "2002": 366.7,
      "2003": 364.65,
      "2004": 364.15,
      "2005": 372,
      "2006": 386.35,
      "2007": 367.6,
      "2008": 352.95,
      "2009": 337.55,
      "2010": 323.5,
      "2011": 323.1,
      "2012": 333.75,
      "2013": 325.95,
      "2014": 325.1,
      "2015": 348.3,
      "2016": 370.25,
      "2017": 357.6,
      "2018": 344.3,
      "2019": 349.65,
      "2020": 373.7,
      "2021": 338.65,
      "2022": 362.45,
      "2023": 351.8,
      "2024": 327.8
    },
    "policyLevers": "<ul class='cn-focus-list'><li><strong>Community and geography</strong> · Tight-knit multigenerational households and island isolation both suppress violent crime; comprehensive gun laws limit the most lethal weapon types. <a href=\"https://pmc.ncbi.nlm.nih.gov/articles/PMC8460118/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li><li><strong>Violence intervention</strong> · Community violence intervention programs and youth-facing workers drove recent national crime declines; federal CVI funding has since been cut roughly in half. <a href=\"https://counciloncj.org/whats-driving-the-drop-in-homicide-how-low-might-it-go/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li><li><strong>Treatment and housing access</strong> · No long-term dual-diagnosis residential treatment exists outside Oʻahu <a href=\"https://health.hawaii.gov/substance-abuse/files/2023/05/Draft-State-Plan-2022-May-2023-Edition.pdf\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; housing instability is linked to increased violence in neglected neighborhoods. <a href=\"https://www.brookings.edu/articles/want-to-reduce-violence-invest-in-place/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li></ul>",
    "nextUpdate": "Oct",
    "rankHistoryNarrative": {
      "summary": "Hawaiʻi has typically ranked in the top quarter of states for safety since 1985.",
      "mode": "protect",
      "benchmarks": [
        {
          "state": "Maine",
          "text": "Like Hawaiʻi, Maine is geographically isolated with low population density and close-knit, multigenerational communities. Maine has ranked #1 or #2 safest state in terms of violent crime for most of the past three decades and has maintained that position through significant economic and demographic shifts. The core factors are consistent: low population density that limits anonymity, very low gang activity, and community-centered law enforcement that emphasizes relationship-based approaches over reactive response.",
          "source": {
            "label": "FBI Crime Data Explorer - FBI UCR",
            "url": "https://cde.ucr.cjis.gov/"
          }
        }
      ],
      "explore": [
        "Maine's low rates reflect geographic isolation and community-based policing; New Mexico's deterioration tracks drug trafficking expansion and rural service erosion. Hawaiʻi shares Maine's isolation advantage but also faces New Mexico's methamphetamine exposure on neighbor islands, where service gaps are widest."
      ],
      "caution": {
        "state": "New Mexico",
        "text": "New Mexico shares Hawaiʻi's exposure to methamphetamine supply chains and rural service gaps on its outer communities. New Mexico ranked near the national midpoint for violent crime through the 1990s and now consistently ranks last. The deterioration tracks the expansion of drug trafficking corridors through the state, the hollowing out of rural social services, and a collapse of community trust in law enforcement. New Mexico's drug trafficking exposure and rural service erosion represent a pattern of preconditions Hawaiʻi recognizes in its own methamphetamine supply chain and neighbor island service gaps.",
        "source": {
          "label": "New Mexico Uniform Crime Reports - NM Department of Public Safety",
          "url": "https://www.dps.nm.gov/107-uniform-crime-reports/"
        }
      }
    }
  },
  "property_crime_rate": {
    "area": "Safety & Health",
    "metric": "Property Crime Rate",
    "officialName": "Counts burglary, larceny-theft, and motor vehicle theft. Rate per 100,000 residents.",
    "sourceCategory": "federal",
    "unit": "per 100K",
    "unitLabel": "per 100K residents",
    "goodDirection": "down",
    "source": "FBI Crime Data Explorer",
    "sourceUrl": "https://cde.ucr.cjis.gov/",
    "whyItMatters": "Property crime brings direct financial loss and insecurity to households and businesses.",
    "scale": {
      "denominator": 1441387,
      "denominatorRounded": 1440000,
      "unit": "residents",
      "countLabel": "reported property-crime incidents a year",
      "year": 2023,
      "source": "Census NST-EST2024 (2023 estimate)"
    },
    "howToRead": "Both lines rose from 1960, peaking around 1980, then fell steeply. Hawaiʻi has been consistently worse than the median throughout.",
    "potentialDrivers": "Hawaiʻi's property crime rate has fallen 68% over 30 years but still ranks worse than most states. Tourist density is the floor. A <a href=\"https://popcenter.asu.edu/sites/g/files/litvpz3631/files/problems/crimes_against_tourists/PDFs/Chesney-Lind_Lind_1986.pdf\" target=\"_blank\" rel=\"noopener\">1986 study by Chesney-Lind and Lind</a> of Honolulu police data found tourists were more likely than residents to be victims of burglary, larceny, and robbery, while residents bore the brunt of murder and aggravated assault. A <a href=\"https://www.ojp.gov/library/publications/ecology-business-environments-and-consequences-crime\" target=\"_blank\" rel=\"noopener\">2024 NIJ-sponsored study</a> found that higher commercial-mixing density on a block was linked to 35–95% more crime, matching Hawaiʻi's pattern of residents and visitors sharing the same high-traffic spaces (<a href=\"https://www.hawaiitourismauthority.org/media/7785/hta-oahu-dmap.pdf\" target=\"_blank\" rel=\"noopener\">HTA's Oʻahu Destination Management Plan</a>). Drug-driven theft is the second factor. The <a href=\"https://crimestats.hawaii.gov/\" target=\"_blank\" rel=\"noopener\">Hawaiʻi Crime Dashboard</a> shows larceny and motor vehicle theft account for most property crime volume, both categories where methamphetamine dependency is a well-documented driver.",
    "countyNarrative": "Maui County recorded the highest per-capita property crime rate among the four counties through 2021, likely reflecting its high visitor-to-resident ratio and resort-corridor theft concentration. Honolulu County accounts for the largest volume by far, driven by urban density and Waikiki's concentrated visitor foot traffic. Hawaiʻi County and Kauaʻi County post lower rates, though Kauaʻi saw a decline of over 60% from 2010 to 2021, while Hawaiʻi County declined roughly 30% as statewide rates fell.",
    "useConsolidated": true,
    "dataNote": "Values 1960-2020 come from FBI's pre-NIBRS Crime in the United States annual reports (UCR vintage). Values from 2021 forward come from FBI Crime Data Explorer's NIBRS-era state reconstructions, which sum monthly agency submissions and can differ from UCR-vintage figures on overlap years; visible breaks across the 2020/2021 boundary reflect this methodology shift rather than actual one-year change. Pre-1985 UCR data reflects incomplete voluntary agency reporting; New York is absent from 1960-1964 due to a reporting dispute.",
    "hawaii": {
      "1960": 2276.5,
      "1961": 2497.7,
      "1962": 2509.5,
      "1963": 2511.5,
      "1964": 2708.1,
      "1965": 3183.3,
      "1966": 3419.9,
      "1967": 3639.4,
      "1968": 4353.2,
      "1969": 4446.7,
      "1970": 5143.3,
      "1971": 5226.9,
      "1972": 4457,
      "1973": 4803.1,
      "1974": 5863.6,
      "1975": 5808.2,
      "1976": 6092.7,
      "1977": 6321.3,
      "1978": 6866,
      "1979": 6957.8,
      "1980": 7182.8,
      "1981": 6295.8,
      "1982": 6328.6,
      "1983": 5557.5,
      "1984": 5252.5,
      "1985": 4981.1,
      "1986": 5426.2,
      "1987": 5554.7,
      "1988": 5731.9,
      "1989": 6000.3,
      "1990": 5825.8,
      "1991": 5728.6,
      "1992": 5853.5,
      "1993": 6015.8,
      "1994": 6418.3,
      "1995": 6902.9,
      "1996": 6304,
      "1997": 5745,
      "1998": 5086.1,
      "1999": 4600.5,
      "2000": 4955.1,
      "2001": 5120.5,
      "2002": 5801.4,
      "2003": 5274.6,
      "2004": 4795.5,
      "2005": 4800,
      "2006": 4219.9,
      "2007": 4119.3,
      "2008": 3566.5,
      "2009": 3668.7,
      "2010": 3349.6,
      "2011": 3183.6,
      "2012": 3075.2,
      "2013": 3584.4,
      "2014": 3420.3,
      "2015": 3184.8,
      "2016": 2992.7,
      "2017": 2836.1,
      "2018": 2888,
      "2019": 2841.2,
      "2020": 2411.4,
      "2021": 2673.7,
      "2022": 2591.4,
      "2023": 2196.8,
      "2024": 2052.6
    },
    "medianSeries": {
      "1960": 1469.1,
      "1961": 1502.7,
      "1962": 1564.7,
      "1963": 1678.1,
      "1964": 1902.2,
      "1965": 1904.2,
      "1966": 2114.45,
      "1967": 2343.95,
      "1968": 2594.6,
      "1969": 2888.65,
      "1970": 3269.25,
      "1971": 3337.5,
      "1972": 3172.1,
      "1973": 3294.95,
      "1974": 3910.3,
      "1975": 4371.8,
      "1976": 4372.15,
      "1977": 4078.9,
      "1978": 4220.05,
      "1979": 4607.25,
      "1980": 4844.15,
      "1981": 4872,
      "1982": 4628.65,
      "1983": 4178.65,
      "1984": 4029,
      "1985": 4214.55,
      "1986": 4362.25,
      "1987": 4472.6,
      "1988": 4365.85,
      "1989": 4477.8,
      "1990": 4666.65,
      "1991": 4724.55,
      "1992": 4411.3,
      "1993": 4284.25,
      "1994": 4294.25,
      "1995": 4324.75,
      "1996": 4240.65,
      "1997": 4214.45,
      "1998": 4012.05,
      "1999": 3701.5,
      "2000": 3646.05,
      "2001": 3588.2,
      "2002": 3568.1,
      "2003": 3529.4,
      "2004": 3413.75,
      "2005": 3376.5,
      "2006": 3399.05,
      "2007": 3128.15,
      "2008": 2936.8,
      "2009": 2894.6,
      "2010": 2761.15,
      "2011": 2702.3,
      "2012": 2754.2,
      "2013": 2730.65,
      "2014": 2553,
      "2015": 2622.85,
      "2016": 2582.05,
      "2017": 2426.7,
      "2018": 2248.05,
      "2019": 2112.25,
      "2020": 1959.05,
      "2021": 1616.35,
      "2022": 1857.7,
      "2023": 1811.6,
      "2024": 1687
    },
    "policyLevers": "<ul class='cn-focus-list'><li><strong>Treatment and diversion</strong> · Drug courts reduce recidivism roughly 12 percentage points on average <a href=\"https://pmc.ncbi.nlm.nih.gov/articles/PMC3859122/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; methamphetamine drives a disproportionate share of theft-driven crime in Hawaiʻi, yet only a fraction of those needing treatment receive it. <a href=\"https://pmc.ncbi.nlm.nih.gov/articles/PMC8111791/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li><li><strong>Place-based prevention</strong> · Hot-spots policing produces statistically significant property-crime reductions without displacing crime to nearby areas <a href=\"https://pmc.ncbi.nlm.nih.gov/articles/PMC8356500/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; improved street lighting cuts crime roughly 21 percent in treated areas, partly through stronger more eyes on the block. <a href=\"https://www.campbellcollaboration.org/review/effects-of-improved-street-lighting-on-crime/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li><li><strong>Reentry and supervision</strong> · Hawaiʻi’s Justice Reinvestment Initiative shifted resources toward supervising higher-risk individuals and community treatment <a href=\"https://csgjusticecenter.org/projects/justice-reinvestment/past-states/hawaii/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; recidivism falls when reentry programs pair housing stability with employment support and behavioral health services. <a href=\"https://pmc.ncbi.nlm.nih.gov/articles/PMC3859122/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li></ul>",
    "nextUpdate": "Oct",
    "rankHistoryNarrative": {
      "summary": "Hawaiʻi has ranked #37 to #45 for most of the past 40 years. Tourist density concentrates theft targets, and methamphetamine-related theft-driven crime drives a disproportionate share of incidents.",
      "mode": "learn",
      "benchmarks": [
        {
          "state": "New York",
          "text": "Like Hawaiʻi, New York has high-density tourist and commercial areas that concentrate property crime targets. New York adopted CompStat in 1994, a data-driven policing system requiring precinct-level crime analysis and targeted resource deployment. The state paired enforcement accountability with drug courts and mental health diversion programs, reducing the repeat-offender population driving the most chronic property crime. New York's property crime rate fell over 50 percent between 1995 and 2015.",
          "source": {
            "label": "CompStat: An Important Administrative Innovation in Policing - Harvard Kennedy School",
            "url": "https://www.hks.harvard.edu/publications/sizing-compstat-important-administrative-innovation-policing"
          }
        }
      ],
      "explore": [
        "New York targeted resources where crime concentrates most; Oregon's decriminalization without treatment capacity backfired. In Hawaiʻi, visitor-targeted theft from rental vehicles and hotel rooms concentrates in high-visitor corridors. Hawaiʻi's drug court system already operates in all four counties with recidivism rates of roughly 25 percent versus 50 to 60 percent for the general population."
      ],
      "caution": {
        "state": "Oregon",
        "text": "Oregon, like Hawaiʻi, faces drug-related theft-driven crime as a significant share of its property crime volume. Oregon's Measure 110 (2020) decriminalized possession of small amounts of drugs and redirected cannabis tax revenue to treatment. Property crime rose significantly in subsequent years, and Oregon reversed the policy in 2024. The reversal followed a documented failure to build treatment capacity at the scale the policy assumed.",
        "source": {
          "label": "Oregon Starts Drug Possession Recriminalization - OPB",
          "url": "https://www.opb.org/article/2024/09/01/oregon-starts-drug-possession-recriminalization/"
        }
      }
    }
  },
  "pcp_per_100k": {
    "area": "Safety & Health",
    "metric": "Primary Care Physicians (civilian)",
    "officialName": "Non-federal primary care doctors (MDs and DOs) per 100,000 civilians, counting all primary care specialties.",
    "sourceCategory": "federal",
    "unit": "per 100K",
    "unitLabel": "per 100K residents",
    "goodDirection": "up",
    "source": "HRSA Area Health Resource File",
    "sourceUrl": "https://data.hrsa.gov/topics/health-workforce/nchwa/ahrf",
    "whyItMatters": "Having enough primary care doctors affects whether people can see one before problems become emergencies. The count excludes military physicians, so a change of 1 per 100K represents roughly 14 additional civilian-serving primary care doctors.",
    "scale": {
      "denominator": 1370000,
      "denominatorRounded": null,
      "unit": "civilians",
      "countLabel": "civilian-serving primary care doctors in Hawaiʻi",
      "year": 2023,
      "source": "Census ACS 2023 civilian population (non-military denominator)"
    },
    "howToRead": "Hawaiʻi's line runs flat and better than the median for the past decade. Military doctors are excluded.",
    "potentialDrivers": "The statewide count masks a sharp Oʻahu-vs-neighbor-island divide, with rural communities on Hawaiʻi Island and Molokaʻi facing provider deserts the average hides. <a href=\"https://www.hawaii.edu/govrel/docs/reports/2025/hrs304a-1704_2025_hawaii-medical-education-council_annual-report_508.pdf\">The Hawaiʻi Medical Education Council reported in 2025</a> that many JABSOM residency programs retain more than 75 percent of graduates in-state, providing a steady local supply. Yet the <a href=\"https://ahec.hawaii.edu/_docs/annual-physician-workforce-report-2024.pdf\">2024 Physician Workforce Report</a> found the state still needed 152 additional full-time primary-care physicians, and that 24 percent of practicing physicians were 65 or older, signaling an accelerating retirement wave. <a href=\"https://uhero.hawaii.edu/wp-content/uploads/2024/04/HawaiisEconomicGeographyHealthcare.pdf\">UHERO noted</a> that Hawaiʻi's isolation and high living costs concentrate care in central locations and make neighbor-island recruitment harder, and a <a href=\"https://health.hawaii.gov/shpda/files/2025/06/Primary-Care-AHEAD-Overview-20250506-rev.pdf\">2025 SHPDA overview</a> confirmed that high debt, lower pay relative to costs, and housing barriers continue to pull some physicians toward the mainland.",
    "countyNarrative": "Honolulu County holds the large majority of the state's civilian primary care physicians, anchored by JABSOM, The Queen's Medical Center, and other tertiary facilities that attract and retain providers. Maui County faces the most acute documented shortage, with the <a href=\"https://ahec.hawaii.edu/_docs/annual-physician-workforce-report-2024.pdf\">2024 Workforce Report</a> finding it 32 percent below its needed physician staffing. Hawaiʻi County has multiple federally designated Health Professional Shortage Areas, particularly in rural and remote communities on the west and south coasts. Kauaʻi County has a small physician base relative to its population, with limited specialty backup and a high dependence on inter-island referrals to Oʻahu.",
    "useConsolidated": true,
    "dataNote": "Counts civilian physicians only. Military facilities serve a significant share of the population in Hawaiʻi but are excluded.",
    "hawaii": {
      "2010": 89.2,
      "2011": 88.3,
      "2012": 87.1,
      "2013": 90.2,
      "2014": 89.9,
      "2015": 91.2,
      "2016": 91.5,
      "2017": 91.1,
      "2018": 92.1,
      "2019": 93.9,
      "2020": 96.7,
      "2021": 93,
      "2022": 86.8,
      "2023": 88.1
    },
    "medianSeries": {
      "2010": 74.9,
      "2011": 75.5,
      "2012": 75.9,
      "2013": 77.4,
      "2014": 77.4,
      "2015": 77.5,
      "2016": 77.5,
      "2017": 77.6,
      "2018": 78.05,
      "2019": 79.15,
      "2020": 79.05,
      "2021": 76.8,
      "2022": 77.65,
      "2023": 78.65
    },
    "policyLevers": "<ul class='cn-focus-list'><li><strong>Training pipeline</strong> · JABSOM retains 75-90% of family-medicine graduates in-state; a new Kauaʻi track aims to place physicians on neighbor islands. <a href=\"https://pmc.ncbi.nlm.nih.gov/articles/PMC11519901/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a> Nationally, 35%+ of primary care physicians are 55 or older, narrowing the replacement window. <a href=\"https://bhw.hrsa.gov/sites/default/files/bureau-health-workforce/data-research/State-of-the-Primary-Care-Workforce-2025.pdf\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li><li><strong>Retention and burnout</strong> · Hawaiʻi’s physician workforce averages age 54, two years above the national mean, and 10 percent of providers retired or closed practices during the pandemic <a href=\"https://pmc.ncbi.nlm.nih.gov/articles/PMC9036453/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; the statewide shortage is between 710 and 1,008 full-time physician positions, with neighbor-island gaps reaching 30-50 percent.</li><li><strong>Telehealth and rural access</strong> · A $189 million federal Rural Health Transformation award will fund a statewide telehealth network and workforce incentives through 2030 <a href=\"https://governor.hawaii.gov/newsroom/office-of-the-governor-news-release-hawaii-awarded-188-9-million-to-transform-rural-healthcare/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; Medicaid reimbursement rates below cost discourage practice in high-need communities. <a href=\"https://pmc.ncbi.nlm.nih.gov/articles/PMC11519901/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li></ul>",
    "nextUpdate": "Jun",
    "rankHistoryNarrative": {
      "summary": "Hawaiʻi has ranked in the top 10 every year on record, about 14 percent better than the median. Neighbor island communities hold federal Health Professional Shortage Area designations despite the strong statewide number.",
      "mode": "protect",
      "benchmarks": [
        {
          "state": "Vermont",
          "text": "Like Hawaiʻi, Vermont has a rural, geographically dispersed population that makes provider distribution a persistent challenge. Vermont has ranked in the top 5 for primary care physician density for most of the past two decades despite having one of the most rural and geographically dispersed populations in the country. Vermont's Blueprint for Health (enacted 2006) created a statewide primary care coordination framework with community health teams embedded in practices, improving physician retention by reducing administrative burden. Vermont also operates a loan repayment program requiring multi-year rural service commitments.",
          "source": {
            "label": "Vermont Blueprint for Health - blueprintforhealth.vermont.gov",
            "url": "https://blueprintforhealth.vermont.gov/about-blueprint"
          }
        }
      ],
      "explore": [
        "Vermont retained rural physicians through coordinated primary care teams; Oklahoma lost them as rural hospitals closed. Hawaiʻi actively uses the J-1 visa waiver program to place international medical graduates in shortage areas, but the number of slots requested annually determines reach. Physicians who train at JABSOM or complete residencies on Oʻahu rarely relocate to neighbor islands, a pipeline gap that has been proposed but not sustained."
      ],
      "caution": {
        "state": "Oklahoma",
        "text": "Oklahoma's neighbor-island-like rural communities face the same financial pressures as Hawaiʻi's outer-island hospitals. Oklahoma ranked in the top half for primary care physician density through the 2000s and has since declined as rural hospital closures reduced the practice environments that attract physicians. Fourteen rural hospitals closed in Oklahoma between 2010 and 2023, and physicians do not locate near closed hospitals. Hawaiʻi's neighbor island hospitals face similar financial pressures, and their closure would accelerate the physician shortage the J-1 program currently offsets.",
        "source": {
          "label": "Health Professional Shortage Area Designation - Oklahoma.gov",
          "url": "https://oklahoma.gov/health/health-education/community-outreach/community-development-services/office-of-primary-care-and-rural-health-development/health-professional-shortage-area-designation.html"
        }
      }
    }
  },
  "uninsured_rate": {
    "area": "Safety & Health",
    "metric": "Uninsured Rate",
    "officialName": "Share of residents under 65 with no health insurance coverage of any kind.",
    "sourceCategory": "federal",
    "unit": "%",
    "unitLabel": "lack health insurance",
    "goodDirection": "down",
    "source": "Census ACS / KFF",
    "sourceUrl": "https://www.kff.org/topic/uninsured/",
    "whyItMatters": "Without insurance, routine doctor visits, medicine, and treatment become too expensive for many families. Hawaiʻi has about 1.37 million civilians (excluding active-duty military), so each percentage point on this rate represents roughly 14,000 uninsured people.",
    "scale": {
      "denominator": 1370000,
      "denominatorRounded": 1370000,
      "unit": "civilians",
      "year": 2023,
      "source": "Census ACS 2023 S2701 (civilian noninstitutionalized population, excludes active-duty military)"
    },
    "howToRead": "Both lines have fallen since 2012. Hawaiʻi has been consistently better than the median throughout, and the gap persists.",
    "potentialDrivers": "The <a href=\"https://labor.hawaii.gov/dcd/files/2023/05/PHC-highlights-rev-2025.03.pdf\">Prepaid Health Care Act</a> (1974) made Hawaiʻi the first state to require employer health insurance, decades before the ACA. The mandate covers workers at 20+ hours per week, with employee contributions capped at 1.5 percent of wages. Public coverage backstops it: <a href=\"https://medquest.hawaii.gov/content/dam/formsanddocuments/med-quest/1115-demonstration-post-award-public-forum/Hawaii%201115%20W%20Annual%20CMS%20Monitoring%20Rpt_FFY2024%20FINAL%2001.pdf\">Med-QUEST renewed roughly 475,000 Medicaid members</a> in late 2024, and <a href=\"https://www.cms.gov/files/document/health-insurance-exchanges-2025-open-enrollment-report.pdf\">CMS reported</a> 24,606 marketplace plan selections for 2025, up 11 percent. Gaps remain: the mandate excludes lower-hour workers, and a <a href=\"https://health.hawaii.gov/opppd/files/2024/10/SHIP-Access-to-Health-Services-2024.pdf\">2024 Hawaiʻi DOH access report</a> found immigrants, migrant workers, Native Hawaiians, and rural residents still face coverage barriers.",
    "countyNarrative": "Honolulu County has the lowest uninsured rate among the four counties, reflecting its larger share of full-time employer-covered workers and proximity to public health infrastructure. Hawaiʻi County (Big Island) often records the highest uninsured rate, though the position rotates among the three neighbor island counties depending on the year, driven by a more rural economy, higher rates of agriculture and lower-wage work outside the Prepaid Health Care Act's reach, and greater barriers among immigrant and migrant worker populations. Maui County's rate has been affected by wildfire displacement since 2023, with coverage disruptions among residents who lost employment or housing. Kauaʻi County falls in a moderate range, with rural communities on the north shore and west side facing similar access barriers to those on the Big Island.",
    "useConsolidated": true,
    "hawaii": {
      "2010": 0.079,
      "2011": 0.071,
      "2012": 0.069,
      "2013": 0.067,
      "2014": 0.053,
      "2015": 0.04,
      "2016": 0.035,
      "2017": 0.038,
      "2018": 0.041,
      "2019": 0.042,
      "2021": 0.039,
      "2022": 0.035,
      "2023": 0.032,
      "2024": 0.035
    },
    "medianSeries": {
      "2010": 0.143,
      "2011": 0.1425,
      "2012": 0.1375,
      "2013": 0.135,
      "2014": 0.1025,
      "2015": 0.0865,
      "2016": 0.08,
      "2017": 0.08,
      "2018": 0.08,
      "2019": 0.08,
      "2021": 0.0735,
      "2022": 0.0675,
      "2023": 0.066,
      "2024": 0.073
    },
    "policyLevers": "<ul class='cn-focus-list'><li><strong>Employer mandate foundation</strong> · The 1974 Prepaid Health Care Act remains the only state employer health-insurance mandate in the U.S., anchoring coverage for workers who log 20 or more hours per week <a href=\"https://laborcenter.berkeley.edu/hawaiis-prepaid-health-care-act/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; weak enforcement and a frozen 20-hour threshold leave part-time and gig workers exposed. <a href=\"https://pmc.ncbi.nlm.nih.gov/articles/PMC8634008/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li><li><strong>Medicaid and marketplace reach</strong> · States that expanded Medicaid cut low-income uninsured rates by more than half between 2013 and 2022 <a href=\"https://www.kff.org/report-section/the-effects-of-medicaid-expansion-under-the-aca-updated-findings-from-a-literature-review-report/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; Hawaiʻi’s Med-QUEST enrollment grew 62 percent after expansion, but post-pandemic unwinding disenrolled millions nationally and coverage churn remains a risk. <a href=\"https://pmc.ncbi.nlm.nih.gov/articles/PMC12514626/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li><li><strong>Outreach and equity gaps</strong> · Navigator-assisted enrollment sharply raises sign-up rates among limited-English and immigrant communities <a href=\"https://www.macpac.gov/subtopic/changes-in-coverage-and-access/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; Migrants from Pacific Island nations (Micronesia, Marshall Islands, Palau) who shifted to marketplace plans saw mortality rise 43 percent, underscoring the cost of coverage gaps for vulnerable populations. <a href=\"https://pmc.ncbi.nlm.nih.gov/articles/PMC8634008/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li></ul>",
    "nextUpdate": "Sep",
    "rankHistoryNarrative": {
      "summary": "Hawaiʻi has ranked #1 or #2 in health coverage every year on record. The rate dipped after ACA expansion and ticked up in 2024 as pandemic-era continuous Medicaid enrollment ended.",
      "mode": "protect",
      "benchmarks": [
        {
          "state": "Massachusetts",
          "text": "Like Hawaiʻi, Massachusetts built coverage on an employer-based mandate that predates the ACA. Massachusetts has ranked #1 in health coverage since 2008. Chapter 58 (2006, RomneyCare) combined an individual coverage mandate, employer contribution requirements, and Medicaid expansion, reducing the uninsured rate from 10 percent in 2005 to below 3 percent by 2010. Massachusetts retained its lead after the ACA because its mandate and state-level premium subsidies cover a gap population that earns too much for Medicaid but may forgo coverage without an incentive.",
          "source": {
            "label": "Chapter 58, An Act Providing Access to Affordable, Quality, Accountable Health Care (2006)",
            "url": "https://malegislature.gov/Laws/SessionLaws/Acts/2006/Chapter58"
          }
        }
      ],
      "explore": [
        "Massachusetts strengthened coverage by layering state-level subsidies over its employer mandate; Tennessee shows how budget pressure can unravel a broad public program. The 2024 uptick reflects the end of pandemic-era continuous Medicaid enrollment, not a structural change, but it highlights dependence on federal enrollment rules the state does not control."
      ],
      "caution": {
        "state": "Tennessee",
        "text": "Tennessee, like Hawaiʻi, relied on a broad public coverage program whose fiscal sustainability was ultimately tested. Tennessee operated TennCare, one of the broadest Medicaid programs in the country through the early 2000s, covering roughly 1.3 million residents and ranking among the highest-coverage states. Facing budget pressures, Tennessee disenrolled roughly 190,000 members in 2005 in a single year. Uninsured rates rose sharply and Tennessee fell from near the top of coverage rankings to worse than average.",
        "source": {
          "label": "TennCare Disenrollment Led To Increased Eviction Filings In Tennessee (Health Affairs, 2023)",
          "url": "https://www.healthaffairs.org/doi/10.1377/hlthaff.2023.00973"
        }
      }
    }
  },
  "suicide_rate": {
    "area": "Safety & Health",
    "metric": "Suicide Rate",
    "officialName": "Death rate for intentional self-harm per 100,000 residents, age-adjusted so states with different age distributions can be compared fairly.",
    "sourceCategory": "federal",
    "unit": "per 100K",
    "unitLabel": "per 100K residents",
    "goodDirection": "down",
    "source": "CDC NCHS, National Vital Statistics System",
    "sourceUrl": "https://www.cdc.gov/suicide/facts/data.html",
    "whyItMatters": "Suicide reflects the most severe mental-health crisis and means lives lost. Against Hawaiʻi's 1.4 million residents, every 1 per 100K on this rate represents roughly 14 more lives lost in a year.",
    "scale": {
      "denominator": 1441387,
      "denominatorRounded": 1440000,
      "unit": "residents",
      "countLabel": "lives lost to suicide in a year",
      "year": 2023,
      "source": "Census NST-EST2024 (2023 estimate)"
    },
    "howToRead": "Hawaiʻi has stayed better than the median for most of the past 25 years. The gap is volatile from year to year due to small population, so focus on the multi-year trend rather than single-year movements.",
    "potentialDrivers": "Despite the 2nd-lowest uninsured rate and strong PCP access (#8), Hawaiʻi’s suicide rate has risen roughly 70% since 2005, suggesting insurance and primary care alone do not reach the mental health need. Lower firearm involvement in suicide is the most likely reason behind Hawaiʻi's better-than-average rate. <a href=\"https://www.cdc.gov/suicide/facts/data.html\" target=\"_blank\" rel=\"noopener\">CDC reported in 2025</a> that firearms were used in more than 50 percent of U.S. suicides in 2023, making method availability a primary driver of national death rates. Hawaiʻi's <a href=\"https://ag.hawaii.gov/cpja/files/2024/08/Gun-Violence-in-Hawaii-Landscape-Report-5-2024-Email-Version.pdf\" target=\"_blank\" rel=\"noopener\">Attorney General's 2024 gun violence report</a> found that the state's firearm suicide rate is consistently lower than most states and summarized research suggesting that Hawaiʻi's comprehensive gun laws likely reduce firearm suicides. The connection between those laws and the overall rate advantage is supported by the evidence but remains partly inferential, since other factors such as cultural cohesion and access to care also vary across states. Within Hawaiʻi, the statewide average masks meaningful county-level disparities: the <a href=\"https://health.hawaii.gov/substance-abuse/files/2024/08/Statewide-Community-Health-Assessment_Final.pdf\" target=\"_blank\" rel=\"noopener\">Hawaiʻi DOH 2024 Community Health Assessment</a> found that rural counties had higher rates of unmet mental health treatment needs, higher rates of depression and suicidal ideation, and higher suicide death rates than urban areas, pointing to treatment access as a distinct within-state driver. One data note: <a href=\"https://www.cdc.gov/nchs/state-stats/deaths/suicide.html\" target=\"_blank\" rel=\"noopener\">CDC's state-level statistics</a> caution that small state death counts can produce unstable year-to-year rankings, so Hawaiʻi's relative position should be read as an approximate range rather than a fixed rank.",
    "countyNarrative": "Honolulu County, as the state's urban center with the greatest concentration of behavioral health providers, generally posts lower suicide rates than the neighbor islands. Hawaiʻi County and Maui County include significant rural communities with documented gaps in mental health treatment access: the 2024 DOH Community Health Assessment identified transportation barriers, provider shortages, and cost as primary factors driving elevated unmet need on the neighbor islands. Kauaʻi County's small population makes annual rate figures more statistically volatile, though it faces similar access constraints. The DOH assessment also identified Native Hawaiian and Pacific Islander populations as facing disproportionately elevated risk across all counties, a pattern not fully captured by county averages alone.",
    "useConsolidated": true,
    "hawaii": {
      "1999": 11.1,
      "2000": 11.2,
      "2001": 10.9,
      "2002": 9.5,
      "2003": 10.2,
      "2004": 8.9,
      "2005": 8.2,
      "2006": 9,
      "2007": 9.5,
      "2008": 9.7,
      "2009": 12.5,
      "2010": 15,
      "2011": 12.8,
      "2012": 13.1,
      "2013": 11.8,
      "2014": 13.8,
      "2015": 13.5,
      "2016": 12.1,
      "2017": 15.2,
      "2018": 11.76,
      "2019": 15.8,
      "2020": 12.7,
      "2021": 14,
      "2022": 17.1,
      "2023": 15.5,
      "2024": 13.9
    },
    "medianSeries": {
      "1999": 11.2,
      "2000": 11.3,
      "2001": 11.7,
      "2002": 11.95,
      "2003": 11.85,
      "2004": 11.9,
      "2005": 11.95,
      "2006": 12.1,
      "2007": 12.45,
      "2008": 12.65,
      "2009": 13,
      "2010": 13.6,
      "2011": 13.7,
      "2012": 14.05,
      "2013": 14.2,
      "2014": 14.4,
      "2015": 14.8,
      "2016": 15.15,
      "2017": 16.3,
      "2018": 15.69,
      "2019": 16.45,
      "2020": 15.75,
      "2021": 16.2,
      "2022": 16.75,
      "2023": 15.9,
      "2024": 16.3
    },
    "policyLevers": "<ul class='cn-focus-list'><li><strong>Means restriction</strong> · Waiting periods and secure-storage laws are linked to lower firearm suicide rates <a href=\"https://pmc.ncbi.nlm.nih.gov/articles/PMC4566524/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; RAND’s synthesis rates child-access-prevention and waiting-period laws as having supportive-to-moderate evidence for reducing suicide. <a href=\"https://pmc.ncbi.nlm.nih.gov/articles/PMC11630101/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li><li><strong>Crisis services</strong> · The 988 Lifeline handled nearly 5 million contacts in its first year, with prior evaluations linking call-volume increases to lower suicide mortality <a href=\"https://pmc.ncbi.nlm.nih.gov/articles/PMC11733462/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; state funding ranges from $0.30 to $4.73 per capita, and answer-rate gains slipped in year two as demand outpaced capacity. <a href=\"https://www.kff.org/mental-health/988-suicide-crisis-lifeline-two-years-after-launch/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li><li><strong>Youth and cultural access</strong> · School-based screening identifies at-risk students that parents and clinicians miss; 72 percent of flagged youth were not yet in any treatment <a href=\"https://pmc.ncbi.nlm.nih.gov/articles/PMC9384325/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; Native Hawaiian and Pacific Islander high schoolers are 61 percent more likely to attempt suicide than peers nationally, yet 73 percent of NHPI adults with mental health needs go untreated. <a href=\"https://minorityhealth.hhs.gov/mental-and-behavioral-health-native-hawaiianspacific-islanders\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li></ul>",
    "nextUpdate": "Mar",
    "dataLag": 2,
    "rankHistoryNarrative": {
      "summary": "Hawaiʻi has ranked among the lowest states for most of the past 25 years, though its position has weakened since 2017. Dense urban population, cultural emphasis on family interdependence, and comprehensive gun laws that reduce firearm access all contribute.",
      "mode": "protect",
      "benchmarks": [
        {
          "state": "New Jersey",
          "text": "Like Hawaiʻi, New Jersey is a densely populated coastal state with comprehensive gun laws and urban behavioral health infrastructure. New Jersey has ranked #1 or #2 in lowest suicide rate for most of the past decade, consistently below 8 per 100,000. The state operates a statewide network of community mental health centers with designated mobile crisis teams in every county, funded through a combination of state appropriations and federal Community Mental Health Block Grants. New Jersey also maintains a suicide prevention infrastructure office within its Department of Human Services that coordinates school-based programs, crisis line training, and means restriction outreach.",
          "source": {
            "label": "NJ DMHAS Mobile Crisis Outreach Response Teams (MCORTs) - nj.gov",
            "url": "https://www.nj.gov/humanservices/dmhas/crisis/index.shtml"
          }
        }
      ],
      "explore": [
        "New Jersey deployed county-level mobile crisis teams statewide; Montana's rural isolation and provider gaps keep rates high. Hawaiʻi's neighbor island counties face similar access constraints: psychiatric provider capacity is limited, and while telehealth expansion since 2020 has partially closed the gap, rural and outer-island residents still face longer wait times for in-person behavioral health services."
      ],
      "caution": {
        "state": "Montana",
        "text": "Montana shares the rural isolation and limited mental health provider density that Hawaiʻi's neighbor islands face. Montana has ranked among the highest states in suicide mortality for decades. Rural isolation, high rates of firearm ownership, limited mental health provider density, and a small Medicaid population combine to create persistent structural barriers to care. Montana's rate has remained above 25 per 100,000 even as prevention investment increased, illustrating that geography and means access can dominate policy interventions in dispersed populations.",
        "source": {
          "label": "CDC Suicide Rates by State - cdc.gov",
          "url": "https://www.cdc.gov/suicide/facts/rates-by-state.html"
        }
      }
    }
  },
  "acgr": {
    "area": "Education",
    "metric": "High School Graduation Rate",
    "officialName": "Share of 9th-graders who earn a regular diploma within four years, adjusted for students who transfer in or out.",
    "sourceCategory": "federal",
    "unit": "%",
    "unitLabel": "graduate on time (4-year cohort)",
    "goodDirection": "up",
    "source": "NCES",
    "sourceUrl": "https://nces.ed.gov/programs/digest/d23/tables/dt23_219.46.asp",
    "whyItMatters": "Hawaiʻi runs the only statewide school district in the nation, making the State directly accountable. The graduation rate reached 86% in 2022, roughly matching the median of 86.55%.",
    "scale": {
      "denominator": 13000,
      "denominatorRounded": 13000,
      "unit": "public-school seniors in a cohort",
      "countLabel": "seniors graduating on time",
      "year": 2023,
      "source": "NCES Hawaiʻi 4-year cohort (approx.)"
    },
    "howToRead": "Hawaiʻi trailed the median for most of the 2010s and has been closing the gap. A rising line means more students are finishing on time.",
    "potentialDrivers": "The graduation rate (#29) is worse than the median even as NAEP test scores converge. The disconnect suggests dropout risk is concentrated in groups the test-score average does not capture. Attendance barriers and uneven academic readiness appear to hold the rate near the median rather than better. The <a href=\"https://web.archive.org/web/20260207072608/https://educationrecoveryscorecard.org/states/hawaii/\">Education Recovery Scorecard</a> found chronic absenteeism in Hawaiʻi rose from 14 percent in 2019 to 34 percent in 2022 and was slowing academic recovery. A <a href=\"https://boe.hawaii.gov/wp-content/uploads/2024/11/2024-11-21_SAC_school-attendance.pdf\">2024 Board of Education attendance report</a> found 75 percent regular attendance statewide, with lower rates for economically disadvantaged, special education, Native Hawaiian, and Pacific Islander students, and identified transportation, health access, housing instability, disengagement, and school aversion as barriers. The <a href=\"https://boe.hawaii.gov/wp-content/uploads/2024/09/2024-09-19_SAC_Department-of-Education-Report-on-Strategic-Plan-Key-Performance-Indicators-Strive-HI-Report.pdf\">same board's Strive HI report</a> found large proficiency gaps for high-needs students and results that had not yet returned to pre-pandemic levels. One metric note: the four-year cohort rate misses students who graduate in five or more years, so it understates total completers.",
    "countyNarrative": "Hawaiʻi DOE operates as a single statewide district, but graduation rates vary by complex area (roughly island-level) rather than by county. Oʻahu complex areas show the widest internal variation: higher-income suburban complexes consistently exceed the state average while complexes serving lower-income communities in areas such as Waianae and parts of urban Honolulu have historically posted lower rates. Neighbor island complex areas on Maui and Hawaiʻi Island tend to cluster near the state average, though rural communities on both islands face transportation and access barriers that raise chronic absenteeism and lower on-time completion. Kauaʻi's single complex area has generally tracked close to the state rate.",
    "useConsolidated": true,
    "hawaii": {
      "2011": 80,
      "2012": 81,
      "2013": 82.4,
      "2014": 81.8,
      "2015": 81.6,
      "2016": 82.7,
      "2017": 82.7,
      "2018": 84.5,
      "2019": 85.2,
      "2020": 86.3,
      "2021": 86,
      "2022": 86
    },
    "medianSeries": {
      "2011": 80,
      "2012": 81,
      "2013": 82.7,
      "2014": 84.2,
      "2015": 84.85,
      "2016": 85.5,
      "2017": 86.1,
      "2018": 86.35,
      "2019": 86.5,
      "2020": 87.1,
      "2021": 86.4,
      "2022": 86.55
    },
    "policyLevers": "<ul class='cn-focus-list'><li><strong>Early warning systems</strong> · Chicago's 9th-grade on-track indicator found students who pass core courses with no more than one F are 3.5 times more likely to graduate, a stronger predictor than test scores or demographics <a href=\"https://consortium.uchicago.edu/publications/track-indicator-predictor-high-school-graduation\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; an IES evaluation confirmed systematic early warning monitoring reduced chronic absenteeism and course failures. <a href=\"https://ies.ed.gov/use-work/resource-library/report/impact-study/getting-students-track-graduation-impacts-early-warning-intervention-and-monitoring-system-after-one\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li><li><strong>Wraparound supports</strong> · The IES dropout-prevention practice guide identifies individualized support and engaging curricula as having moderate-to-strong evidence <a href=\"https://ies.ed.gov/ncee/wwc/PracticeGuide/24\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; a RAND study of New York City community schools found students graduated at higher rates, with the largest gains for Black, Hispanic, and low-income students. <a href=\"https://learningpolicyinstitute.org/sites/default/files/product-files/Community_Schools_Effective_REPORT.pdf\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li><li><strong>Attendance and reengagement</strong> · Hawaiʻi's Board of Education reported 75 percent regular attendance statewide, identifying transportation, health access, and housing instability as barriers <a href=\"https://boe.hawaii.gov/wp-content/uploads/2024/11/2024-11-21_SAC_school-attendance.pdf\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; nationally, the four-year rate misses students who complete in five or more years. <a href=\"https://nces.ed.gov/programs/digest/d23/tables/dt23_219.46.asp\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li></ul>",
    "nextUpdate": "Aug",
    "rankHistoryNarrative": {
      "summary": "Hawaiʻi ranked #29 in 2022, roughly matching the median. It improved 6 points from 2011 to 2022, but most states improved faster. As the only statewide school district, the graduation rate is directly a function of state policy.",
      "mode": "learn",
      "benchmarks": [
        {
          "state": "Virginia",
          "text": "Like Hawaiʻi, Virginia has a statewide accountability system that makes graduation outcomes a direct function of state policy. Virginia climbed from 87 percent in 2011 to 93 percent in 2022, moving from worse than average to near the top of the national rankings. Virginia restructured its diploma pathways in 2012 to add a Career and Technical Education (CTE) diploma option that allowed students to count industry certifications toward graduation requirements. The state also set a counselor-to-student ratio target of 1:250 and invested in school counselor hiring through the Lottery-funded At-Risk Add-On program. These structural changes created multiple on-ramps to graduation for students who did not fit the traditional academic track.",
          "source": {
            "label": "Career and Technical Education (CTE) - Virginia Department of Education",
            "url": "https://www.doe.virginia.gov/teaching-learning-assessment/instruction/career-and-technical-education-cte"
          }
        }
      ],
      "explore": [
        "Virginia's CTE restructuring worked by giving economically at-risk students a direct school-to-employment path. Hawaiʻi's statewide district allows uniform policy rollout, but the gap between rising test scores and stagnant graduation rates suggests the students most at risk face economic and logistical barriers that academic reforms alone do not reach."
      ],
      "caution": {
        "state": "Louisiana",
        "text": "Louisiana, like Hawaiʻi, faced pressure to show improvement in graduation metrics across a state-managed system. Louisiana increased its reported graduation rate from 67 percent in 2012 to 78 percent by 2016, a 10-point gain in four years. Subsequent analysis found that much of the increase came from aggressive use of credit recovery programs that allowed students to replace failed courses with online alternatives that did not improve tested knowledge. NAEP scores did not rise over the same period, indicating that the graduation rate gain was not matched by learning gains. Louisiana's experience illustrates the risk of rate inflation through pathway manipulation rather than genuine improvement.",
        "source": {
          "label": "Louisiana High School Performance Data - Louisiana Department of Education",
          "url": "https://doe.louisiana.gov/data-and-reports/high-school-performance"
        }
      }
    }
  },
  "ba_or_higher_pct": {
    "area": "Education",
    "metric": "Adults with Bachelor’s Degree+",
    "officialName": "Share of adults age 25 and older who hold a bachelor’s degree or higher.",
    "sourceCategory": "federal",
    "unit": "%",
    "unitLabel": "hold a bachelor's degree or higher",
    "goodDirection": "up",
    "source": "Census ACS / FRED",
    "sourceUrl": "https://fred.stlouisfed.org/",
    "whyItMatters": "College degrees open doors to higher-paying work, and the share of adults who hold one shapes the state's workforce and economy. Hawaiʻi has about 1 million adults age 25 and older, so each percentage point on this rate represents roughly 10,000 people with or without a bachelor's degree.",
    "scale": {
      "denominator": 1000000,
      "denominatorRounded": 1000000,
      "unit": "adults age 25+",
      "year": 2023,
      "source": "Census ACS 2023 (population 25 and over)"
    },
    "howToRead": "Both lines rise steadily over two decades. Hawaiʻi has tracked slightly better than the median throughout.",
    "potentialDrivers": "Attainment (#17) outperforms Hawaiʻi’s K-12 rankings, likely boosted by in-migration of degree-holders for military and federal positions. A <a href=\"https://files.hawaii.gov/dbedt/economic/reports/Detailed-race-characteristics_ACS2021.pdf\">2024 DBEDT report</a> found Japanese, Chinese, Korean, Okinawan, and White residents were more likely to hold bachelor’s degrees, and <a href=\"https://uhero.hawaii.edu/who-is-moving-in-and-out-understanding-migration-trends-in-hawaii/\">UHERO found in 2025</a> that net migration was positive for White and Asian residents in the 25-to-44 age group, adding credential-holders rather than growing them locally. <a href=\"https://uhero.hawaii.edu/beyond-the-price-of-paradise-is-hawaii-being-left-behind/\">UHERO noted in 2026</a> that heavy tourism dependence and limited high-value service exports keep the share better than average but out of the top tier.",
    "countyNarrative": "Honolulu County has the highest bachelor's degree attainment of the four counties, supported by the University of Hawaiʻi at Manoa, federal government and military employment, and a more diverse professional services sector. Maui County is near the state average, with higher-income resort and management occupations partly offset by a large accommodation and food service workforce. Kauaʻi County follows a similar pattern to Maui at a smaller scale. The three neighbor island counties cluster near 30-32%, with Kauaʻi at the lowest in recent data, while Honolulu leads at roughly 37%, reflecting its rural economy anchored in agriculture, small-scale tourism, and a higher share of retirees and lower-wage workers relative to the other counties.",
    "useConsolidated": true,
    "hawaii": {
      "2005": 0.2795,
      "2006": 0.2967,
      "2007": 0.2923,
      "2008": 0.2911,
      "2009": 0.2957,
      "2010": 0.2951,
      "2011": 0.2909,
      "2012": 0.3006,
      "2013": 0.3118,
      "2014": 0.3102,
      "2015": 0.3136,
      "2016": 0.3195,
      "2017": 0.3294,
      "2018": 0.3351,
      "2019": 0.3363,
      "2021": 0.353,
      "2022": 0.3543,
      "2023": 0.37,
      "2024": 0.3776
    },
    "medianSeries": {
      "2005": 0.2559,
      "2006": 0.2551,
      "2007": 0.258,
      "2008": 0.2616,
      "2009": 0.2646,
      "2010": 0.2693,
      "2011": 0.2675,
      "2012": 0.2787,
      "2013": 0.281,
      "2014": 0.2857,
      "2015": 0.2956,
      "2016": 0.2984,
      "2017": 0.3083,
      "2018": 0.3085,
      "2019": 0.3182,
      "2021": 0.338,
      "2022": 0.3443,
      "2023": 0.3477,
      "2024": 0.356
    },
    "policyLevers": "<ul class='cn-focus-list'><li><strong>Transfer and completion</strong> · Only 16 percent of community college students nationally transfer and earn a bachelor's within six years; Hawaiʻi outperforms with a 58 percent graduation rate among those who do transfer <a href=\"https://ccrc.tc.columbia.edu/publications/tracking-transfer-community-college-and-four-year-institutional-effectiveness-in-broadening-bachelors-degree-attainment.html\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; strengthening articulation agreements could close the remaining gap. <a href=\"https://www.hawaii.edu/news/2024/02/15/uh-tops-cc-transfers-earn-bachelor/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li><li><strong>Affordability and aid</strong> · Increased Pell Grant aid boosts associate degree completion, though gains do not automatically translate into higher bachelor's attainment without transfer support <a href=\"https://journals.sagepub.com/doi/abs/10.1177/00915521251322524\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; dual enrollment has grown to 2.5 million students nationally and is associated with higher college enrollment, particularly for low-income students. <a href=\"https://nces.ed.gov/use-work/evaluations/outcomes-associated-dual-enrollment-programs\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li><li><strong>Retention of degree holders</strong> · A DBEDT study found Hawaiʻi-born adults on the mainland are more likely to hold degrees in biology and arts fields, suggesting selective brain drain by industry <a href=\"https://files.hawaii.gov/dbedt/economic/reports/Brain_Drain_Hawaii_Born_Population.pdf\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; UHERO found net migration is positive for some demographics but negative overall for young adults, with cost of living as the primary driver. <a href=\"https://uhero.hawaii.edu/who-is-moving-in-and-out-understanding-migration-trends-in-hawaii/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li></ul>",
    "nextUpdate": "Sep",
    "rankHistoryNarrative": {
      "summary": "Hawaiʻi has ranked near the middle since 2005, just better than median. The rank holds steady because most states improved at similar rates. In-migration of college-educated military and federal employees inflates the attainment rate.",
      "mode": "protect",
      "benchmarks": [
        {
          "state": "Colorado",
          "text": "Like Hawaiʻi, Colorado attracts lifestyle-driven in-migration, but Colorado also built a deliberate pipeline from state universities to local employers. Colorado has ranked #1 or #2 in bachelor's degree attainment for most of the past decade, reaching 45 percent of adults by 2023. Colorado's rate reflects a combination of a large in-state public university system, a technology and aerospace sector that attracts graduates, and relatively low tuition at flagship institutions through the College Opportunity Fund voucher program enacted in 2004. The tech economy creates a self-reinforcing cycle: degree-holders move to Colorado for jobs, raising attainment, which then attracts more employers.",
          "source": {
            "label": "College Opportunity Fund (COF) Stipend - Colorado Department of Higher Education",
            "url": "https://cdhe.colorado.gov/college-opportunity-fund-cof-stipend"
          }
        }
      ],
      "explore": [
        "Colorado built deliberate university-to-employer pipelines alongside lifestyle-driven in-migration. Hawaiʻi's attainment is also partly a product of military and federal in-migration, but UH system enrollment has declined through the early 2020s. Sustained gains depend on whether resident students complete degrees in-state rather than leaving or forgoing college."
      ],
      "caution": {
        "state": "West Virginia",
        "text": "West Virginia illustrates the risk of single-sector decline driving out degree-holders, a dynamic Hawaiʻi's tourism dependence could replicate. West Virginia ranked near the bottom in bachelor's degree attainment through the 2010s and early 2020s, with a rate near 22 percent. The decline of the coal and manufacturing economy removed well-paying jobs that did not require degrees, but the resulting out-migration hit educated workers disproportionately. Workers with degrees left for better labor markets, leaving behind a population with lower average attainment. West Virginia illustrates that attainment rates can fall or stagnate when an economy fails to retain the graduates it produces.",
        "source": {
          "label": "Educational Attainment: West Virginia - U.S. Census Bureau QuickFacts",
          "url": "https://www.census.gov/quickfacts/fact/table/WV/EDU635223"
        }
      }
    }
  },
  "naep_math_8": {
    "area": "Education",
    "metric": "NAEP 8th Grade Math",
    "officialName": "Average math score for 8th-graders on the National Assessment of Educational Progress, the nation's report card, given every two years.",
    "sourceCategory": "federal",
    "unit": "score",
    "unitLabel": "scale score (0-500)",
    "goodDirection": "up",
    "source": "NAEP / Nation's Report Card",
    "sourceUrl": "https://www.nationsreportcard.gov/mathematics/states/scores/?grade=8",
    "whyItMatters": "8th-grade math shows whether students are building skills needed for later coursework and many careers.",
    "howToRead": "Scores are on a 0-500 scale; 262 is 'Basic,' 299 is 'Proficient.' Both lines peaked around 2013 and have declined since, reflecting a nationwide post-pandemic slide. Hawaiʻi's gap with the average has narrowed.",
    "potentialDrivers": "Hawaiʻi’s math scores have steadily converged with the median over two decades while many mainland states declined. Missed learning time and concentrated student need are the most likely contributors. <a href=\"https://www.hawaiipublicschools.org/DOE%20Forms/StriveHI2024/StriveHIStateReport2024.pdf\">HIDOE's 2024 Strive HI report</a> found only 75 percent of students attended at least 90 percent of school days and 59 percent were in at least one high-needs group. A <a href=\"https://nces.ed.gov/nationsreportcard/blog/attendance_and_naep_2022_score_declines.aspx\">2023 NCES analysis</a> found a clear association between rising absenteeism and lower NAEP scores, while cautioning the link is not proof of causation. The <a href=\"https://nces.ed.gov/nationsreportcard/subject/publications/stt2024/pdf/2024219HI8.pdf\">2024 NCES Hawaiʻi snapshot</a> showed economically disadvantaged eighth-graders scoring 256 versus 280 for non-disadvantaged peers, a 24-point gap that pulls down the statewide average. One important counterpoint: <a href=\"https://nces.ed.gov/use-work/resource-library/report/compendium/learn-about-new-condition-education-2025-part-i\">NCES reported in 2025</a> that more U.S. eighth-graders were below NAEP Basic in 2024 than in 2019 nationally, placing Hawaiʻi's result inside a broader post-pandemic math slump rather than a state-specific failure.",
    "useConsolidated": true,
    "dataNote": "NAEP is administered every 2 years. Hawaiʻi did not participate in some earlier rounds.",
    "hawaii": {
      "1990": 251.02,
      "1992": 257.41,
      "1996": 262.13,
      "2000": 262.77,
      "2003": 265.73,
      "2005": 265.63,
      "2007": 268.77,
      "2009": 273.76,
      "2011": 277.84,
      "2013": 281.41,
      "2015": 279.34,
      "2017": 277.34,
      "2019": 275.33,
      "2022": 270.1,
      "2024": 270.04
    },
    "medianSeries": {
      "1990": 263.18,
      "1992": 267.35,
      "1996": 270.215,
      "2000": 276.01,
      "2003": 279.39,
      "2005": 280.885,
      "2007": 283.25,
      "2009": 284.295,
      "2011": 283.29,
      "2013": 284.98,
      "2015": 283.035,
      "2017": 282.21,
      "2019": 281.215,
      "2022": 272.61,
      "2024": 273.145
    },
    "policyLevers": "<ul class='cn-focus-list'><li><strong>Curriculum and instruction</strong> · Adopting high-quality, standards-aligned math curricula can produce gains equivalent to moving from an average teacher to one at the 80th percentile <a href=\"https://edreports.org/impact/why-materials-matter\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; the IES What Works Clearinghouse identifies specific programs with positive evidence by grade band. <a href=\"https://ies.ed.gov/ncee/wwc/Math/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li><li><strong>High-dosage tutoring</strong> · A meta-analysis of 96 studies found tutoring raises math achievement by roughly a third of a grade level, with the largest effects when sessions occur during the school day three or more times per week <a href=\"https://ies.ed.gov/learn/blog/high-quality-tutoring-evidence-based-strategy-tackle-learning-loss\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; a 2024 national evaluation confirmed in-school high-dosage tutoring reversed pandemic-era math losses at scale. <a href=\"https://educationlab.uchicago.edu/2024/03/national-study-finds-in-school-tutoring-programs-are-successfully-accelerating-student-learning-reversing-pandemic-era-learning-loss/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li><li><strong>Attendance recovery</strong> · NCES found rising absenteeism accounted for 16 percent of the 8th-grade math score decline between 2019 and 2022 <a href=\"https://nces.ed.gov/nationsreportcard/blog/attendance_and_naep_2022_score_declines.aspx\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; Hawaiʻi reported only 75 percent regular attendance statewide, with lower rates for economically disadvantaged and Native Hawaiian students. <a href=\"https://boe.hawaii.gov/wp-content/uploads/2024/11/2024-11-21_SAC_school-attendance.pdf\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li><li><strong>Teacher pipeline</strong> · Hawaiʻi replaces roughly 1,200 teachers a year and relied on 738 emergency hires as of January 2024; a 2025 HIDOE compensation study identified cost of living and salary compression as the top retention barriers. <a href=\"https://hawaiipublicschools.org/2025-hidoe-releases-independent-study-on-teacher-compensation/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li></ul>",
    "nextUpdate": "Biennial",
    "rankHistoryNarrative": {
      "summary": "Hawaiʻi improved from #47 in 2003 to #30 in 2024, the largest rank gain of any metric on this dashboard. The 2022-2024 recovery was especially strong: Hawaiʻi held steady while most states declined. Teacher turnover driven by cost of living and cross-island variation in school quality remain persistent challenges.",
      "mode": "learn",
      "benchmarks": [
        {
          "state": "Massachusetts",
          "text": "Like Hawaiʻi, Massachusetts runs a statewide accountability system where state-level curriculum and teacher quality decisions directly shape outcomes. Massachusetts has ranked #1 or #2 in NAEP 8th grade math for over 25 years. The Massachusetts Education Reform Act of 1993 established standards-based accountability, redirected funding toward high-need districts through a foundation budget formula, and created mathematics-specific teacher licensure requirements. Massachusetts requires math teachers to pass a separate subject-matter exam (MTEL) distinct from general teaching certification.",
          "source": {
            "label": "Massachusetts Tests for Educator Licensure (MTEL) - Massachusetts DESE",
            "url": "https://www.doe.mass.edu/mtel/"
          }
        }
      ],
      "explore": [
        "Massachusetts built sustained gains through standards-based reform and teacher quality; Florida's early gains from retention policies did not carry forward. Hawaiʻi's single statewide district allowed HIDOE to roll out Illustrative Mathematics to every school simultaneously, but teacher shortages remain most acute in STEM subjects on neighbor islands where cost-of-living premiums are not offset by compensation."
      ],
      "caution": {
        "state": "Florida",
        "text": "Florida's experience shows that early test-score gains from retention policies do not automatically carry forward to later grades. Florida's third-grade reading retention law (enacted 2002) was widely credited with raising 4th-grade NAEP reading scores. Independent researchers later found that a substantial share of the improvement reflected cohort effects: retained students below the threshold were excluded from the grade-level sample, making the measured cohort appear stronger. Eighth-grade math outcomes improved more modestly and less consistently.",
        "source": {
          "label": "NAEP State and District Snapshots - NCES",
          "url": "https://nces.ed.gov/nationsreportcard/snapshots/"
        }
      }
    }
  },
  "naep_reading_8": {
    "area": "Education",
    "metric": "NAEP 8th Grade Reading",
    "officialName": "Average reading score for 8th-graders on the National Assessment of Educational Progress, the nation's report card, given every two years.",
    "sourceCategory": "federal",
    "unit": "score",
    "unitLabel": "scale score (0-500)",
    "goodDirection": "up",
    "source": "NAEP / Nation's Report Card",
    "sourceUrl": "https://www.nationsreportcard.gov/reading/states/scores/?grade=8",
    "whyItMatters": "8th-grade reading shows whether students can handle the more complex learning that comes next.",
    "howToRead": "Scores are on a 0-500 scale; 243 is 'Basic,' 281 is 'Proficient.' Hawaiʻi has improved steadily over two decades while other states have declined since 2013, closing the gap.",
    "potentialDrivers": "Hawaiʻi’s reading score has reached near-parity with the median for the first time on record. Absenteeism is the main documented headwind. A <a href=\"https://nces.ed.gov/nationsreportcard/blog/attendance_and_naep_2022_score_declines.aspx\">2023 NCES analysis</a> found a clear association between rising chronic absenteeism and lower NAEP reading scores, and a <a href=\"https://boe.hawaii.gov/wp-content/uploads/2024/11/2024-11-21_SAC_school-attendance.pdf\">November 2024 Board of Education report</a> found regular attendance had recovered to 75 percent, up from 66 percent in 2021-22, showing the state was still climbing back from pandemic-era missed learning time. On the recovery side, <a href=\"https://hawaiipublicschools.org/about/federal-grants/\">HIDOE received a $60 million federal literacy grant in 2024</a>, and <a href=\"https://hawaiipublicschools.org/2025-hawaii-public-schools-rank-4th-in-math-recovery-2nd-in-reading-recovery-national-report-finds/\">HIDOE reported in 2025</a> that Hawaiʻi ranked second nationally in reading recovery from 2019 to 2024, suggesting that targeted literacy investment helped offset absenteeism losses. The <a href=\"https://nces.ed.gov/nationsreportcard/subject/publications/stt2024/pdf/2024220HI8.pdf\">2024 NCES Hawaiʻi snapshot</a> shows the state's score is statistically tied with the U.S. average, so this metric is better read as a near-average result with positive momentum than as a persistent weakness.",
    "useConsolidated": true,
    "dataNote": "NAEP is administered every 2 years. Hawaiʻi did not participate in some earlier rounds.",
    "hawaii": {
      "1998": 249.69,
      "2002": 251.61,
      "2003": 251.28,
      "2005": 248.51,
      "2007": 251.33,
      "2009": 254.74,
      "2011": 257.19,
      "2013": 259.96,
      "2015": 257.35,
      "2017": 260.98,
      "2019": 258.16,
      "2022": 258.98,
      "2024": 257.28
    },
    "medianSeries": {
      "1998": 262.145,
      "2002": 264.72,
      "2003": 264.465,
      "2005": 263.73,
      "2007": 263.825,
      "2009": 265.045,
      "2011": 265.77,
      "2013": 267.245,
      "2015": 266.825,
      "2017": 266.44,
      "2019": 262.89,
      "2022": 259.195,
      "2024": 257.28
    },
    "policyLevers": "<ul class='cn-focus-list'><li><strong>Structured literacy adoption</strong> · Mississippi's 2013 literacy reforms, including reading coaches, structured phonics, and retention with supports, produced a 0.14 SD gain in 4th-grade reading (preliminary) <a href=\"https://www.sciencedirect.com/science/article/abs/pii/S027277572400092X\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; states that combined coaching, standards alignment, and accountability saw the largest NAEP gains. <a href=\"https://excelined.org/2025/03/04/policy-lessons-from-states-that-improved-students-reading-and-math-proficiency/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li><li><strong>Literacy investment</strong> · HIDOE received a $60 million, five-year federal Comprehensive Literacy grant in 2024 targeting science-of-reading professional development <a href=\"https://hawaiipublicschools.org/2024-hidoe-awarded-60-million-in-five-year-comprehensive-literacy-state-development-grant/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; Hawaiʻi ranked 2nd nationally in reading recovery from 2019 to 2024, suggesting targeted investment is already paying off. <a href=\"https://hawaiipublicschools.org/2025-hawaii-public-schools-rank-4th-in-math-recovery-2nd-in-reading-recovery-national-report-finds/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li><li><strong>Attendance and engagement</strong> · NCES found absenteeism accounted for 36 percent of the 8th-grade reading score decline between 2019 and 2022, a larger share than for math <a href=\"https://nces.ed.gov/nationsreportcard/blog/attendance_and_naep_2022_score_declines.aspx\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; an IES meta-analysis found extended learning time improved literacy only when delivered by certified teachers using structured instruction. <a href=\"https://ies.ed.gov/use-work/resource-library/report/descriptive-study/effects-increased-learning-time-student-academic-and-nonacademic-outcomes-findings-meta-analytic\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li></ul>",
    "nextUpdate": "Biennial",
    "rankHistoryNarrative": {
      "summary": "Hawaiʻi was worse than the median for two decades, with a 10-to-12-point gap from 2003 through the early 2010s. The gap closed sharply since 2013 as Hawaiʻi improved and the median declined. By 2024 Hawaiʻi reached near-parity for the first time on record.",
      "mode": "learn",
      "benchmarks": [
        {
          "state": "Mississippi",
          "text": "Like Hawaiʻi, Mississippi ranked near the bottom in reading for decades before implementing statewide literacy reform. Mississippi was consistently last or near-last in reading scores through 2018. The state enacted the Mississippi Literacy Act in 2019, which required all third-grade reading teachers to be trained in structured literacy, placed literacy coaches in every school, and barred third-grade promotion for students not reading at grade level. By 2022, Mississippi's 4th grade reading scores rose 3 points on NAEP while the median fell 3 points, the largest positive divergence in the country. Mississippi's 8th grade reading scores also improved against national trends.",
          "source": {
            "label": "Mississippi Literacy-Based Promotion Act - Mississippi Department of Education",
            "url": "https://mdek12.org/literacy/lbpa/"
          }
        }
      ],
      "explore": [
        "Mississippi's literacy reform drove genuine gains from the bottom; Kentucky shows better-than-average performance can erode when attention shifts. Hawaiʻi's convergence since 2013 has come partly from other states declining. Hawaiʻi's large multilingual population creates both challenges for standard assessments and a need for instructional approaches that account for language transfer."
      ],
      "caution": {
        "state": "Kentucky",
        "text": "Kentucky shows that better-than-average performance can erode when implementation attention shifts to other priorities. Kentucky scored better than the median in 8th grade reading in 2011 and maintained that position through the mid-2010s. By 2022, Kentucky had fallen to worse than the median. Kentucky did not adopt a structured literacy requirement until 2022 legislation, and the delay coincided with a period when states that did adopt phonics-based mandates pulled ahead while Kentucky's scores declined. Kentucky illustrates that a good starting position does not protect a state's rank if instructional practices stagnate.",
        "source": {
          "label": "Prichard Committee for Academic Excellence - prichardcommittee.org",
          "url": "https://prichardcommittee.org/"
        }
      }
    }
  },
  "unemployment_rate": {
    "area": "Economy & Workforce",
    "metric": "Unemployment Rate",
    "officialName": "Share of the civilian labor force actively looking for work but not currently employed, averaged over the year.",
    "sourceCategory": "federal",
    "unit": "%",
    "unitLabel": "of labor force is unemployed",
    "goodDirection": "down",
    "source": "Bureau of Labor Statistics",
    "sourceUrl": "https://www.bls.gov/lau/",
    "whyItMatters": "Unemployment shows how many people who want work still cannot find it. Hawaiʻi has about 660,000 people in the labor force, so each percentage point on this rate represents roughly 6,600 workers actively seeking jobs.",
    "scale": {
      "denominator": 660000,
      "denominatorRounded": 660000,
      "unit": "people in the labor force",
      "year": 2023,
      "source": "BLS LAUS 2023 annual average"
    },
    "howToRead": "Hawaiʻi has been better than the median in normal years. The COVID spike and snapback dominate the recent chart.",
    "potentialDrivers": "Low unemployment hides a concentration problem: Hawaiʻi’s jobs are concentrated in tourism, government, and low-wage services, keeping productivity at #46 and wages below the cost of living. The low rate reflects both genuine demand from year-round tourism employment and a shrinking labor supply. <a href=\"https://www.bls.gov/regions/west/news-release/laborunderutilization_hawaii.htm\" target=\"_blank\" rel=\"noopener\">BLS found in March 2026</a> that the broader U-6 underutilization rate was also low (5.7% vs. 8.0% nationally), so the headline number is not hiding slack. But <a href=\"https://uhero.hawaii.edu/wp-content/uploads/2026/02/UHEROForecastForTheStateOfHawaii26Q1.pdf\" target=\"_blank\" rel=\"noopener\">UHERO noted in February 2026</a> that the decline partly reflects flattening labor force growth, and <a href=\"https://dbedt.hawaii.gov/blog/26-11/\" target=\"_blank\" rel=\"noopener\">DBEDT reported</a> that job growth is expected to level off. The headline rate should not be read as evidence that broader workforce challenges have been resolved.",
    "countyNarrative": "Honolulu County consistently posts the state's lowest unemployment rate, reflecting its larger and more diverse economy with federal employment, healthcare, finance, and professional services alongside tourism. Maui County's rate rose sharply after the August 2023 wildfires, which displaced thousands of workers in the visitor industry and forced temporary business closures across West Maui. Hawaiʻi County has historically recorded among the highest unemployment rates, though post-2020 the position has shifted, with Maui leading after the 2023 wildfires among the four counties, driven by a more rural economy with fewer year-round employers and greater dependence on seasonal agriculture and small-scale tourism. Kauaʻi County's rate tracks close to the statewide average, with tourism providing relative employment stability but limited industry diversity leaving the county exposed to visitor arrival swings.",
    "useConsolidated": true,
    "hawaii": {
      "1976": 0.0912,
      "1977": 0.0755,
      "1978": 0.0698,
      "1979": 0.0568,
      "1980": 0.0497,
      "1981": 0.0518,
      "1982": 0.0613,
      "1983": 0.0589,
      "1984": 0.0542,
      "1985": 0.0524,
      "1986": 0.0464,
      "1987": 0.037,
      "1988": 0.0304,
      "1989": 0.0248,
      "1990": 0.0261,
      "1991": 0.0277,
      "1992": 0.0411,
      "1993": 0.0438,
      "1994": 0.0514,
      "1995": 0.055,
      "1996": 0.0589,
      "1997": 0.0594,
      "1998": 0.0579,
      "1999": 0.0517,
      "2000": 0.0423,
      "2001": 0.0428,
      "2002": 0.0404,
      "2003": 0.0391,
      "2004": 0.0331,
      "2005": 0.0284,
      "2006": 0.0257,
      "2007": 0.0274,
      "2008": 0.0409,
      "2009": 0.065,
      "2010": 0.067,
      "2011": 0.0671,
      "2012": 0.0581,
      "2013": 0.0472,
      "2014": 0.0422,
      "2015": 0.0342,
      "2016": 0.0291,
      "2017": 0.0223,
      "2018": 0.024,
      "2019": 0.0251,
      "2020": 0.1174,
      "2021": 0.0597,
      "2022": 0.0324,
      "2023": 0.0287,
      "2024": 0.0277,
      "2025": 0.0234
    },
    "medianSeries": {
      "1976": 0.0666,
      "1977": 0.0661,
      "1978": 0.0559,
      "1979": 0.0557,
      "1980": 0.0681,
      "1981": 0.0729,
      "1982": 0.089,
      "1983": 0.0896,
      "1984": 0.0686,
      "1985": 0.0691,
      "1986": 0.0678,
      "1987": 0.0598,
      "1988": 0.052,
      "1989": 0.0502,
      "1990": 0.0534,
      "1991": 0.0641,
      "1992": 0.0683,
      "1993": 0.0619,
      "1994": 0.0548,
      "1995": 0.0516,
      "1996": 0.0519,
      "1997": 0.0473,
      "1998": 0.0429,
      "1999": 0.0401,
      "2000": 0.0374,
      "2001": 0.045,
      "2002": 0.0541,
      "2003": 0.056,
      "2004": 0.052,
      "2005": 0.0491,
      "2006": 0.0446,
      "2007": 0.0445,
      "2008": 0.0539,
      "2009": 0.0821,
      "2010": 0.0841,
      "2011": 0.0795,
      "2012": 0.0723,
      "2013": 0.0683,
      "2014": 0.0594,
      "2015": 0.0507,
      "2016": 0.0474,
      "2017": 0.0423,
      "2018": 0.0377,
      "2019": 0.0348,
      "2020": 0.0735,
      "2021": 0.0478,
      "2022": 0.0324,
      "2023": 0.0319,
      "2024": 0.036,
      "2025": 0.0395
    },
    "policyLevers": "<ul class='cn-focus-list'><li><strong>Tourism employment floor</strong> · Hawaiʻi's visitor economy provides a persistent baseline of service-sector jobs, but tourism-related sectors had recovered to only 94% of pre-pandemic GDP by late 2024 <a href=\"https://dbedt.hawaii.gov/economic/qser/outlook-economy/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; roughly 50% of hospitality tasks are technically automatable, posing a medium-term displacement risk. <a href=\"https://www.mckinsey.com/industries/travel/our-insights/future-of-tourism-bridging-the-labor-gap-enhancing-customer-experience\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li><li><strong>Sector-based training</strong> · Randomized trials of programs such as Project QUEST and Year Up show sustained earnings gains of $5,000-$8,000 per year lasting a decade or more <a href=\"https://www.brookings.edu/articles/do-sectoral-training-programs-work-what-the-evidence-on-project-quest-and-year-up-really-shows/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; Hawaiʻi's federally funded training pipeline aligns with this model but remains small relative to at-risk occupations. <a href=\"https://labor.hawaii.gov/wp-content/uploads/2025/12/WIOA-Annual-Report-PY24_12.01.2025.pdf\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li><li><strong>Reemployment speed</strong> · Rapid-reattachment services such as reemployment bonuses and job-search assistance shorten unemployment spells more cost-effectively than extended benefits <a href=\"https://www.brookings.edu/articles/building-americas-job-skills-with-effective-workforce-programs-a-training-strategy-to-raise-wages-and-increase-work-opportunities/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; Hawaiʻi's single-sector concentration amplifies the value of cross-industry reskilling during tourism downturns. <a href=\"https://uhero.hawaii.edu/potential-opportunities-to-diversify-the-economy-of-hawai%CA%BBi/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li></ul>",
    "nextUpdate": "Mar",
    "latestMonthly": {
      "value": 2.4,
      "period": "Mar 2026",
      "asOf": "2026-05-13"
    },
    "rankHistoryNarrative": {
      "summary": "Hawaiʻi has typically ranked #3 to #8 over the past 40 years. The exception was 2020, when tourism dependence drove unemployment to 11.6 percent and the rank to near last. Recovery took until 2022 to return to the top 10 and continued through 2025, when Hawaiʻi reached #2: the strongest position on record.",
      "mode": "protect",
      "benchmarks": [
        {
          "state": "Nebraska",
          "text": "Unlike Hawaiʻi, Nebraska spreads employment risk across multiple sectors, providing a structural buffer during downturns. Nebraska has ranked #1 or #2 in lowest unemployment for most of the past three decades. Nebraska's economy spreads risk across agriculture, food processing, financial services, insurance, healthcare, and manufacturing. During the COVID downturn, Nebraska's unemployment peaked at roughly 8 percent in April 2020, compared to Hawaiʻi's 11.6 percent annual average and peak rates above 20 percent in individual months. Nebraska recovered to near pre-pandemic levels within 12 months.",
          "source": {
            "label": "Unemployment Rates for States, Historical Highs and Lows - Bureau of Labor Statistics",
            "url": "https://www.bls.gov/web/laus/lauhsthl.htm"
          }
        }
      ],
      "explore": [
        "Nebraska's diversified economy absorbed COVID with a fraction of the disruption; Nevada's tourism concentration produced the same volatility as Hawaiʻi's. Hawaiʻi's recovery from 11.6 percent in 2020 to 3 percent by 2024 was driven almost entirely by the return of tourism rather than the growth of new sectors. The same structural volatility risk that existed before the pandemic exists today."
      ],
      "caution": {
        "state": "Nevada",
        "text": "Nevada shares Hawaiʻi's concentration in tourism and hospitality, creating the same structural employment volatility. Nevada, like Hawaiʻi, concentrates employment in tourism and hospitality. Nevada has chronically ranked among the most volatile unemployment states, spiking to 14 percent in the 2008 recession and 30 percent in early 2020. Unlike Hawaiʻi, Nevada has not recovered as quickly between downturns because its labor market has no large anchor sector outside gaming and conventions. Nevada's persistent unemployment volatility illustrates the long-term cost of concentrated tourism dependence.",
        "source": {
          "label": "Nevada Economy at a Glance - Bureau of Labor Statistics",
          "url": "https://www.bls.gov/eag/eag.nv.htm"
        }
      }
    }
  },
  "labor_force_participation": {
    "area": "Economy & Workforce",
    "metric": "Labor Force Participation Rate",
    "officialName": "Share of civilians age 16 and older who are either employed or actively seeking work, averaged over the year.",
    "sourceCategory": "federal",
    "unit": "%",
    "unitLabel": "are working or looking for work",
    "goodDirection": "up",
    "source": "Bureau of Labor Statistics",
    "sourceUrl": "https://www.bls.gov/lau/",
    "whyItMatters": "When fewer adults are working or looking for work, the economy has fewer earners supporting households and the tax base. Hawaiʻi has about 1.15 million civilian working-age adults (16 and older, excluding active-duty military), so each percentage point on this rate represents roughly 11,500 people in or out of the workforce.",
    "scale": {
      "denominator": 1150000,
      "denominatorRounded": 1150000,
      "unit": "civilian working-age adults",
      "year": 2023,
      "source": "BLS LAUS 2023 (civilian noninstitutionalized population 16+, excludes active-duty military)"
    },
    "howToRead": "Hawaiʻi was better than the median until the mid-1990s, then crossed to worse. Both lines have been falling, but Hawaiʻi's decline has been steeper. COVID caused a sharp drop in 2020.",
    "potentialDrivers": "Thousands of working-age residents have quietly left the workforce, not because jobs are scarce, but because what those jobs pay does not cover the cost of staying. Hawaiʻi's worse-than-average participation most likely reflects two compounding factors. The first is demographic: <a href=\"https://census.hawaii.gov/main/2024-state-and-county-population-characteristics-released/\" target=\"_blank\" rel=\"noopener\">Hawaiʻi's State Data Center reported in 2025</a> that the share of residents age 65 and older continued to grow faster than the national rate, and <a href=\"https://www.bls.gov/opub/btn/volume-14/golden-years-older-americans-at-work-and-play.htm\" target=\"_blank\" rel=\"noopener\">BLS reported in 2025</a> that national participation among workers ages 25 to 54 was 83.6 percent in 2024 but falls sharply at older ages, so a state with an older age mix will mechanically register a lower statewide rate. The second driver is affordability pressure on working-age residents: <a href=\"https://uhero.hawaii.edu/are-people-leaving-hawai%CA%BBi-because-of-high-prices-or-low-incomes/\" target=\"_blank\" rel=\"noopener\">UHERO found in March 2026</a> that high prices, slow income growth, limited housing supply, and local constraints push residents toward mainland markets where opportunity is more accessible, and workers who leave the state are recorded as having exited the labor force in state-level data. One counterpoint: <a href=\"https://uhero.hawaii.edu/uhero-forecast-for-the-state-of-hawai%CA%BBi-hawaii-moves-beyond-recession-but-slowly/\" target=\"_blank\" rel=\"noopener\">UHERO noted in February 2026</a> that unemployment was near 2.2 percent, suggesting the low participation rate reflects labor supply constraints rather than a shortage of available jobs. Taken together, the evidence points to a demographics and affordability problem rather than a demand problem, though tying the two drivers to the exact size of the gap with the median remains partly inferential.",
    "countyNarrative": "Labor force participation varies across counties with no single county consistently leading; Honolulu, Maui, and Kauaʻi have each held the top position in different years, supported by a more diverse economy, a higher concentration of working-age residents, and year-round employment in federal, military, healthcare, and professional services. Hawaiʻi County typically records the lowest rate, reflecting a higher share of retirees who have relocated to rural areas, a smaller employer base, and fewer pathways to higher-wage employment that draw prime-age workers into the labor force. Maui County's rate has been affected by post-wildfire labor market disruption since late 2023, with displaced workers in the visitor industry facing a slower recovery in West Maui. Kauaʻi County follows a similar pattern to Maui at a smaller scale, with tourism providing year-round employment for a core workforce but limited industry diversity to absorb workers seeking to re-enter or advance.",
    "useConsolidated": true,
    "hawaii": {
      "1976": 69.3,
      "1977": 68.5,
      "1978": 67.6,
      "1979": 66.5,
      "1980": 66.4,
      "1981": 66.6,
      "1982": 66.6,
      "1983": 66.5,
      "1984": 66,
      "1985": 65.9,
      "1986": 66.3,
      "1987": 67.1,
      "1988": 66.9,
      "1989": 67.1,
      "1990": 67.7,
      "1991": 68.2,
      "1992": 68.6,
      "1993": 68.5,
      "1994": 68,
      "1995": 67.6,
      "1996": 67.8,
      "1997": 67.7,
      "1998": 67.4,
      "1999": 67.4,
      "2000": 67.3,
      "2001": 67.1,
      "2002": 65.9,
      "2003": 65.5,
      "2004": 65,
      "2005": 65.7,
      "2006": 65.9,
      "2007": 65.4,
      "2008": 65.4,
      "2009": 64,
      "2010": 63.3,
      "2011": 62.9,
      "2012": 61.3,
      "2013": 60.8,
      "2014": 61.6,
      "2015": 61.7,
      "2016": 62.1,
      "2017": 62,
      "2018": 61.5,
      "2019": 61.1,
      "2020": 59.1,
      "2021": 59.5,
      "2022": 59.9,
      "2023": 60.2,
      "2024": 60.2,
      "2025": 60.6
    },
    "medianSeries": {
      "1976": 63,
      "1977": 63.75,
      "1978": 64.55,
      "1979": 64.8,
      "1980": 65.25,
      "1981": 65.45,
      "1982": 65.55,
      "1983": 65.4,
      "1984": 65.9,
      "1985": 66,
      "1986": 66.65,
      "1987": 67.05,
      "1988": 67.4,
      "1989": 68,
      "1990": 67.75,
      "1991": 67.8,
      "1992": 68.1,
      "1993": 68,
      "1994": 68,
      "1995": 67.8,
      "1996": 68,
      "1997": 68.2,
      "1998": 68.2,
      "1999": 68.3,
      "2000": 68.3,
      "2001": 67.8,
      "2002": 67.3,
      "2003": 67.1,
      "2004": 66.55,
      "2005": 66.85,
      "2006": 67.25,
      "2007": 67.1,
      "2008": 66.95,
      "2009": 65.95,
      "2010": 65.5,
      "2011": 64.95,
      "2012": 64.35,
      "2013": 63.95,
      "2014": 63.45,
      "2015": 63.45,
      "2016": 63.55,
      "2017": 63.65,
      "2018": 63.35,
      "2019": 63.85,
      "2020": 62.65,
      "2021": 62.1,
      "2022": 62.65,
      "2023": 63.2,
      "2024": 63.05,
      "2025": 62.95
    },
    "policyLevers": "<ul class='cn-focus-list'><li><strong>Childcare cost and supply</strong> · Infant care in Hawaiʻi averages $21,167 per year, ranking 6th-highest nationally and consuming roughly 20% of median family income <a href=\"https://www.epi.org/child-care-costs-in-the-united-states/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; federal research finds higher childcare subsidy spending significantly increases low-income mothers' labor force participation. <a href=\"https://aspe.hhs.gov/effects-child-care-subsidies-maternal-labor-force-participation-united-states\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li><li><strong>Aging-driven exits</strong> · Population aging reduced U.S. labor force participation by over 3 percentage points from 2000 to 2017 <a href=\"https://www.minneapolisfed.org/article/2023/whos-not-working-understanding-the-uss-aging-workforce\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; Hawaiʻi's median age is among the highest in the nation, and roughly 1.6 million excess retirements nationally during the pandemic have not fully reversed. <a href=\"https://www.atlantafed.org/research-and-data/publications/policy-hub-macroblog/2023/04/21/retirement-and-its-impact-on-labor-supply\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li><li><strong>Discouraged and disabled workers</strong> · Childcare-related nonparticipation rose 43% from mid-2023 to late 2024 <a href=\"https://www.kansascityfed.org/research/economic-bulletin/cost-of-childcare-increasingly-weighs-on-labor-force-engagement/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; high living costs in Hawaiʻi amplify barriers for workers deciding whether working is worth the cost, particularly those with disabilities or limited transportation. <a href=\"https://dbedt.hawaii.gov/economic/qser/labor-force/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li></ul>",
    "nextUpdate": "Mar",
    "latestMonthly": {
      "value": 60.6,
      "period": "Mar 2026",
      "asOf": "2026-05-13"
    },
    "rankHistoryNarrative": {
      "summary": "Hawaiʻi ranked #2 in 1976 and has fallen to #37 in 2025. The decline tracks the shift from plantation agriculture to tourism and hospitality, with part-time schedules and lower wages replacing full-time cross-skill employment.",
      "mode": "learn",
      "benchmarks": [
        {
          "state": "Minnesota",
          "text": "Like Hawaiʻi, Minnesota faces high childcare costs that affect whether working-age parents can enter or stay in the labor force. Minnesota has ranked #1 or #2 in labor force participation for most of the past four decades. The state's Child Care Assistance Program (CCAP) provides subsidized childcare on a sliding-fee scale for families earning up to 67 percent of state median income. Minnesota doubled CCAP funding between 2019 and 2023 and expanded eligibility thresholds. State analysis found each dollar invested in CCAP generated between $1.36 and $1.83 in increased labor force participation and associated tax revenue.",
          "source": {
            "label": "Child Care Assistance Program - Minnesota Department of Children, Youth, and Families",
            "url": "https://dcyf.mn.gov/programs-directory/child-care-assistance-program"
          }
        }
      ],
      "explore": [
        "Minnesota's childcare assistance keeps parents in the workforce; West Virginia shows how sector collapse permanently removes workers. Hawaiʻi's informal economy is larger than most states because high living costs drive income-supplementing activity outside formal employment. Hawaiʻi's high per-capita veteran population also includes many with disability ratings that provide income without requiring employment, lowering measured participation."
      ],
      "caution": {
        "state": "West Virginia",
        "text": "West Virginia illustrates the long-term workforce consequences of single-sector collapse, a risk Hawaiʻi's tourism dependence creates. West Virginia has ranked last or near-last in labor force participation for over 20 years after the coal industry collapsed. Workers displaced at ages 50 and above rarely retrain and re-enter; West Virginia's disability claim rate is among the highest in the country. The pattern shows that sector collapse affecting older workers tends to produce permanent labor force exit rather than retraining.",
        "source": {
          "label": "Labor Force Participation Rate for West Virginia (LBSSA54) - FRED, St. Louis Fed",
          "url": "https://fred.stlouisfed.org/series/LBSSA54"
        }
      }
    }
  },
  "real_per_capita_income": {
    "area": "Economy & Workforce",
    "metric": "Per Capita Income (real)",
    "officialName": "Total personal income per resident in constant 2017 dollars, adjusted for both regional price differences and national inflation so states and years can be compared on equal footing.",
    "sourceCategory": "federal",
    "unit": "$",
    "unitLabel": "constant 2017 dollars, per person",
    "goodDirection": "up",
    "source": "BEA",
    "sourceUrl": "https://www.bea.gov/data/income-saving/personal-income-by-state",
    "whyItMatters": "Inflation-adjusted income shows whether residents' purchasing power is actually improving over time.",
    "howToRead": "All values are in constant 2017 dollars, so a flat line means no real income growth. Hawaiʻi has been worse than the median throughout. Real purchasing power barely grew from 2008 to 2018, then spiked during COVID-era federal transfers before pulling back.",
    "potentialDrivers": "After adjusting for both cost of living and inflation, Hawaiʻi's real per capita income is among the lowest in the nation. Hawaiʻi's weak real income reflects a lopsided economy: dominated by retail trade and accommodation sectors, which have the <a href=\"https://dbedt.hawaii.gov/economic/files/2025/06/Hawaii-General-Economic-Competitiveness-Report-2025-draft.pdf\">lowest average hourly earnings</a> among major private industries, while higher-earning industries have seen little job growth. <a href=\"https://uhero.hawaii.edu/wp-content/uploads/2026/01/BeyondThePriceOfParadise.pdf\">UHERO found</a> that Hawaiʻi lacks the wage and productivity premium seen in other high-cost states; even after adjusting for local prices, incomes remain well below the U.S. average. Nearly all of Hawaiʻi's <a href=\"https://files.hawaii.gov/dbedt/economic/data_reports/emerging-industries/Hawaii_Targeted_Emerging_Industries_2025_Update_Report.pdf\">targeted and emerging industries underperformed national peers</a> from 2014 to 2024, limiting pathways to higher-wage employment.",
    "countyNarrative": "Honolulu County posts the highest real income of the four counties, supported by its more diversified economy including federal government, military, finance, and healthcare. Maui County incomes reflect a tourism-driven economy with some higher-end hospitality management wages, though purchasing power is compressed by some of the state's highest housing costs. Kauaʻi County follows a similar pattern to Maui at a smaller scale. Hawaiʻi County has the lowest per capita income in the state, anchored by agriculture, small-scale tourism, and a higher share of retirees on fixed incomes relative to the other counties.",
    "useConsolidated": true,
    "dataNote": "All values are in constant 2017 dollars, adjusted for both regional price differences (BEA RPPs) and national inflation (PCE price index). County values are computed from county nominal income using state-level RPPs and the national PCE deflator.",
    "hawaii": {
      "2008": 42828,
      "2009": 41102,
      "2010": 41904,
      "2011": 41967,
      "2012": 42532,
      "2013": 40531,
      "2014": 42363,
      "2015": 43533,
      "2016": 45054,
      "2017": 45829,
      "2018": 45636,
      "2019": 46712,
      "2020": 48228,
      "2021": 50046,
      "2022": 49022,
      "2023": 50923,
      "2024": 52272
    },
    "medianSeries": {
      "2008": 45907,
      "2009": 44299.5,
      "2010": 44428,
      "2011": 45605,
      "2012": 46462,
      "2013": 46298.5,
      "2014": 47210.5,
      "2015": 48939,
      "2016": 48719,
      "2017": 49632,
      "2018": 50577,
      "2019": 52163.5,
      "2020": 54987.5,
      "2021": 57162.5,
      "2022": 56194,
      "2023": 57114,
      "2024": 58246
    },
    "policyLevers": "<ul class='cn-focus-list'><li><strong>Price-level penalty</strong> · Hawaiʻi's Regional Price Parity of 110.0 (second-highest nationally) means every dollar of nominal income buys less, with utilities at 201% of the median <a href=\"https://www.bea.gov/data/prices-inflation/regional-price-parities-state-and-metro-area\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; real income growth depends as much on moderating local prices as on raising nominal wages. <a href=\"https://www.bea.gov/news/2026/real-personal-consumption-expenditures-state-and-real-personal-income-state-2024\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li><li><strong>Industry diversification</strong> · Hawaiʻi's economy is concentrated in tourism, which delivers flat and volatile revenue over 30 years <a href=\"https://uhero.hawaii.edu/potential-opportunities-to-diversify-the-economy-of-hawai%CA%BBi/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; cross-country evidence shows diversification into higher-value sectors raises per capita income, with infrastructure, skills, and effective government as prerequisites. <a href=\"https://www.elibrary.imf.org/view/journals/087/2024/006/article-A001-en.xml\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li><li><strong>Workforce skills pipeline</strong> · Higher educational attainment and sector-focused training both raise earnings; Hawaiʻi's non-tourism professional sectors grew 27% above pre-pandemic levels. <a href=\"https://dbedt.hawaii.gov/economic/qser/outlook-economy/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li></ul>",
    "nextUpdate": "Nov",
    "rankHistoryNarrative": {
      "summary": "Hawaiʻi ranked #34 in real income in 2008 and has fallen to #46 in 2024. The steepest drop came during COVID (#49 in 2020) when tourism collapsed. The main reason is sector concentration: roughly 20 percent tourism-dependent, the highest share of any state.",
      "mode": "learn",
      "benchmarks": [
        {
          "state": "Colorado",
          "text": "Like Hawaiʻi, Colorado needed to diversify beyond legacy sectors to lift cost-adjusted incomes. Colorado diversified away from energy and agriculture through a cluster development strategy coordinated by the Colorado Office of Economic Development and International Trade (OEDIT) starting in the early 2000s. OEDIT targeted aerospace, bioscience, technology, and clean energy with coordinated university research commercialization, site-ready infrastructure, and community college workforce pipelines. By 2020, Colorado had climbed from mid-pack to the top 20 in real per capita income.",
          "source": {
            "label": "Industries Overview - Colorado Office of Economic Development and International Trade",
            "url": "https://oedit.colorado.gov/industries"
          }
        }
      ],
      "explore": [
        "Colorado diversified through cluster development; Alaska's single-sector dependence eroded income when prices fell. Hawaiʻi's defense sector, roughly 9 percent of state GDP, is the most stable high-wage sector and has spawned civilian clusters in cybersecurity and satellite operations in other states. The Movers and Shakas remote worker program (2021) attracted roughly 4,000 workers contributing an estimated $57 million, but was not continued at scale."
      ],
      "caution": {
        "state": "Alaska",
        "text": "Like Hawaiʻi with tourism, Alaska's income depended heavily on a single sector whose decline eroded purchasing power statewide. Alaska's per capita income was among the highest in the country during the 1980s oil boom and declined significantly as production fell and prices collapsed. Permanent Fund dividends and oil-funded public services masked the structural income problem for decades, but the state has drawn down reserves for years without replacing the income base. Single-sector dependence creates structural income vulnerability regardless of which sector it is.",
        "source": {
          "label": "Oil Production in Alaska Reaches Lowest Level in Over 40 Years - EIA",
          "url": "https://www.eia.gov/todayinenergy/detail.php?id=47696"
        }
      }
    }
  },
  "renter_cost_burden_pct": {
    "area": "Affordability",
    "metric": "Renter Housing Cost Burden",
    "officialName": "Share of renter households paying 30% or more of income on gross rent, the federal affordability threshold.",
    "sourceCategory": "federal",
    "unit": "%",
    "unitLabel": "pay 30%+ of income on rent",
    "goodDirection": "down",
    "source": "Census ACS",
    "sourceUrl": "https://data.census.gov/",
    "whyItMatters": "When rent takes too much income, families have less for food, transportation, health care, and savings. Hawaiʻi has about 185,000 renter households, so even a small shift in this rate moves thousands of families.",
    "scale": {
      "denominator": 185300,
      "denominatorRounded": 185000,
      "unit": "renter households",
      "year": 2023,
      "source": "Census ACS 2023 Table DP04"
    },
    "howToRead": "Both lines should fall. At the 30%+ threshold (the default view), Hawaiʻi has ranked last or near-last for two decades and the gap with the median has widened. The 50%+ view isolates the most severely burdened renters; the pattern is similar but values are roughly half.",
    "potentialDrivers": "Renters bear the sharpest edge of Hawaiʻi’s affordability crisis. Homeowners who bought before the price surge have locked-in costs; renters face each increase in real time. The state's <a href=\"https://dbedt.hawaii.gov/hhfdc/hhps-landing-page/\" target=\"_blank\" rel=\"noopener\">2024 Housing Planning Study</a> found Hawaiʻi needs 64,490 more units by 2027 but only 13,471 were in the pipeline, while 35,884 existing units sit vacant as seasonal or vacation homes unavailable to local renters. Renter households earned $24.37/hr on average in 2023 against a two-bedroom housing wage of $41.83 per a <a href=\"https://dbedt.hawaii.gov/economic/files/2024/02/Housing-Affordability-February-2024.pdf\" target=\"_blank\" rel=\"noopener\">DBEDT affordability analysis</a>, a supply shortfall and income gap that together keep Hawaiʻi ranked among the bottom five states at both the 30%+ and 50%+ thresholds.",
    "countyNarrative": "At the 30%+ threshold, cost burden is elevated in all four counties, with none better than the median of 49% as of 2023. Kauaʻi saw the sharpest increase over the decade, rising from 43% in 2013 to 58% in 2023, and Maui from 47% to 55%, both likely tied to the conversion of long-term rentals to vacation units on the neighbor islands. Honolulu (57%) stayed roughly flat, while Hawaiʻi County was the only county to improve, falling from 60% in 2013 to 56% in 2023. At the 50%+ severe level, Honolulu and Hawaiʻi County carry the highest severe burden (29-30% in 2023), while Kauaʻi's severe share (19%) is notably lower than its overall 30%+ burden would suggest.",
    "externalCitations": [
      {
        "id": "housing_shortage_2024",
        "label": "64,490 more units",
        "source": "DBEDT 2024 Housing Planning Study",
        "sourceUrl": "https://dbedt.hawaii.gov/hhfdc/hhps-landing-page/",
        "lastVerified": "2026-05-17"
      },
      {
        "id": "housing_wage_2023",
        "label": "$41.83",
        "source": "DBEDT Housing Affordability Analysis, Feb 2024",
        "sourceUrl": "https://dbedt.hawaii.gov/economic/files/2024/02/Housing-Affordability-February-2024.pdf",
        "lastVerified": "2026-05-17"
      },
      {
        "id": "renter_income_2023",
        "label": "$24.37",
        "source": "DBEDT Housing Affordability Analysis, Feb 2024",
        "sourceUrl": "https://dbedt.hawaii.gov/economic/files/2024/02/Housing-Affordability-February-2024.pdf",
        "lastVerified": "2026-05-17"
      }
    ],
    "useConsolidated": true,
    "hawaii": {
      "2005": 0.5004,
      "2006": 0.5163,
      "2007": 0.5316,
      "2008": 0.5544,
      "2009": 0.5707,
      "2010": 0.5621,
      "2011": 0.589,
      "2012": 0.5531,
      "2013": 0.556,
      "2014": 0.5749,
      "2015": 0.5659,
      "2016": 0.5561,
      "2017": 0.5617,
      "2018": 0.5294,
      "2019": 0.5344,
      "2021": 0.5799,
      "2022": 0.5783,
      "2023": 0.5665,
      "2024": 0.5496
    },
    "medianSeries": {
      "2005": 0.4759,
      "2006": 0.478,
      "2007": 0.4732,
      "2008": 0.4801,
      "2009": 0.5,
      "2010": 0.5127,
      "2011": 0.5179,
      "2012": 0.5009,
      "2013": 0.4983,
      "2014": 0.502,
      "2015": 0.4864,
      "2016": 0.4746,
      "2017": 0.4736,
      "2018": 0.4785,
      "2019": 0.4666,
      "2021": 0.4901,
      "2022": 0.4952,
      "2023": 0.4927,
      "2024": 0.4939
    },
    "policyLevers": "<ul class='cn-focus-list'><li><strong>Housing supply and permitting</strong> · Preliminary research finds Minneapolis rents grew 17-34% less after eliminating single-family zoning <a href=\"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5347083\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; each new building lowers nearby rents 5-7% through tenants moving up and freeing units for others <a href=\"https://direct.mit.edu/rest/article/105/2/359/100977/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>. Hawaiʻi's permitting and regulatory process is among the slowest in the nation <a href=\"https://uhero.hawaii.edu/the-hawaii-housing-factbook-2025/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>.</li><li><strong>Affordability preservation</strong> · Rent stabilization alone has not reduced burden in high-cost states; preserving existing affordable units from conversion or demolition prevents displacement at lower cost than new construction. <a href=\"https://www.huduser.gov/portal/periodicals/cityscpe/vol17num1/article1.pdf\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li><li><strong>Rental assistance</strong> · HUD data shows vouchers cut participant housing costs by roughly half, but fewer than 1 in 4 eligible households nationally receives them. <a href=\"https://www.cbpp.org/research/housing/policy-basics-the-housing-choice-voucher-program\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li></ul>",
    "nextUpdate": "Sep",
    "rankHistoryNarrative": {
      "summary": "At the 30%+ threshold, Hawaiʻi has ranked #46 to #49 every year from 2005 through 2024. At the 50%+ severe level, rankings are slightly more volatile (#38 to #48) because the smaller denominator amplifies survey noise, but the structural position remains among the worst five states. The driver is supply: far fewer rental units built than household formation requires, compounded by short-term rental conversions.",
      "mode": "learn",
      "benchmarks": [
        {
          "state": "Texas",
          "text": "Unlike Hawaiʻi, Texas allows by-right development at a scale that keeps supply closer to demand. Texas maintains one of the lowest renter cost burden rates in the country relative to income through permissive land-use regulation at the state level. Texas preempts local rent control and does not mandate design review, minimum parking requirements, or height limits in most zoning jurisdictions, which allows apartment supply to expand quickly in response to demand. When demand rose sharply from 2020 to 2022, new supply followed and limited sustained rent increases.",
          "source": {
            "label": "How Local Rules Fuel High Housing Costs in Texas - Texas Tribune",
            "url": "https://apps.texastribune.org/features/2024/texas-housing-affordability-zoning/"
          }
        }
      ],
      "explore": [
        "Texas keeps burden low through permissive development; California's rent stabilization did not reduce burden without supply. Hawaiʻi has begun addressing supply directly: Maui County's Bill 9 (signed 2025) phases out approximately 6,200 vacation rentals in apartment-zoned areas by 2029-2031. At the same time, Hawaiʻi's LIHTC allocation is consistently underutilized because environmental review and permitting delays make projects financially unviable."
      ],
      "caution": {
        "state": "California",
        "text": "Like Hawaiʻi, California faces a structural housing shortage where demand-side interventions have not reduced renter cost burden. California enacted statewide rent stabilization (AB 1482, 2019), just-cause eviction protections, and significant rent assistance programs. Renter cost burden has remained among the highest in the country because demand continues to exceed supply by a larger margin than protections can bridge.",
        "source": {
          "label": "AB 1482: Tenant Protection Act of 2019 - California Legislature",
          "url": "https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=201920200AB1482"
        }
      }
    },
    "thresholdVariants": {
      "50": {
        "officialName": "Share of renter households paying 50% or more of income on gross rent, indicating severe cost burden.",
        "unitLabel": "pay 50%+ of income on rent",
        "hawaii": {
          "2005": 0.231,
          "2006": 0.2612,
          "2007": 0.2561,
          "2008": 0.2932,
          "2009": 0.2739,
          "2010": 0.2814,
          "2011": 0.287,
          "2012": 0.2847,
          "2013": 0.2677,
          "2014": 0.2991,
          "2015": 0.3054,
          "2016": 0.2827,
          "2017": 0.2776,
          "2018": 0.2732,
          "2019": 0.2706,
          "2021": 0.3073,
          "2022": 0.272,
          "2023": 0.2854
        },
        "medianSeries": {
          "2005": 0.24,
          "2006": 0.2384,
          "2007": 0.2328,
          "2008": 0.2434,
          "2009": 0.2495,
          "2010": 0.2616,
          "2011": 0.2658,
          "2012": 0.2551,
          "2013": 0.2531,
          "2014": 0.2463,
          "2015": 0.2374,
          "2016": 0.23,
          "2017": 0.2273,
          "2018": 0.2309,
          "2019": 0.2218,
          "2021": 0.2512,
          "2022": 0.2525,
          "2023": 0.2477,
          "2024": 0.244
        }
      }
    }
  },
  "home_price_to_income": {
    "area": "Affordability",
    "metric": "Home Price-to-Income Ratio",
    "officialName": "Median home value divided by median household income; a higher ratio means homes cost more relative to what residents earn.",
    "sourceCategory": "federal",
    "unit": "×",
    "unitLabel": "years of income to buy median home",
    "goodDirection": "down",
    "source": "Census ACS",
    "sourceUrl": "https://data.census.gov/",
    "whyItMatters": "This shows how hard it is for residents to buy a home and build stability.",
    "howToRead": "Hawaiʻi has been consistently worse than the median throughout, with no sustained narrowing of the gap.",
    "potentialDrivers": "This single metric cascades into renter burden, homelessness, and out-migration. Hawaiʻi single-family homes sold at nearly twice the national price-to-income ratio in 2024, driven by limited inventory, demand for second and vacation homes, and high construction and land costs, per a <a href=\"https://dbedt.hawaii.gov/economic/files/2024/02/Housing-Affordability-February-2024.pdf\" target=\"_blank\" rel=\"noopener\">DBEDT affordability analysis</a>. The state still needs 64,490 more units by 2027 but only 13,471 are in the pipeline (per the <a href=\"https://dbedt.hawaii.gov/hhfdc/hhps-landing-page/\" target=\"_blank\" rel=\"noopener\">2024 Housing Planning Study</a>), and <a href=\"https://uhero.hawaii.edu/wp-content/uploads/2025/05/HawaiiHousingFactbook2025_Main.pdf\" target=\"_blank\" rel=\"noopener\">UHERO's 2025 Housing Factbook</a> found that regulatory barriers continue to slow construction while prices outpace income growth.",
    "countyNarrative": "Maui County has seen the most severe affordability deterioration, with median home prices surpassing $1 million after 2022 as pandemic-era in-migration, second-home demand, and post-wildfire displacement compressed an already scarce inventory. Honolulu has the highest volume of transactions and a ratio well below Maui's, which has risen sharply and now leads all four counties by a wide margin. Hawaiʻi County is the most affordable of the four, though prices have risen sharply since 2020. Kauaʻi's small, vacation-dominated market keeps the price-to-income ratio for full-time residents well above what local wages can support.",
    "externalCitations": [
      {
        "id": "housing_shortage_2024",
        "label": "64,490 more units",
        "source": "DBEDT 2024 Housing Planning Study",
        "sourceUrl": "https://dbedt.hawaii.gov/hhfdc/hhps-landing-page/",
        "lastVerified": "2026-05-17"
      }
    ],
    "useConsolidated": true,
    "hawaii": {
      "2005": 7.81,
      "2006": 8.66,
      "2007": 8.71,
      "2008": 8.33,
      "2009": 8.08,
      "2010": 8.34,
      "2011": 7.88,
      "2012": 7.49,
      "2013": 7.35,
      "2014": 7.59,
      "2015": 7.71,
      "2016": 7.95,
      "2017": 7.94,
      "2018": 7.88,
      "2019": 8.05,
      "2021": 8.51,
      "2022": 8.87,
      "2023": 8.88,
      "2024": 8.69
    },
    "medianSeries": {
      "2005": 3.305,
      "2006": 3.535,
      "2007": 3.675,
      "2008": 3.635,
      "2009": 3.58,
      "2010": 3.53,
      "2011": 3.33,
      "2012": 3.245,
      "2013": 3.28,
      "2014": 3.38,
      "2015": 3.44,
      "2016": 3.49,
      "2017": 3.46,
      "2018": 3.52,
      "2019": 3.41,
      "2021": 3.785,
      "2022": 4.075,
      "2023": 4.105,
      "2024": 4.19
    },
    "policyLevers": "<ul class='cn-focus-list'><li><strong>Zoning and land use</strong> · Restrictive zoning raises housing prices across U.S. markets <a href=\"https://www.sciencedirect.com/science/article/abs/pii/S009411902500049X\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; Honolulu permits average 393 days, the primary construction bottleneck, and fewer than 25% of households can afford the median single-family home <a href=\"https://uhero.hawaii.edu/the-hawaii-housing-factbook-2025/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>.</li><li><strong>Construction cost and supply</strong> · New housing supply moderates price growth in surrounding areas <a href=\"https://direct.mit.edu/rest/article/105/2/359/100977/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; island geography, Jones Act shipping premiums, and a national housing underproduction of 3.8 million units compound Hawaiʻi's shortage <a href=\"https://upforgrowth.org/news_insights/high-housing-underproduction-regions-can-build-middle-income-housing-if-policies-are-supportive/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>.</li><li><strong>Income and economic base</strong> · Slow income growth combined with high prices means the affordability gap keeps widening; economic diversification beyond tourism is the demand-side counterpart to supply reform <a href=\"https://files.hawaii.gov/dbedt/economic/data_reports/EconDiversification/Diversification2024.pdf\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>.</li></ul>",
    "nextUpdate": "Sep",
    "rankHistoryNarrative": {
      "summary": "Hawaiʻi has ranked #50 every year since 2008. The causes are structural: constrained island land, Jones Act construction premiums, single-family zoning, and a market where vacation and investment properties compete with residents.",
      "mode": "learn",
      "benchmarks": [
        {
          "state": "Minnesota",
          "text": "Like Hawaiʻi, Minnesota's housing supply was constrained by restrictive zoning before statewide reform. Minnesota enacted statewide zoning reform in 2023 (SF 3) allowing multiplexes in all cities over 1,000 people, following Minneapolis's 2040 comprehensive plan that eliminated single-family-only zoning citywide in 2020. Research found that rent growth in Minneapolis moderated relative to peer cities from 2020 to 2023 and new housing unit production accelerated. Minnesota is the first state to enact statewide single-family zoning elimination.",
          "source": {
            "label": "Minneapolis 2040 Plan Data Tool - Federal Reserve Bank of Minneapolis",
            "url": "https://www.minneapolisfed.org/article/2024/minneapolis-2040-plan-data-tool-prepared-to-measure-impacts"
          }
        }
      ],
      "explore": [
        "Minnesota's zoning reform opened supply; California's reforms stalled against permitting and labor barriers. Hawaiʻi faces both: a 20-to-40 percent construction cost premium driven by Jones Act shipping, and an estimated 20,000 to 25,000 residential units converted to full-time vacation rentals, directly reducing supply available to residents."
      ],
      "caution": {
        "state": "California",
        "text": "Like Hawaiʻi, California enacted zoning mandates but faces permitting, labor, and environmental barriers that prevent supply from catching up with demand. California enacted statewide zoning mandates (SB 9, SB 10, ADU reform) over the past decade. Housing production has not increased proportionally because environmental review litigation and neighborhood opposition delayed or blocked projects permitted under state law. Zoning reform without parallel permitting reform has produced limited actual construction.",
        "source": {
          "label": "SB 9 Fact Sheet - California Department of Housing and Community Development",
          "url": "https://www.hcd.ca.gov/sites/default/files/docs/planning-and-community/sb-9-fact-sheet.pdf"
        }
      }
    }
  },
  "unsheltered_homeless_rate": {
    "area": "Affordability",
    "metric": "Homelessness",
    "officialName": "One-night count of people sleeping outdoors, in vehicles, or in places not meant for habitation, per 10,000 residents.",
    "sourceCategory": "federal",
    "unit": "per 10K",
    "unitLabel": "per 10K residents",
    "goodDirection": "down",
    "source": "HUD PIT Count",
    "sourceUrl": "https://www.huduser.gov/portal/datasets/ahar.html",
    "whyItMatters": "Unsheltered homelessness means people sleeping on streets, in parks, and in cars, the most visible sign that housing has become unaffordable.",
    "scale": {
      "denominator": 1441387,
      "denominatorRounded": 1440000,
      "unit": "residents",
      "countLabel": "people unsheltered on any given night",
      "year": 2023,
      "source": "Census NST-EST2024 (2023 estimate)"
    },
    "howToRead": "Hawaiʻi is far worse than the median at both the unsheltered and total (sheltered + unsheltered) thresholds. The total view is roughly 2-3 times the unsheltered figure because it includes people in emergency shelters and transitional housing. Even small declines represent hundreds of lives improved.",
    "potentialDrivers": "The safety net is intact; the problem is housing. Hawaiʻi ranks near the bottom in unsheltered homelessness despite strong performance in violent crime and health coverage. <a href=\"https://www.huduser.gov/portal/sites/default/files/pdf/2024-AHAR-Part-1.pdf\" target=\"_blank\" rel=\"noopener\">HUD's 2024 homeless assessment</a> attributed the rise to lack of affordable housing and inability to pay rent. A <a href=\"https://www.usich.gov/sites/default/files/document/Federal%20Resources%20for%20Addressing%20the%20Behavioral%20Health%20Needs%20of%20People%20Experiencing%20or%20at%20Risk%20of%20Homelessness.pdf\" target=\"_blank\" rel=\"noopener\">federal USICH/HHS guide</a> found housing scarcity and income loss are the primary causes, with behavioral health problems more a barrier to exiting than an initial cause. Hawaiʻi's <a href=\"https://homelessness.hawaii.gov/wp-content/uploads/2026/01/SOHHS-HICH-Act-309-Report-to-2026-Legislature-signed.pdf\" target=\"_blank\" rel=\"noopener\">2026 legislative report</a> added that insufficient shelter capacity leads to longer stays, and many people fall into homelessness from a single economic crisis.",
    "countyNarrative": "At the unsheltered level, Kauaʻi has the highest rate by a wide margin (63 per 10K in 2024, more than double any other county), having tripled since 2015. Honolulu carries the largest absolute count due to population size, but its per-capita unsheltered rate (28.3) is lower than Kauaʻi's. Hawaiʻi County's unsheltered rate has been volatile, peaking at 57 per 10K in 2016 before falling to 25 in 2024. Maui's unsheltered rate declined to 17 per 10K in 2024, the lowest of the four counties, despite the August 2023 wildfires because most wildfire-displaced residents were counted as sheltered. The total-homeless view shows a different pattern: Kauaʻi's total rate (71 per 10K) remains the highest, but the gap with other counties narrows because shelter capacity is more evenly distributed.",
    "useConsolidated": true,
    "dataNote": "Based on HUD Point-in-Time counts, a single-night snapshot. Methodology changes between years can affect comparability.",
    "hawaii": {
      "2007": 25.52,
      "2008": 25.21,
      "2009": 18.67,
      "2010": 16.84,
      "2011": 18.45,
      "2012": 17.93,
      "2013": 18.2,
      "2014": 21.65,
      "2015": 26.57,
      "2016": 29.57,
      "2017": 26.06,
      "2018": 23.8,
      "2019": 24.98,
      "2020": 25.15,
      "2022": 26.03,
      "2023": 27.23,
      "2024": 28.17
    },
    "medianSeries": {
      "2007": 3.085,
      "2008": 3.25,
      "2009": 2.74,
      "2010": 2.86,
      "2011": 3.77,
      "2012": 3.365,
      "2013": 2.94,
      "2014": 2.24,
      "2015": 2.13,
      "2016": 2.225,
      "2017": 2.18,
      "2018": 2.06,
      "2019": 2.045,
      "2020": 2.355,
      "2022": 2.485,
      "2023": 2.84,
      "2024": 3.485
    },
    "policyLevers": "<ul class='cn-focus-list'><li><strong>Housing First and permanent supply</strong> · Randomized trials show Housing First reduces homelessness by 88% and improves housing stability by 41% compared to treatment-first models <a href=\"https://pmc.ncbi.nlm.nih.gov/articles/PMC8513528/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; U.S. programs produce a median benefit-to-cost ratio of 1.80:1, primarily from averted emergency and justice costs <a href=\"https://pmc.ncbi.nlm.nih.gov/articles/PMC8863642/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>.</li><li><strong>Shelter capacity and outreach</strong> · The Kauhale Initiative has opened over 850 village-style units <a href=\"https://homelessness.hawaii.gov/kauhale/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; scaling low-barrier shelter and rapid rehousing can shorten unsheltered episodes <a href=\"https://homelessness.hawaii.gov/wp-content/uploads/2026/01/SOHHS-HICH-Act-309-Report-to-2026-Legislature-signed.pdf\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>.</li><li><strong>Behavioral health and prevention</strong> · Integrated behavioral health and housing programs outperform sequential treatment-then-housing models <a href=\"https://www.usich.gov/sites/default/files/document/Federal%20Resources%20for%20Addressing%20the%20Behavioral%20Health%20Needs%20of%20People%20Experiencing%20or%20at%20Risk%20of%20Homelessness.pdf\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; Hawaiʻi's mild climate allows year-round outdoor survival, increasing the visible unsheltered count relative to cold-weather states.</li></ul>",
    "nextUpdate": "Nov",
    "rankHistoryNarrative": {
      "summary": "At the unsheltered level, Hawaiʻi has ranked last or near-last every year since 2012. At the total-homeless level (sheltered + unsheltered), the ranking improves slightly because Hawaiʻi has relatively more shelter capacity than some states, but remains among the worst five. The state has adopted Housing First in statute, launched the Kauhale Initiative (918 beds across 25 village sites), and runs a Return to Home relocation program with a 2% recidivism rate. The count has not declined because new inflow outpaces placements and available land for affordable housing is constrained by zoning and environmental rules.",
      "mode": "learn",
      "benchmarks": [
        {
          "state": "Virginia",
          "text": "Like Hawaiʻi, Virginia had fragmented homeless service providers operating separate databases and waitlists. Virginia cut unsheltered homelessness 47% from 2010 to 2019 by requiring every provider statewide to share one database and one housing waitlist, backed by a dedicated Housing Trust Fund.",
          "source": {
            "label": "Virginia Housing Trust Fund Homeless Reduction Grants - DHCD",
            "url": "https://www.dhcd.virginia.gov/vhtf-homeless-reduction"
          }
        }
      ],
      "explore": [
        "Virginia unified provider data to drive placements; Oregon spent $1.7 billion on services without expanding supply. Hawaiʻi's Kauhale Initiative achieves $20,000 per unit on surplus state and federal land, compared to $200,000-plus for conventional affordable housing; scaling to 5,000 units would require more military and state surplus land transfers. The Return to Home program costs $500,000 per year, relocates mainland-connected individuals at a 2 percent return rate, and died in the 2025 legislature."
      ],
      "caution": {
        "state": "Oregon",
        "text": "Oregon demonstrates the risk Hawaiʻi faces: spending on services without expanding housing supply does not reduce unsheltered counts. Oregon spent $1.7 billion on homelessness from 2019 to 2024 while unsheltered counts rose 17% and homeless deaths quadrupled. Hawaiʻi faces the same structural risk.",
        "source": {
          "label": "Oregon Statewide Homelessness Estimates 2024 - Oregon Legislative Assembly",
          "url": "https://olis.oregonlegislature.gov/liz/2025R1/Downloads/CommitteeMeetingDocument/288059"
        }
      }
    },
    "thresholdVariants": {
      "all": {
        "officialName": "One-night count of all homeless people (sheltered and unsheltered combined), per 10,000 residents.",
        "hawaii": {
          "2012": 45.3,
          "2013": 45.4,
          "2014": 49.1,
          "2015": 53.9,
          "2016": 55.7,
          "2017": 50.6,
          "2018": 45.8,
          "2019": 45.1,
          "2020": 45.6,
          "2022": 41.2,
          "2023": 43.2,
          "2024": 80.7
        },
        "medianSeries": {
          "2012": 14.15,
          "2013": 13.3,
          "2014": 12.35,
          "2015": 11.75,
          "2016": 11.2,
          "2017": 10.85,
          "2018": 10.7,
          "2019": 10,
          "2020": 10.55,
          "2022": 10.6,
          "2023": 11.1,
          "2024": 12.45
        }
      }
    }
  },
  "road_poor_pct": {
    "area": "Infrastructure & Trust",
    "metric": "Roads in Poor Condition",
    "officialName": "Share of public road miles rated poor based on ride quality measured by the International Roughness Index.",
    "sourceCategory": "federal",
    "unit": "%",
    "unitLabel": "of road miles rated poor",
    "goodDirection": "down",
    "source": "FHWA Highway Statistics, Table HM-64",
    "sourceUrl": "https://www.fhwa.dot.gov/policyinformation/statistics.cfm",
    "whyItMatters": "Road quality affects commute time, vehicle wear, safety, and getting around every day. Hawaiʻi has about 4,500 miles of rated public roads, so each percentage point on this rate covers roughly 45 miles of pavement.",
    "scale": {
      "denominator": 4522,
      "denominatorRounded": 4500,
      "unit": "miles of public roads",
      "year": 2023,
      "source": "FHWA Highway Statistics 2023 Table HM-20"
    },
    "howToRead": "Hawaiʻi is far worse than the median at both thresholds. The default view shows roads rated poor only; the poor-and-mediocre view adds acceptable/mediocre roads, roughly tripling the share. The gap has narrowed since 2013 but remains large.",
    "potentialDrivers": "Road quality ranks among the worst in the nation while broadband is better than average, a sign that digital infrastructure grew faster than physical infrastructure could be maintained. <a href=\"https://hidot.hawaii.gov/highways/files/2024/05/HDOT_TAMP_Final_May_2024.pdf\">HDOT's 2024 asset management plan</a> found that 15 percent of the system carries 47 percent of daily traffic, island geography leaves few alternate routes, and reconstruction is cost-prohibitive because materials and labor are limited. Fuel efficiency gains have eroded gas-tax revenues, and in 2025 the state launched a <a href=\"https://hidot.hawaii.gov/wp-content/uploads/2025/10/FINAL-ESWRP-2025-10-15.pdf\">road usage charge program</a> to offset that shortfall. <a href=\"https://climate.hawaii.gov/hi-facts/sea-level-rise/\">The state climate portal</a> notes flooding and erosion are already damaging roads, adding climate-driven deterioration on top of routine wear. Measurement caveat: <a href=\"https://www.fhwa.dot.gov/policyinformation/statistics/2023/hm47.cfm\">FHWA notes</a> this metric is roughness-based (IRI) and does not capture all pavement distress or local roads outside the federal system.",
    "countyNarrative": "Oʻahu carries the heaviest traffic load and faces the sharpest wear on its core corridors: HDOT data show that a small share of road miles on the island absorb the majority of daily vehicle trips, creating concentrated pavement stress that outpaces maintenance budgets. The neighbor islands face different but equally difficult conditions: Hawaiʻi County has extensive rural road networks exposed to volcanic soil, heavy rainfall, and lava-zone geology that accelerates deterioration. Maui County roads on the north shore and Hana Highway corridor face persistent erosion and flooding damage from coastal storms. Kauaʻi's narrow, mountainous roads on the north shore have experienced repeated closures and rebuilds due to landslides and wave damage, making per-mile repair costs among the highest in the state.",
    "dataNote": "Values 2000-2006 come from earlier FHWA Highway Statistics Table HM-64 vintages, when state Departments of Transportation were still transitioning to standardized International Roughness Index (IRI) reporting protocols. Year-over-year swings in this period (e.g., Hawaiʻi 2000-2001, 2004-2005) reflect methodology and coverage changes rather than actual road-condition changes. The 2007+ series uses the consolidated reporting standard and is the appropriate window for trend analysis; earlier years are kept for long-run context. 2010 and 2021 are absent from the FHWA source.",
    "useConsolidated": true,
    "hawaii": {
      "2000": 0.1111,
      "2001": 0.1991,
      "2002": 0.1832,
      "2003": 0.1306,
      "2004": 0.1104,
      "2005": 0.1832,
      "2006": 0.2152,
      "2007": 0.2102,
      "2008": 0.2241,
      "2009": 0.2019,
      "2011": 0.2448,
      "2012": 0.2456,
      "2013": 0.2467,
      "2014": 0.2307,
      "2015": 0.2279,
      "2016": 0.2295,
      "2017": 0.2408,
      "2018": 0.2428,
      "2019": 0.2611,
      "2020": 0.2222,
      "2022": 0.2155,
      "2023": 0.2162,
      "2024": 0.1537
    },
    "medianSeries": {
      "2000": 0.0736,
      "2001": 0.0665,
      "2002": 0.0688,
      "2003": 0.0738,
      "2004": 0.0849,
      "2005": 0.0773,
      "2006": 0.0691,
      "2007": 0.0666,
      "2008": 0.0649,
      "2009": 0.0737,
      "2011": 0.0815,
      "2012": 0.0814,
      "2013": 0.0751,
      "2014": 0.0736,
      "2015": 0.0835,
      "2016": 0.0895,
      "2017": 0.0867,
      "2018": 0.0791,
      "2019": 0.0776,
      "2020": 0.0836,
      "2022": 0.0744,
      "2023": 0.0708,
      "2024": 0.0645
    },
    "policyLevers": "<ul class='cn-focus-list'><li><strong>Preventive maintenance funding</strong> · FHWA research shows preventive treatments applied while pavement is still in acceptable condition are four to five times more cost-effective than allowing roads to deteriorate to reconstruction <a href=\"https://www.fhwa.dot.gov/preservation/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; Hawaiʻi's salt air, heavy rainfall, and volcanic soil accelerate deterioration faster than on the mainland.</li><li><strong>Revenue and asset management</strong> · Hawaiʻiʻs road usage charge launched for EVs in 2025 and expands to all vehicles by 2033, potentially restoring the revenue base <a href=\"https://hidot.hawaii.gov/hawai%CA%BBi-road-usage-charge-program/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; Concentrating maintenance spending on the highest-traffic segments, where failure has no alternate route, yields the largest returns per dollar <a href=\"https://hidot.hawaii.gov/highways/files/2024/05/HDOT_TAMP_Final_May_2024.pdf\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>.</li><li><strong>Federal funding and project delivery</strong> · Federal infrastructure-law funds allocate roughly $510 million to Hawaiʻi over five years with state-of-good-repair requirements directing more to maintenance; Virginia's SMART SCALE program demonstrates how data-driven project scoring improves road condition more effectively than ad hoc capital spending <a href=\"https://smartscale.virginia.gov/how-it-works/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>.</li></ul>",
    "nextUpdate": "Nov",
    "rankHistoryNarrative": {
      "summary": "Hawaiʻi has ranked at the bottom (#45 or worse) every year since 2006, with no sustained improvement. The 2000-2005 series is noisier because state IRI methodology was still standardizing, and Hawaiʻi's rank swung between the middle and bottom tiers before settling. The poor-and-mediocre view (both combined) shows about 60% of Hawaiʻi's rated miles are below good condition, roughly double the median. Salt air, heavy rainfall, and volcanic soil accelerate deterioration, and preventive maintenance is consistently the first item cut when budgets tighten.",
      "mode": "learn",
      "benchmarks": [
        {
          "state": "Virginia",
          "text": "Like Hawaiʻi, Virginia needed a systematic method to prioritize limited road dollars across competing projects. Virginia overhauled its transportation spending in 2015 with the SMART SCALE program, a data-driven project scoring system that ranks capital investments by cost-efficiency, safety, accessibility, and economic impact before committing funds. VDOT adopted a formal pavement management system with a published target of maintaining at least 82 percent of state-maintained roads in acceptable condition. Virginia's road condition rankings improved measurably in the five years following implementation.",
          "source": {
            "label": "SMART SCALE: How It Works - Virginia's Official Program Site",
            "url": "https://smartscale.virginia.gov/how-it-works/"
          }
        }
      ],
      "explore": [
        "Virginia's SMART SCALE prioritized cost-effective maintenance; Rhode Island's capital package funded visible projects over systematic upkeep. Federal infrastructure-law funds allocate approximately $510 million to Hawaiʻi over five years, with state-of-good-repair requirements directing more to maintenance. Neighbor island road maintenance costs more per mile than Oʻahu because every piece of equipment and material must be shipped separately."
      ],
      "caution": {
        "state": "Rhode Island",
        "text": "Like Hawaiʻi, Rhode Island directed capital spending to high-visibility projects rather than cost-effective maintenance, and road quality did not improve. Rhode Island passed a major transportation funding package in 2016 (RhodeWorks) and directed a significant share to high-visibility bridge repairs. By 2020, Rhode Island still ranked near the bottom in road quality despite the investment. Capital infusions without systematic maintenance prioritization fund visible projects rather than cost-effective ones.",
        "source": {
          "label": "RI Bridges Improving After 5 Years of RhodeWorks - WPRI",
          "url": "https://www.wpri.com/target-12/ri-bridges-improving-after-5-years-of-rhodeworks-tolls-still-in-legal-limbo/"
        }
      }
    },
    "thresholdVariants": {
      "notgood": {
        "officialName": "Share of public road miles rated acceptable or poor (IRI > 95), combining mediocre and poor pavement quality.",
        "unitLabel": "of road miles rated poor or mediocre",
        "hawaii": {
          "2007": 0.8852,
          "2008": 0.8963,
          "2009": 0.8133,
          "2011": 0.6731,
          "2012": 0.6717,
          "2013": 0.7601,
          "2014": 0.7504,
          "2015": 0.7114,
          "2016": 0.7093,
          "2017": 0.7022,
          "2018": 0.7172,
          "2019": 0.7008,
          "2020": 0.6748,
          "2022": 0.6221,
          "2023": 0.6024
        },
        "medianSeries": {
          "2007": 0.4712,
          "2008": 0.4463,
          "2009": 0.4559,
          "2011": 0.4445,
          "2012": 0.4361,
          "2013": 0.4203,
          "2014": 0.3953,
          "2015": 0.386,
          "2016": 0.423,
          "2017": 0.4082,
          "2018": 0.3843,
          "2019": 0.3941,
          "2020": 0.3684,
          "2022": 0.3892,
          "2023": 0.378
        }
      }
    }
  },
  "broadband_subscription_pct": {
    "area": "Infrastructure & Trust",
    "metric": "Households with Broadband",
    "officialName": "Share of households with a fixed broadband internet subscription, including cable, fiber, DSL, or fixed wireless.",
    "sourceCategory": "federal",
    "unit": "%",
    "unitLabel": "of households have broadband",
    "goodDirection": "up",
    "source": "Census ACS",
    "sourceUrl": "https://data.census.gov/",
    "whyItMatters": "Broadband access affects whether households can work remotely, do schoolwork, and access telehealth and government services. Hawaiʻi has about 493,000 households, so each percentage point on this rate represents roughly 5,000 households with or without broadband.",
    "scale": {
      "denominator": 493151,
      "denominatorRounded": 493000,
      "unit": "households",
      "year": 2023,
      "source": "Census ACS 2023 Table DP04"
    },
    "howToRead": "Both lines rise steadily toward universal coverage. Hawaiʻi has been better than the median, though the gap has narrowed in recent years.",
    "potentialDrivers": "Broadband (#21) outperforms road quality (#47), an unusual split for a state with aging physical infrastructure. Hawaiʻi's better-than-average rate masks concentrated gaps in affordability and neighbor-island service. <a href=\"https://broadband.hawaii.gov/digitalequityplan/\">Hawaiʻi's 2024 Digital Equity Plan</a> found the divide is concentrated among rural and socioeconomically disadvantaged residents and includes unreliable or nonexistent service, device gaps, and weak digital skills. A <a href=\"https://files.hawaii.gov/dbedt/annuals/archive/2023/2023-hbdeo-scr41.pdf\">2023 HBDEO and UH mapping effort</a> identified 12,740 unserved or underserved locations, mostly on Hawaiʻi Island and Maui rather than Oʻahu. <a href=\"https://dbedt.hawaii.gov/hhfdc/files/2025/06/Broadband-Connectivity-Report-Final-062724.pdf\">HHFDC found in 2025</a> that 16 percent of Hawaiʻi households relied on mobile-only connections, a group with lower incomes and education levels, consistent with a <a href=\"https://www2.census.gov/library/publications/2024/demo/acs-56.pdf\">2024 Census finding</a> that broadband subscription rates drop sharply for lower-income and less-educated households. One caveat: slow or unreliable service can still count as connected in this metric, so the ranking likely overstates actual access quality.",
    "countyNarrative": "Kauaʻi County has overtaken Honolulu for the highest broadband subscription rate in recent years, supported by targeted infrastructure investment, supported by dense urban infrastructure, more ISP competition, and higher average incomes that make subscriptions more affordable. Hawaiʻi County has the most unserved and underserved locations of any county, driven by its large rural land area, dispersed communities in Puna, Ka'u, and North Kohala, and terrain that raises fixed-line buildout costs. Maui County has significant coverage gaps in rural and remote communities including Hana, Molokaʻi, and Lānaʻi, where terrain and small population density make infrastructure investment harder to justify commercially. Kauaʻi County has rural north shore and west side communities with limited or mobile-only connectivity, though its smaller total population keeps the absolute number of unserved locations lower than on the Big Island.",
    "useConsolidated": true,
    "dataNote": "Pre-2016 data excluded due to Census variable definition change",
    "hawaii": {
      "2016": 0.8318,
      "2017": 0.8448,
      "2018": 0.8573,
      "2019": 0.8802,
      "2021": 0.9134,
      "2022": 0.9129,
      "2023": 0.9262,
      "2024": 0.9304
    },
    "medianSeries": {
      "2016": 0.8101,
      "2017": 0.832,
      "2018": 0.8451,
      "2019": 0.8593,
      "2021": 0.899,
      "2022": 0.9067,
      "2023": 0.9191,
      "2024": 0.9281
    },
    "policyLevers": "<ul class='cn-focus-list'><li><strong>Last-mile deployment</strong> · $149 million in federal broadband funding targets approximately 7,000 unserved locations <a href=\"https://broadband.hawaii.gov/about/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>, with 82% allocated to fiber builds <a href=\"https://broadband.hawaii.gov/digitalequityplan/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>.</li><li><strong>Affordability and adoption</strong> · The federal Affordable Connectivity Program expired in June 2024, ending a $30/month subsidy for 23 million households nationally <a href=\"https://www.fcc.gov/acp\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; restoring or replacing this subsidy is the most direct lever for mobile-only households <a href=\"https://dbedt.hawaii.gov/hhfdc/files/2025/06/Broadband-Connectivity-Report-Final-062724.pdf\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>.</li><li><strong>Digital skills and device access</strong> · Census data shows broadband subscription rates drop sharply for lower-income and less-educated households regardless of infrastructure availability <a href=\"https://www2.census.gov/library/publications/2024/demo/acs-56.pdf\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; Hawaiʻi funded six digital navigator positions across the islands in 2025-2026 to address skills and device gaps beyond connectivity <a href=\"https://broadbandbreakfast.com/hawaii-implements-digital-navigators-with-expected-bead-funding/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>.</li></ul>",
    "nextUpdate": "Sep",
    "rankHistoryNarrative": {
      "summary": "Hawaiʻi has ranked #13 to #21 since 2016, generally in the top half. The lead reflects high household income and urban density on Oʻahu, with remaining gaps concentrated in rural neighbor island areas where affordability, not infrastructure, is the constraint.",
      "mode": "protect",
      "benchmarks": [
        {
          "state": "Utah",
          "text": "Like Hawaiʻi, Utah has rural communities underserved by commercial ISPs that required public infrastructure investment. Utah has ranked among the top five states in broadband subscription for most of the past decade. Utah's performance is anchored by UTOPIA Fiber, a municipal fiber consortium formed in 2002 by eleven cities that built open-access gigabit infrastructure available to any competing provider. Utah also established a state broadband office in 2020 that coordinates deployment funding and tracks coverage gaps at the census block level. Utah's rural broadband subscription rates have consistently ranked higher than comparably rural states.",
          "source": {
            "label": "UTOPIA Fiber History - utopiafiber.com",
            "url": "https://www.utopiafiber.com/utopia-fiber-history/"
          }
        }
      ],
      "explore": [
        "Utah's UTOPIA Fiber solved infrastructure; Mississippi shows infrastructure alone is not enough when affordability is the constraint. Hawaiʻi's remaining gap is primarily cost: the federal Affordable Connectivity Program covered roughly 50,000 Hawaiʻi households before expiring in 2024, and rural Maui, Hawaiʻi County, and Molokaʻi have subscription rates near or worse than the median."
      ],
      "caution": {
        "state": "Mississippi",
        "text": "Mississippi shows that building broadband infrastructure does not automatically produce higher subscription rates when affordability remains the barrier. Mississippi received substantial federal and state infrastructure investment to extend broadband access during the 2010s, building out last-mile fiber to previously unserved rural communities. Despite increased infrastructure availability, subscription rates remained near the bottom of national rankings through 2023. The Mississippi experience illustrates that building infrastructure does not automatically translate into higher subscription rates when households face cost barriers, and that affordability programs are necessary alongside deployment investment.",
        "source": {
          "label": "Exploring Broadband Adoption in Mississippi - MSU Extension Service",
          "url": "https://extension.msstate.edu/publications/exploring-broadband-adoption-mississippi"
        }
      }
    }
  },
  "residential_price_cpkwh": {
    "area": "Affordability",
    "metric": "Residential Electricity Price",
    "officialName": "Average retail electricity price paid by residential customers, in cents per kilowatt-hour.",
    "sourceCategory": "federal",
    "unit": "¢/kWh",
    "unitLabel": "cents per kilowatt-hour",
    "goodDirection": "down",
    "source": "EIA",
    "sourceUrl": "https://www.eia.gov/electricity/data/state/",
    "whyItMatters": "Electricity prices hit households every month and raise the broader cost of living.",
    "howToRead": "Two sharp divergences define the chart: the 1973 and 1979 oil shocks drove Hawaiʻi's line far worse than the median because island grids had no alternative to imported oil. The gap never closed. Watch whether the renewable transition bends the line back toward the average or whether transition costs keep it elevated.",
    "dataNote": "This is the EIA residential average: total residential revenue (including all surcharges, fees, and fixed monthly charges) divided by total residential kWh sold. It is residential-only, not a blend of all sectors. Because it averages across all island utilities, neighbor-island residents (Maui, Hawaiʻi Island, Molokaʻi) typically pay several cents more per kWh than the statewide figure, while Oʻahu residents pay close to it.",
    "potentialDrivers": "Hawaiʻi pays far more than the median, yet also has the most ambitious renewable target (100% by 2045). Residents are paying for both the old fossil system and the new clean one simultaneously. <a href=\"https://www.eia.gov/todayinenergy/detail.php?id=65244\" target=\"_blank\" rel=\"noopener\">EIA reported in May 2025</a> that most grid-delivered electricity in Hawaiʻi still came from petroleum-fired generators, and the <a href=\"https://puc.hawaii.gov/wp-content/uploads/2025/01/Hawaii-PUC-Energy-Inclinations-White-Paper-FINAL.12.31.24_signed.pdf\" target=\"_blank\" rel=\"noopener\">PUC's January 2025 energy white paper</a> found that evening power remains the most expensive because fossil fuels still dominate supply at peak hours, while a large Oʻahu battery meant to store lower-cost renewables is still mostly charged by fossil plants. The <a href=\"https://energy.hawaii.gov/wp-content/uploads/2026/01/2025-HSEO-Annual-Report.pdf\" target=\"_blank\" rel=\"noopener\">HSEO's 2025 annual report</a> found that total renewable share, counting both utility-scale and rooftop solar, has grown to 36% of state energy supply (up from 31% in 2023) and should lower costs over time, but noted that replacing aging fuel infrastructure and connecting new renewable projects can take up to nine years and that full grid modernization could cost $2 billion.",
    "countyNarrative": "Hawaiʻi's grid is fragmented by island with no inter-island transmission, creating four separate utilities: Hawaiian Electric (Oʻahu), Maui Electric (Maui, Molokaʻi, and Lānaʻi), Hawaiʻi Electric Light (Hawaiʻi Island), and the Kauaʻi Island Utility Cooperative (KIUC). All four relied heavily on imported petroleum through 2023, which is the primary driver of the state's high rates. Kauaʻi has advanced furthest on renewables, with a solar-plus-battery system covering a growing share of daytime demand, and KIUC rates have stabilized relative to the HECO-family utilities on Oʻahu, Maui, and Hawaiʻi Island, which are still mid-transition away from oil-fired generation.",
    "useConsolidated": true,
    "hawaii": {
      "1970": 2.8,
      "1971": 2.95,
      "1972": 2.99,
      "1973": 3.27,
      "1974": 3.78,
      "1975": 4.98,
      "1976": 5.14,
      "1977": 5.6,
      "1978": 6.25,
      "1979": 6.75,
      "1980": 8.07,
      "1981": 12.14,
      "1982": 13.17,
      "1983": 11.9,
      "1984": 11.8,
      "1985": 11.36,
      "1986": 9.27,
      "1987": 9.43,
      "1988": 8.83,
      "1989": 9.28,
      "1990": 10.26,
      "1991": 10.52,
      "1992": 10.9,
      "1993": 12.28,
      "1994": 12.45,
      "1995": 13.32,
      "1996": 14.26,
      "1997": 14.8,
      "1998": 13.82,
      "1999": 14.3,
      "2000": 16.41,
      "2001": 16.34,
      "2002": 15.63,
      "2003": 16.73,
      "2004": 18.06,
      "2005": 20.7,
      "2006": 23.35,
      "2007": 24.12,
      "2008": 32.5,
      "2009": 24.2,
      "2010": 28.1,
      "2011": 34.68,
      "2012": 37.34,
      "2013": 36.98,
      "2014": 37.04,
      "2015": 29.6,
      "2016": 27.47,
      "2017": 29.5,
      "2018": 32.47,
      "2019": 32.06,
      "2020": 30.28,
      "2021": 33.49,
      "2022": 43.03,
      "2023": 42.39,
      "2024": 42.86,
      "2025": 40.59
    },
    "medianSeries": {
      "1970": 2.39,
      "1971": 2.405,
      "1972": 2.51,
      "1973": 2.61,
      "1974": 3.005,
      "1975": 3.41,
      "1976": 3.685,
      "1977": 3.97,
      "1978": 4.265,
      "1979": 4.515,
      "1980": 5.345,
      "1981": 5.965,
      "1982": 6.685,
      "1983": 6.98,
      "1984": 6.855,
      "1985": 7.12,
      "1986": 7.21,
      "1987": 7.31,
      "1988": 7.24,
      "1989": 7.34,
      "1990": 7.385,
      "1991": 7.53,
      "1992": 7.735,
      "1993": 7.825,
      "1994": 7.765,
      "1995": 7.83,
      "1996": 7.715,
      "1997": 7.745,
      "1998": 7.58,
      "1999": 7.55,
      "2000": 7.625,
      "2001": 7.845,
      "2002": 7.765,
      "2003": 8.075,
      "2004": 8.27,
      "2005": 8.645,
      "2006": 9.09,
      "2007": 9.365,
      "2008": 10.095,
      "2009": 10.33,
      "2010": 10.555,
      "2011": 11.05,
      "2012": 11.32,
      "2013": 11.405,
      "2014": 11.895,
      "2015": 11.91,
      "2016": 11.965,
      "2017": 12.315,
      "2018": 12.21,
      "2019": 12.405,
      "2020": 12.325,
      "2021": 12.635,
      "2022": 13.79,
      "2023": 14.28,
      "2024": 14.84,
      "2025": 15.345
    },
    "policyLevers": "<ul class='cn-focus-list'><li><strong>Fuel mix and renewable transition</strong> · KIUC on Kauaʻi posts the lowest residential rates statewide through fixed-price solar-plus-battery contracts <a href=\"https://kiuc.coop/renewable-portfolio\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; scaling similar procurement to Oʻahu and Maui could displace the petroleum generation that keeps evening rates highest <a href=\"https://puc.hawaii.gov/wp-content/uploads/2025/01/Hawaii-PUC-Energy-Inclinations-White-Paper-FINAL.12.31.24_signed.pdf\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>.</li><li><strong>Grid modernization costs</strong> · The PUC capped HECOʻs Waiau repowering cost recovery and required 51% renewable fuel by 2032 <a href=\"https://energy.hawaii.gov/energy-affordability-signalled-as-state-priority-public-utilities-commission-heeds-calls-for-rate-accountability-in-waiau-repowering/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; phased cost recovery and competitive procurement can limit ratepayer exposure during the transition <a href=\"https://energy.hawaii.gov/wp-content/uploads/2026/01/2025-HSEO-Annual-Report.pdf\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>.</li><li><strong>Rate design and affordability</strong> · HECO's new time-of-use billing shifts price signals across daytime, evening peak, and overnight periods <a href=\"https://puc.hawaii.gov/energy/der/ard/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; pending rate cases and wildfire mitigation spending of $450 million through 2027 could push bills higher before renewables bring long-term savings <a href=\"https://www.hawaiianelectric.com/billing-and-payment/rates-and-regulations/effective-rate-summary\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>.</li></ul>",
    "nextUpdate": "Mar",
    "latestMonthly": {
      "value": 43,
      "period": "Feb 2026",
      "asOf": "2026-05-13"
    },
    "rankHistoryNarrative": {
      "summary": "Hawaiʻi has ranked #50 since the mid-1990s. The 1973 oil embargo opened a permanent gap: mainland grids shifted to gas and coal while Hawaiʻi stayed on oil. Renewable generation has grown to over 40 percent by 2025, but transition capital costs pass through to ratepayers and the price gap has widened, not closed.",
      "mode": "learn",
      "benchmarks": [
        {
          "state": "Alaska",
          "text": "Like Hawaiʻi, Alaska has isolated grids dependent on shipped-in fossil fuel, making rural energy costs structurally high. Alaska established the Renewable Energy Fund in 2008, a competitive grant program for rural diesel-dependent communities to transition to renewable generation. Communities used the grants to combine wind turbines and battery-backed hydropower, with Kodiak Island achieving near-full renewable generation and reducing diesel imports from 2.3 million gallons per year to near zero. Rates in Kodiak stabilized while surrounding diesel-dependent communities continued to face volatile fuel costs.",
          "source": {
            "label": "The Renewable Energy Fund - Alaska Renewable Energy Project (REAP)",
            "url": "https://alaskarenewableenergy.org/initiatives/the-renewable-energy-fund/"
          }
        }
      ],
      "explore": [
        "Alaska's Renewable Energy Fund gave isolated communities a path off diesel; California's transition costs passed through without closing the price gap. Within Hawaiʻi, Kauaʻi Island Utility Cooperative shows the model working: KIUC went from 92 percent petroleum-dependent in 2011 to roughly 70 percent renewable by 2022, posting Hawaiʻi's lowest rate during the 2022 oil spike. HECO adopted Performance-Based Regulation in 2020, but in 2025 the PUC opened a traditional rate case that renewable advocates argue reverts to the old model."
      ],
      "caution": {
        "state": "California",
        "text": "Like Hawaiʻi, California passed through renewable transition costs to ratepayers, widening the gap with states that kept legacy generation. California's electricity prices rose roughly 50 percent over the decade ending 2024 despite aggressive renewable mandates. Above-market contracts with ratepayer backstops, wildfire liability shifted to utility rates, and uncapped utility capital spending drove costs up even as renewable share increased. Connecticut followed a similar path and began rolling back its renewable portfolio target.",
        "source": {
          "label": "Why Are California's Electricity Prices So High? - California Legislative Analyst's Office",
          "url": "https://lao.ca.gov/Publications/Report/4793"
        }
      }
    }
  },
  "renewables_share_gen": {
    "area": "Infrastructure & Trust",
    "metric": "Electricity from Renewables",
    "officialName": "Share of in-state electricity generation from renewable sources, including wind, solar, hydro, geothermal, and biomass.",
    "sourceCategory": "federal",
    "unit": "%",
    "unitLabel": "% of electricity generated",
    "goodDirection": "up",
    "source": "EIA",
    "sourceUrl": "https://www.eia.gov/electricity/data/state/",
    "whyItMatters": "Renewable electricity shows whether the power system is becoming cleaner, less dependent on imported oil, and better able to handle fuel price swings.",
    "howToRead": "Hawaiʻi has been better than the median for most of the record, reflecting how few states generate a large share from renewables. The gap widened through the 2010s and 2020s as Hawaiʻi's solar and battery installations accelerated. A handful of hydro- and wind-heavy states still perform far better than Hawaiʻi, which is why Hawaiʻi ranks near the middle (#22) despite being better than the typical state.",
    "potentialDrivers": "Hawaiʻi leads in rooftop solar, with roughly one in three homes generating electricity. But rooftop solar counts toward the 100% target only if the grid can absorb it. The main bottleneck is Oʻahu: the <a href=\"https://energy.hawaii.gov/wp-content/uploads/2026/01/2025-HSEO-Annual-Report.pdf\">HSEO 2025 annual report</a> noted Oʻahu's electricity demand is roughly 19 times Kauaʻi's and accounts for about 70 percent of the state's generation needs, so transitioning that single large grid dominates the statewide figure. HSEO also found that renewable projects have been delayed by long permitting and regulatory review, interconnection problems, community and land-use concerns, imported equipment costs, and financing challenges, with a new project taking up to nine years to interconnect and grid modernization potentially costing $2 billion. A <a href=\"https://puc.hawaii.gov/wp-content/uploads/2025/01/Hawaii-PUC-Energy-Inclinations-White-Paper-FINAL.12.31.24_signed.pdf\">January 2025 PUC white paper</a> added that a large Oʻahu battery intended to bring on more low-cost renewable power is still being charged mostly by fossil plants. One measurement note: this metric counts utility-scale generation only and misses <a href=\"https://energy.hawaii.gov/wp-content/uploads/2025/01/HSEO-Alternative-Fuels-Study-Final-Report.pdf\">Hawaiʻi's substantial rooftop-solar capacity</a>, so the statewide clean-energy picture is meaningfully better than this number alone shows.",
    "countyNarrative": "Renewable progress varies sharply by island because each runs its own isolated grid. Kauaʻi (KIUC) is the national leader among island utilities, with solar-plus-battery and hydropower covering over 70 percent of its electricity needs. Hawaiʻi Island benefits from the Puna Geothermal Venture providing renewable baseload, supplemented by growing solar, and has one of the higher renewable shares among all U.S. island grids. Maui County has expanded solar and wind but faces land-use constraints. Oʻahu, which accounts for roughly 70 percent of statewide generation demand, has the lowest renewable share and the longest path to the 100% Clean Energy goal; the state's overall figure rises or falls primarily on Oʻahu's pace.",
    "useConsolidated": true,
    "hawaii": {
      "2001": 0.0562,
      "2002": 0.04,
      "2003": 0.0563,
      "2004": 0.0564,
      "2005": 0.055,
      "2006": 0.0638,
      "2007": 0.0733,
      "2008": 0.0757,
      "2009": 0.0742,
      "2010": 0.0754,
      "2011": 0.0908,
      "2012": 0.0993,
      "2013": 0.1174,
      "2014": 0.1274,
      "2015": 0.1324,
      "2016": 0.1445,
      "2017": 0.1415,
      "2018": 0.1326,
      "2019": 0.1214,
      "2020": 0.1587,
      "2021": 0.1902,
      "2022": 0.1902,
      "2023": 0.2024,
      "2024": 0.2125,
      "2025": 0.2205
    },
    "medianSeries": {
      "2001": 0.0392,
      "2002": 0.0412,
      "2003": 0.0495,
      "2004": 0.0485,
      "2005": 0.0479,
      "2006": 0.0466,
      "2007": 0.0449,
      "2008": 0.0532,
      "2009": 0.0607,
      "2010": 0.0663,
      "2011": 0.0756,
      "2012": 0.0752,
      "2013": 0.0784,
      "2014": 0.0894,
      "2015": 0.0885,
      "2016": 0.0938,
      "2017": 0.1174,
      "2018": 0.1166,
      "2019": 0.124,
      "2020": 0.1567,
      "2021": 0.1427,
      "2022": 0.1369,
      "2023": 0.1535,
      "2024": 0.1577,
      "2025": 0.1787
    },
    "policyLevers": "<ul class='cn-focus-list'><li><strong>Utility-scale procurement</strong> · Renewable share reached 36% statewide in 2025, and an executive order accelerated the 100% target to 2035 for neighbor islands <a href=\"https://energy.hawaii.gov/wp-content/uploads/2026/01/2025-HSEO-Annual-Report.pdf\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; Scaling Oʻahu procurement to match neighbor-island renewable progress is the binding constraint for statewide gains <a href=\"https://energy.hawaii.gov/hawaii-clean-energy-initiative/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>.</li><li><strong>Storage and grid integration</strong> · KIUC reached 51% renewable by 2024 through co-located solar-plus-battery contracts <a href=\"https://kiuc.coop/renewable-portfolio\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>, proving isolated island grids can integrate high shares <a href=\"https://puc.hawaii.gov/wp-content/uploads/2025/01/Hawaii-PUC-Energy-Inclinations-White-Paper-FINAL.12.31.24_signed.pdf\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>.</li><li><strong>Permitting and interconnection</strong> · A 2025 strategic partnership with JERA aims to accelerate grid modernization <a href=\"https://energy.hawaii.gov/wp-content/uploads/2026/01/2025-HSEO-Annual-Report.pdf\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; streamlining interconnection review from the current multi-year timeline is the highest-leverage change <a href=\"https://cnee.colostate.edu/wp-content/uploads/2025/11/Updated_HI-State-Brief_2025.pdf\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>.</li></ul>",
    "nextUpdate": "Mar",
    "latestMonthly": {
      "value": 13.4,
      "period": "Feb 2026",
      "asOf": "2026-05-13"
    },
    "rankHistoryNarrative": {
      "summary": "Hawaiʻi has generated a larger share of its electricity from renewables than the typical state throughout the two decades on record. Rank #22 reflects a handful of hydro- and wind-heavy states (Washington, Iowa, Oregon, South Dakota) that pull well ahead in absolute share. Hawaiʻi has kept improving but has not closed the gap with those leaders.",
      "mode": "learn",
      "benchmarks": [
        {
          "state": "Iowa",
          "text": "Unlike Hawaiʻi, Iowa established utility-scale procurement early, giving the grid a stable renewable base before distributed generation complicated dispatch. Iowa enacted the first state Renewable Portfolio Standard in the nation in 1983. By the early 2000s, Iowa had developed long-term fixed-price wind contracts with utilities that made wind development financially predictable. Iowa's wind energy share crossed 60 percent of total generation by 2020, the highest of any large state. The fixed-price contract structure allowed developers to finance projects without relying on volatile wholesale electricity prices, and the state's transmission investment kept interconnection costs low enough to sustain continued development.",
          "source": {
            "label": "Iowa State Energy Profile - U.S. Energy Information Administration",
            "url": "https://www.eia.gov/state/print.php?sid=IA"
          }
        }
      ],
      "explore": [
        "Iowa built a stable renewable base through utility-scale procurement; Arizona's policy reversal shows how distributed solar gains are vulnerable. Hawaiʻi's island grids must each balance supply independently, but each kilowatt-hour of oil replaced saves more than in any other state. Within the state, Kauaʻi's cooperative went from 92 percent petroleum-dependent in 2011 to roughly 70 percent renewable by 2022 through fixed-price solar-plus-storage contracts, posting Hawaiʻi's lowest electricity rate during the 2022 oil spike."
      ],
      "caution": {
        "state": "Arizona",
        "text": "Like Hawaiʻi, Arizona had high rooftop solar adoption that depended on net metering policies vulnerable to regulatory change. Arizona had among the highest rooftop solar adoption rates in the country through 2013, driven by net metering policies that credited solar customers at retail rates. In 2013, the Arizona Corporation Commission approved a monthly fixed charge on new solar customers after utilities argued that solar adopters were shifting grid costs to non-solar customers. New rooftop solar installations fell roughly 90 percent within months of the change. Arizona's experience illustrates how rate structure decisions by a state utility commission can rapidly reverse solar adoption gains independent of resource availability.",
        "source": {
          "label": "Arizona Corporation Commission Decision on Solar Fixed Charge - Vote Solar",
          "url": "https://votesolar.org/press-release-arizona-corporation-commission-decision-on-solar-step-down/"
        }
      }
    }
  },
  "food_insecurity_rate": {
    "area": "Affordability",
    "metric": "Food Insecurity Rate",
    "officialName": "3-year average share of households uncertain of having enough food due to lack of money or other resources.",
    "sourceCategory": "federal",
    "unit": "%",
    "unitLabel": "are food-insecure (3-yr avg)",
    "goodDirection": "down",
    "source": "USDA ERS",
    "sourceUrl": "https://www.ers.usda.gov/topics/food-nutrition-assistance/food-security-in-the-us",
    "whyItMatters": "Food insecurity shows whether families can reliably afford enough to eat. Hawaiʻi has about 493,000 households, so a one-point shift in this rate means roughly 5,000 more or fewer families unsure they can put meals on the table.",
    "scale": {
      "denominator": 493151,
      "denominatorRounded": 493000,
      "unit": "households",
      "year": 2023,
      "source": "Census ACS 2023 Table DP04"
    },
    "howToRead": "This uses 3-year rolling averages, so the line lags current conditions. The default view shows all food-insecure households; the severe view isolates very low food security, where households actually reduced food intake. Focus on whether the recent uptick is a sustained reversal or a temporary response to grocery price inflation.",
    "potentialDrivers": "Hawaiʻi imports over 80% of its food and has the highest cost of living, yet food insecurity remains well below what cost of living alone would predict. Strong safety-net programs and community food networks hold the line. The recent worsening is most likely an affordability squeeze: housing and groceries consume a disproportionate share of household budgets. <a href=\"https://files.hawaii.gov/dbedt/annuals/2025/2025-read-self-sufficiency.pdf\">DBEDT reported in 2025</a> that a single adult in Honolulu needed $42,698 a year just to meet basic needs, with housing the largest expense and food a major secondary one. <a href=\"https://www.fns.usda.gov/sites/default/files/resource-files/Statewide-Thrifty-Food-Plan-CostEstimate-for-Hawaii.pdf\">USDA found in December 2024</a> that Hawaiʻi's standard at-home food basket cost 55.95 percent more than on the mainland, a gap driven by near-total dependence on <a href=\"https://dab.hawaii.gov/add/files/2026/02/Hawaiis-Agricultural-and-Food-Imports-and-Exports_Feb.2026_final2.pdf\">imported proteins and staple foods</a>. <a href=\"https://hawaiifoodbank.org/wp-content/uploads/2026/02/HawaiiFoodbank_FoodInsecurityReport_2024-25.pdf\">Hawaiʻi Foodbank's 2024-25 report</a> concluded that structural solutions are needed because living costs remain persistently out of line with many households' incomes.",
    "countyNarrative": "Maui County has seen the sharpest recent increase in food hardship, driven by the economic displacement and job losses following the August 2023 wildfires. Hawaiʻi County consistently shows higher food insecurity than Honolulu, reflecting lower median incomes, a higher share of agricultural and lower-wage work, and greater distance from food distribution networks. Honolulu County, with more retail competition and higher average wages, tends to post the state's lowest food insecurity rate. Kauaʻi County's small, high-cost market and limited food retail options leave lower-income households particularly exposed to imported food price swings.",
    "useConsolidated": true,
    "dataNote": "Uses 3-year rolling averages; single-year spikes are smoothed",
    "hawaii": {
      "2006-2008": 0.091,
      "2007-2009": 0.114,
      "2008-2010": 0.131,
      "2009-2011": 0.138,
      "2010-2012": 0.14,
      "2011-2013": 0.129,
      "2012-2014": 0.1228,
      "2013-2015": 0.0966,
      "2014-2016": 0.0874,
      "2015-2017": 0.074,
      "2016-2018": 0.0796,
      "2017-2019": 0.084,
      "2018-2020": 0.089,
      "2019-2021": 0.0905,
      "2020-2022": 0.091,
      "2021-2023": 0.096,
      "2022-2024": 0.1083
    },
    "medianSeries": {
      "2006-2008": 0.116,
      "2007-2009": 0.1285,
      "2008-2010": 0.1375,
      "2009-2011": 0.141,
      "2010-2012": 0.1415,
      "2011-2013": 0.1413,
      "2012-2014": 0.139,
      "2013-2015": 0.1328,
      "2014-2016": 0.1269,
      "2015-2017": 0.1215,
      "2016-2018": 0.1112,
      "2017-2019": 0.108,
      "2018-2020": 0.1045,
      "2019-2021": 0.1016,
      "2020-2022": 0.1065,
      "2021-2023": 0.1145,
      "2022-2024": 0.1254
    },
    "policyLevers": "<ul class='cn-focus-list'><li><strong>Nutrition program access</strong> · USDA research found SNAP reduces food insecurity by roughly 30% and very low food security by 20% <a href=\"https://www.ers.usda.gov/publications/pub-details?pubid=84335\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; SNAP also lifted 7.3 million people above the poverty line in 2016, including 3.3 million children <a href=\"https://pmc.ncbi.nlm.nih.gov/articles/PMC6836787/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>. Changes to SNAP eligibility rules would affect coverage statewide.</li><li><strong>Local food production</strong> · Scaling local agriculture and reducing import dependence is the supply-side counterpart to SNAP <a href=\"https://www.fns.usda.gov/sites/default/files/resource-files/Statewide-Thrifty-Food-Plan-CostEstimate-for-Hawaii.pdf\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; the state created an Interagency Food Systems Working Group in 2025 to coordinate local production, but federal funding cuts put $64-175 million at risk <a href=\"https://dab.hawaii.gov/wp-content/uploads/2025/10/Act-100-2025-DAB_Annual-Report.pdf\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>.</li><li><strong>Household economic stability</strong> · The 2022-2024 uptick coincided with pandemic-era SNAP allotments returning to baseline alongside elevated grocery prices <a href=\"https://files.hawaii.gov/dbedt/annuals/2025/2025-read-self-sufficiency.pdf\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>.</li></ul>",
    "nextUpdate": "Sep",
    "rankHistoryNarrative": {
      "summary": "At the food-insecure level, Hawaiʻi has ranked between #8 and #13 for most of the past decade, reflecting robust federal nutrition program enrollment (SNAP, WIC, school meals) rather than low grocery prices. At the severe (very low food security) level, recent ranks land between #5 and #18, with the rate roughly one-third of the broader measure.",
      "mode": "protect",
      "benchmarks": [
        {
          "state": "Minnesota",
          "text": "Like Hawaiʻi, Minnesota uses strong federal nutrition program enrollment as the primary buffer against food cost pressure. Minnesota has ranked among the top five states in food security for most of the past decade. Minnesota's low food insecurity rate reflects high SNAP and WIC enrollment rates relative to eligible population, strong school meal participation better than the median, and a regional food bank network anchored by Second Harvest Heartland that operates one of the largest food distribution systems in the country. Minnesota also provides state-funded food assistance that supplements federal programs for residents who do not qualify for SNAP.",
          "source": {
            "label": "About Hunger in Minnesota and Wisconsin - Second Harvest Heartland",
            "url": "https://www.2harvest.org/about-us2/about-hunger"
          }
        }
      ],
      "explore": [
        "Minnesota's strength comes from robust safety-net enrollment; Arkansas shows what happens when access tightens. The 2022-2024 uptick coincided with the return to pre-pandemic SNAP allotments alongside elevated grocery prices, and Hawaiʻi's heavy import dependence amplified the effect."
      ],
      "caution": {
        "state": "Arkansas",
        "text": "Arkansas's experience shows the risk of tightening nutrition program access in a state where safety-net enrollment holds the line on food security. Arkansas implemented SNAP work requirements in 2018 through a federal waiver, requiring able-bodied adults without dependents to document work or job training activities to maintain benefits. In the year following implementation, SNAP enrollment declined sharply and food insecurity rates rose in affected counties. Arkansas illustrates that eligibility restrictions on nutrition assistance programs can worsen food security outcomes when the underlying economic conditions that make people eligible for assistance have not changed.",
        "source": {
          "label": "SNAP Work Requirements in Arkansas - Urban Institute",
          "url": "https://www.urban.org/research/publication/snap-work-requirements-arkansas-adults-without-dependents-or-disabilities"
        }
      }
    },
    "thresholdVariants": {
      "verylow": {
        "officialName": "3-year average share of households with very low food security, where household members reduced food intake because they could not afford enough food.",
        "unitLabel": "have very low food security (3-yr avg)",
        "hawaii": {
          "2006-2008": 0.03,
          "2007-2009": 0.039,
          "2008-2010": 0.05,
          "2009-2011": 0.056,
          "2010-2012": 0.056,
          "2011-2013": 0.0474,
          "2012-2014": 0.0404,
          "2013-2015": 0.0297,
          "2014-2016": 0.0301,
          "2015-2017": 0.029,
          "2016-2018": 0.0315,
          "2017-2019": 0.034,
          "2018-2020": 0.031,
          "2019-2021": 0.0312,
          "2020-2022": 0.027,
          "2021-2023": 0.036,
          "2022-2024": 0.0448
        },
        "medianSeries": {
          "2006-2008": 0.044,
          "2007-2009": 0.0495,
          "2008-2010": 0.0535,
          "2009-2011": 0.054,
          "2010-2012": 0.055,
          "2011-2013": 0.0549,
          "2012-2014": 0.0544,
          "2013-2015": 0.0534,
          "2014-2016": 0.0492,
          "2015-2017": 0.0465,
          "2016-2018": 0.0457,
          "2017-2019": 0.043,
          "2018-2020": 0.042,
          "2019-2021": 0.0394,
          "2020-2022": 0.0415,
          "2021-2023": 0.044,
          "2022-2024": 0.0486
        }
      }
    }
  },
  "rainy_day_fund_pct": {
    "area": "Infrastructure & Trust",
    "metric": "Rainy Day Fund",
    "officialName": "State rainy-day savings balance as a percent of annual general fund spending, as self-reported by states to NASBO.",
    "sourceCategory": "state-assoc",
    "unit": "%",
    "unitLabel": "% of general fund expenditures",
    "goodDirection": "up",
    "source": "NASBO Fiscal Survey",
    "sourceUrl": "https://www.nasbo.org/reports-data/fiscal-survey-of-states",
    "whyItMatters": "A strong rainy day fund means the state can keep running services during recessions and disasters without emergency cuts.",
    "howToRead": "Hawaiʻi held near zero through the early 2010s while the median climbed steadily. Starting around 2017, Hawaiʻi began building reserves. COVID drained the fund to 0.7% in 2020, followed by a steep climb, crossing the 10% recommended floor for the first time.",
    "potentialDrivers": "Hawaiʻi's rainy day fund crossed the 10% floor recommended by the Government Finance Officers Association in 2024 (14.1%) and held in 2025 (14.5%), the first sustained crossing on record. Hawaiʻi has <a href=\"https://budget.hawaii.gov/budget/about-budget/state-fiscal-reserves/\" target=\"_blank\" rel=\"noopener\">constitutional and statutory deposit rules</a>, but both have escape hatches. The constitution (Article VII, Section 6) requires the legislature to act when general fund balance exceeds 5% of revenues for two straight years, but allows three options: tax refund, fund deposit, or debt/pension prepayment. The statute (HRS 328L-3) auto-deposits 5% of balance only when revenue growth exceeds 5% in two straight years, and has never actually triggered. So every recent buildup, including the <a href=\"https://budget.hawaii.gov/wp-content/uploads/2024/12/37.-Appendix-7-Debt-Affordability-Study-FB25-27-PFP.7Lt.pdf\">$500 million in FY2023-24 transfers</a> and the <a href=\"https://www.staradvertiser.com/2026/05/06/hawaii-news/50m-deposit-proposed-for-hawaiis-state-rainy-day-fund/\">$50 million in 2026's SB2600</a>, has been a discretionary appropriation. Governor Green <a href=\"https://www.staradvertiser.com/2024/06/22/hawaii-news/gov-green-lines-up-17-bills-passed-by-hawaii-legislature-to-veto/\">vetoed similar deposits</a> of $500 million in 2023 and $300 million in 2024, citing Maui recovery and cost-of-living priorities. <a href=\"https://mauinow.com/2025/04/25/800-million-maui-wildfire-settlement-closes-in-on-final-approval-at-legislature/\">Maui wildfire settlement liabilities</a> are now concrete: $400 million in FY2026 and $407.5 million in FY2027 for the state's share of the $4 billion global settlement. Measurement note: <a href=\"https://higherlogicdownload.s3.amazonaws.com/NASBO/9d2d2db1-c943-4f1b-b750-0fca152d64c2/UploadedImages/Fiscal%20Survey/NASBO_Fall_2025_Fiscal_Survey_Tables_Notes_S.pdf\">NASBO's fall 2025 survey</a> puts HI total balances at 33%; this dashboard reads the narrower GFOA-comparable bucket.",
    "useConsolidated": true,
    "hawaii": {
      "2000": 0.00181,
      "2001": 0.0063,
      "2002": 0.01368,
      "2003": 0,
      "2004": 0.01406,
      "2005": 0.01293,
      "2006": 0.01143,
      "2007": 0.01143,
      "2008": 0.01369,
      "2009": 0.01124,
      "2010": 0.01302,
      "2011": 0.00201,
      "2012": 0.00439,
      "2013": 0.00427,
      "2014": 0.01326,
      "2015": 0.01406,
      "2016": 0.01466,
      "2017": 0.04159,
      "2018": 0.04814,
      "2019": 0.04778,
      "2020": 0.00733,
      "2021": 0.03649,
      "2022": 0.03685,
      "2023": 0.093,
      "2024": 0.141,
      "2025": 0.145
    },
    "medianSeries": {
      "2000": 0.0413,
      "2001": 0.0461,
      "2002": 0.0166,
      "2003": 0.0072,
      "2004": 0.0184,
      "2005": 0.0246,
      "2006": 0.0455,
      "2007": 0.0474,
      "2008": 0.0483,
      "2009": 0.0273,
      "2010": 0.0164,
      "2011": 0.0176,
      "2012": 0.0249,
      "2013": 0.0356,
      "2014": 0.0452,
      "2015": 0.0492,
      "2016": 0.0534,
      "2017": 0.0561,
      "2018": 0.0655,
      "2019": 0.0793,
      "2020": 0.0844,
      "2021": 0.1029,
      "2022": 0.1148,
      "2023": 0.1235,
      "2024": 0.1495,
      "2025": 0.131
    },
    "policyLevers": "<ul class='cn-focus-list'><li><strong>Deposit rules and structure</strong> · Pew research found that automatic surplus-deposit mechanisms, rather than annual appropriations decisions, are the strongest predictor of adequate reserves <a href=\"https://www.pew.org/en/research-and-analysis/articles/2025/03/27/state-rainy-day-fund-growth-slowed-in-fiscal-2024\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; 33 states cap reserves at inadequate levels, and some analysts recommend 15%+ of operating expenditures <a href=\"https://www.cbpp.org/research/why-and-how-states-should-strengthen-their-rainy-day-funds\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>.</li><li><strong>Spending discipline and drawdown</strong> · GFOA recommends a floor of two months of operating expenditures (roughly 16.7%) <a href=\"https://www.gfoa.org/materials/fund-balance-guidelines-for-the-general-fund\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; maintaining drawdown rules that restrict withdrawals to genuine emergencies protects reserves from legislative erosion <a href=\"https://budget.hawaii.gov/wp-content/uploads/2024/12/37.-Appendix-7-Debt-Affordability-Study-FB25-27-PFP.7Lt.pdf\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>.</li><li><strong>Revenue diversification</strong> · Narrowing the revenue base to one volatile industry leaves the fund vulnerable <a href=\"https://www.hawaiitourismauthority.org/media/14128/tourism-econ-impact-fact-sheet-january-2025.pdf\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; structural automatic-deposit rules tied to surplus are the strongest predictor of adequate reserves <a href=\"https://www.pew.org/en/research-and-analysis/articles/2024/09/19/states-prioritize-reserves-as-fiscal-flexibility-declines\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>.</li></ul>",
    "nextUpdate": "Jan",
    "rankHistoryNarrative": {
      "summary": "Hawaiʻi sat near the bottom of states for most of 26 years, with the fund empty in 2003 and below 2% through the 2010s. COVID drained it to 0.7% in 2020. Tourism revenue and discretionary deposits drove a rapid climb, crossing the 10% GFOA-recommended floor in 2024 (14.1%) and holding in 2025 (14.5%) for the first sustained crossing on record.",
      "mode": "learn",
      "benchmarks": [
        {
          "state": "North Carolina",
          "text": "Like Hawaiʻi, North Carolina lacked structural deposit rules until it enacted automatic surplus transfers that removed the decision from annual appropriations. North Carolina has ranked among the top states in rainy day fund adequacy for over a decade. State law requires that a fixed percentage of surplus revenues be automatically deposited into the Budget Stabilization Reserve each fiscal year, removing the deposit decision from the annual appropriations process. North Carolina's reserve balance grew steadily through the 2010s, and credit rating agencies cited the reserve structure in multiple upgrade decisions. Moody's upgraded North Carolina's bond rating citing fiscal reserves as a primary factor.",
          "source": {
            "label": "Moody's AAA Rating for North Carolina General Obligation Bonds - NC State Treasurer",
            "url": "https://www.nctreasurer.gov/news/press-releases/2025/04/02/treasurer-brad-briner-announces-moodys-aaa-rating-outstanding-general-obligation-bonds-nc"
          }
        }
      ],
      "explore": [
        "North Carolina's automatic deposit mechanism removed discretion; New Jersey's thin reserves compounded fiscal stress. Hawaiʻi's recent buildup was driven by tourism revenue recovery rather than a structural change to deposit rules, leaving the reserve vulnerable to appropriation. Island isolation and exposure to hurricanes, tsunamis, and volcanic events creates a stronger-than-average case for maintaining a large reserve."
      ],
      "caution": {
        "state": "New Jersey",
        "text": "Like Hawaiʻi before its recent buildup, New Jersey operated with chronically thin reserves that compounded fiscal stress through higher borrowing costs. New Jersey maintained a rainy day fund balance below 1 percent of general fund expenditures for most of the decade from 2010 to 2020, far worse than the median. Moody's and S&P both issued credit downgrades to New Jersey during this period, citing the thin reserve and structural budget imbalance as primary factors. Higher borrowing costs compounded the underlying fiscal stress, requiring larger debt service payments that further constrained the budget. New Jersey illustrates how chronically low reserves create a self-reinforcing cycle of fiscal pressure.",
        "source": {
          "label": "New Jersey's Shrinking Rainy Day Fund - New Jersey Policy Perspective",
          "url": "https://www.njpp.org/publications/blog-category/lets-not-forget-to-fix-new-jerseys-shrinking-rainy-day-fund/"
        }
      }
    }
  },
  "voter_participation_rate": {
    "area": "Infrastructure & Trust",
    "metric": "Voter Participation Rate",
    "officialName": "Share of eligible voters (citizens age 18+, excluding those barred from voting) who cast a ballot in the general election.",
    "sourceCategory": "academic",
    "unit": "%",
    "unitLabel": "of eligible voters cast a ballot",
    "goodDirection": "up",
    "source": "US Elections Project",
    "sourceUrl": "https://www.electproject.org/election-data/voter-turnout-data",
    "whyItMatters": "Voter participation shows whether residents are taking part in choosing the government that shapes daily life. Hawaiʻi has about 1.1 million voting-eligible residents, so each percentage point on this rate represents roughly 11,000 ballots cast or not cast.",
    "scale": {
      "denominator": 1100000,
      "denominatorRounded": 1100000,
      "unit": "voting-eligible residents",
      "countLabel": "ballots cast in a general election",
      "year": 2024,
      "source": "US Elections Project (VEP 2024)"
    },
    "howToRead": "The zigzag pattern reflects presidential years (higher turnout) vs. midterm elections (lower). Hawaiʻi has been worse than the median for over 40 years, and the gap has widened: 8 points in 1980, 15 points in 2024.",
    "potentialDrivers": "Hawaiʻi adopted all-mail voting and same-day registration, yet turnout ranks #50. Removing logistical barriers did not move the needle. Low electoral competition is the most likely driver. <a href=\"https://apnews.com/article/b0db5c6a5c3f5e1745c9b9cc646126f5\">AP reported in 2024</a> that only 279 candidates filed statewide, down from 330 in 2020 and more than 400 in 2022, with many legislative incumbents and several local officials running unopposed. <a href=\"https://uhero.hawaii.edu/wp-content/uploads/2023/02/Public-Campaign-Financing.pdf\">UHERO found in 2023</a> that Hawaiʻi's partial public financing system is ineffective at raising competition and that stronger electoral competition tends to directly increase voter mobilization and turnout. Access barriers are not the main cause: the <a href=\"https://elections.hawaii.gov/wp-content/uploads/Implementing-Elections-by-Mail-2024-Final.pdf\">Office of Elections reported in 2024</a> that mail ballot packets went out before both elections, same-day registration was available statewide, and more than 89,000 voters had enrolled in ballot tracking before the general election.",
    "countyNarrative": "Low turnout is a statewide pattern rather than a county-specific problem, and all four counties rank well below national norms. Honolulu County drives the overall figure by weight of population; competitive mayoral and city council races occasionally lift Oʻahu turnout modestly above the state average. Maui County has seen competitive local races in recent cycles, and post-wildfire civic engagement lifted 2024 turnout in some precincts. Hawaiʻi County and Kauaʻi County consistently post the state's lowest county-level turnout rates, reflecting smaller candidate fields and fewer competitive down-ballot contests relative to their voter rolls.",
    "useConsolidated": true,
    "dataNote": "Uses Voting Eligible Population (VEP) as denominator, not registered voters.",
    "hawaii": {
      "1980": 0.4916,
      "1982": 0.4848,
      "1984": 0.5032,
      "1986": 0.4816,
      "1988": 0.4979,
      "1990": 0.4595,
      "1992": 0.4818,
      "1994": 0.4659,
      "1996": 0.4515,
      "1998": 0.4958,
      "2000": 0.4398,
      "2002": 0.4436,
      "2004": 0.48,
      "2006": 0.3773,
      "2008": 0.4906,
      "2010": 0.4021,
      "2012": 0.4436,
      "2014": 0.3679,
      "2016": 0.4319,
      "2018": 0.3906,
      "2020": 0.5535,
      "2022": 0.4063,
      "2024": 0.5026
    },
    "medianSeries": {
      "1980": 0.5741,
      "1982": 0.4619,
      "1984": 0.5836,
      "1986": 0.4168,
      "1988": 0.5666,
      "1990": 0.4185,
      "1992": 0.6265,
      "1994": 0.4356,
      "1996": 0.5446,
      "1998": 0.4209,
      "2000": 0.5719,
      "2002": 0.4263,
      "2004": 0.6302,
      "2006": 0.4397,
      "2008": 0.642,
      "2010": 0.4395,
      "2012": 0.6036,
      "2014": 0.4056,
      "2016": 0.6173,
      "2018": 0.5146,
      "2020": 0.6684,
      "2022": 0.4728,
      "2024": 0.6466
    },
    "policyLevers": "<ul class='cn-focus-list'><li><strong>Electoral competition</strong> · Research finds each additional competitive party or candidate increases turnout by 3.5 to 6 percentage points <a href=\"https://link.springer.com/article/10.1007/s11109-022-09810-5\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; reforms such as open primaries or ranked-choice voting could raise effective competition <a href=\"https://apnews.com/article/b0db5c6a5c3f5e1745c9b9cc646126f5\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>.</li><li><strong>Access infrastructure</strong> · Colorado's all-mail voting increased turnout roughly 8 percentage points, with the largest gains among low-propensity voters <a href=\"https://pmc.ncbi.nlm.nih.gov/articles/PMC9756790/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; Hawaiʻi adopted all-mail voting in 2020 but ranks #50, suggesting logistical reform alone does not overcome low motivation to vote when races are uncompetitive.</li><li><strong>Candidate entry and civic engagement</strong> · Matching-fund public financing and lower contribution thresholds in other jurisdictions have increased candidate entry <a href=\"https://uhero.hawaii.edu/wp-content/uploads/2023/02/Public-Campaign-Financing.pdf\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; MIT Election Lab notes automatic voter registration increases registration but does not reliably translate to higher turnout without competitive elections <a href=\"https://electionlab.mit.edu/research/automatic-voter-registration\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>.</li></ul>",
    "nextUpdate": "Nov",
    "rankHistoryNarrative": {
      "summary": "Hawaiʻi has ranked near or at the bottom for four decades, holding #50 in every presidential election since 2004. All-mail voting (2020) produced no lasting increase, suggesting the barriers aren't about access or process.",
      "mode": "learn",
      "benchmarks": [
        {
          "state": "Colorado",
          "text": "Like Hawaiʻi, Colorado adopted all-mail voting, but paired it with automatic voter registration and competitive elections across the ballot. Colorado enacted universal vote-by-mail in 2013 (HB 1303) paired with same-day voter registration at voting service centers and automatic voter registration through the DMV. Colorado went from worse than average turnout in the early 2000s to consistently ranking in the top 10 by 2016. Approximately 15 to 20 percent of Colorado voters in recent elections registered on election day or in the final week, a direct result of same-day registration availability.",
          "source": {
            "label": "HB13-1303 Voter Access and Modernized Elections Act - ACLU of Colorado",
            "url": "https://www.aclu-co.org/legislation/hb13-1303-voter-access-modernized-elections-act"
          }
        }
      ],
      "explore": [
        "Colorado paired all-mail voting with automatic registration and competitive elections; Oregon's all-mail gains faded without those reinforcing factors. In Hawaiʻi, roughly 27 percent of residents speak a language other than English at home, a barrier some high-turnout states address through multilingual voter guides. Consistent one-party margins in statewide races also reduce the financial incentive for either party to invest in aggressive voter mobilization."
      ],
      "caution": {
        "state": "Oregon",
        "text": "Like Hawaiʻi, Oregon adopted all-mail voting but found that logistical reform alone did not sustain turnout gains over time. Oregon pioneered all-mail voting in 2000 and maintained better-than-average turnout for over a decade. Oregon's ranking has since declined as other states adopted mail voting without Oregon maintaining a comparable lead. Vote-by-mail removes logistical barriers for motivated voters but does not independently create the civic engagement that drives high turnout.",
        "source": {
          "label": "All-Mail Voting in Colorado Increases Turnout and Reduces Inequality - PMC/PNAS",
          "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC9756790/"
        }
      }
    }
  },
  "net_domestic_migration_rate": {
    "area": "Infrastructure & Trust",
    "metric": "Net Migration",
    "officialName": "Net inflow of U.S. residents moving from other states, per 10,000 residents; positive means more arrivals than departures.",
    "sourceCategory": "federal",
    "unit": "per 10K",
    "unitLabel": "net inflow per 10K residents",
    "goodDirection": "up",
    "source": "Census PEP",
    "sourceUrl": "https://www.census.gov/data/datasets/time-series/demo/popest/2020s-state-total.html",
    "whyItMatters": "Net migration is a verdict metric. Individual moves happen for many reasons, but in aggregate it may show whether people believe they can build a better life in Hawaiʻi or elsewhere.",
    "scale": {
      "denominator": 1441387,
      "denominatorRounded": 1440000,
      "unit": "residents",
      "countLabel": "net arrivals or departures a year",
      "year": 2023,
      "source": "Census NST-EST2024 (2023 estimate)"
    },
    "howToRead": "Hawaiʻi briefly had net inflow in 2003 but has been negative for most of the past two decades. The outflow peaked around 2022 and has since improved, though it remains well below zero.",
    "potentialDrivers": "This is the one metric you cannot spin. When thousands more leave than arrive each year, it reflects the cumulative weight of every other indicator on this dashboard. <a href=\"https://uhero.hawaii.edu/are-people-leaving-hawai%CA%BBi-because-of-high-prices-or-low-incomes/\">UHERO's 2026 analysis</a> found Hawaiʻi is both \"priced out\" and \"left behind\": high prices push residents toward cheaper mainland markets while slow income growth and limited industry diversity pull them away regardless of price. <a href=\"https://www.bea.gov/data/prices-inflation/regional-price-parities-state-and-metro-area\">BEA reported in early 2026</a> that Hawaiʻi had the nation's second-highest regional price level, and <a href=\"https://dbedt.hawaii.gov/hhfdc/hhps-landing-page/\">HHFDC found</a> a household needs $41.83 per hour to afford the average two-bedroom rent while the typical family earns $24.37. One important caveat: a <a href=\"https://uhero.hawaii.edu/who-is-moving-in-and-out-understanding-migration-trends-in-hawaii/\">separate UHERO study on migration flows</a> found that in-migration from abroad and return migration offset some domestic losses, so this metric alone understates overall population dynamics and does not capture international arrivals.",
    "countyNarrative": "The domestic migration loss is concentrated on Oʻahu: DBEDT's 2024 county population estimates show Honolulu County averaged a net domestic out-migration of roughly 6,400 residents per year from 2020 to 2024, reflecting the combination of high housing costs and limited industry diversity in the state's most densely settled county. Hawaiʻi County (Big Island) is the only county with consistent net domestic in-migration, averaging roughly 2,200 new domestic arrivals per year over the same period, as lower home prices attract residents priced out of Honolulu. Maui County's migration dynamics shifted significantly after the August 2023 wildfires, with fire-related displacement adding to underlying cost pressures. Kauaʻi County's small population makes annual migration figures volatile, but high costs relative to local wages create similar outmigration pressure.",
    "externalCitations": [
      {
        "id": "housing_wage_2023",
        "label": "$41.83",
        "source": "DBEDT Housing Affordability Analysis, Feb 2024",
        "sourceUrl": "https://dbedt.hawaii.gov/economic/files/2024/02/Housing-Affordability-February-2024.pdf",
        "lastVerified": "2026-05-17"
      },
      {
        "id": "renter_income_2023",
        "label": "$24.37",
        "source": "DBEDT Housing Affordability Analysis, Feb 2024",
        "sourceUrl": "https://dbedt.hawaii.gov/economic/files/2024/02/Housing-Affordability-February-2024.pdf",
        "lastVerified": "2026-05-17"
      }
    ],
    "useConsolidated": true,
    "dataNote": "Census population estimates; does not capture international migration.",
    "hawaii": {
      "2001": 0.9,
      "2002": 1.5,
      "2003": 16.7,
      "2004": -5.6,
      "2005": -14.2,
      "2006": -23.8,
      "2007": -72.6,
      "2008": -27.9,
      "2009": -38.9,
      "2010": -6.5,
      "2011": -6.5,
      "2012": -22.1,
      "2013": -5.5,
      "2014": -40.4,
      "2015": -48.1,
      "2016": -80.4,
      "2017": -101.3,
      "2018": -90.8,
      "2019": -97.4,
      "2021": -67.8,
      "2022": -109.7,
      "2023": -76.6,
      "2024": -64.6
    },
    "medianSeries": {
      "2001": 1.05,
      "2002": 0.9,
      "2003": 9.1,
      "2004": 5.55,
      "2005": 10.55,
      "2006": 12.2,
      "2007": 9.45,
      "2008": 1.2,
      "2009": 7.7,
      "2010": -0.3,
      "2011": -0.3,
      "2012": -6,
      "2013": -4.65,
      "2014": -11.85,
      "2015": -12.4,
      "2016": -12.1,
      "2017": -6.6,
      "2018": -3.65,
      "2019": -3,
      "2021": 19.2,
      "2022": 4.15,
      "2023": 7.7,
      "2024": 6.1
    },
    "policyLevers": "<ul class='cn-focus-list'><li><strong>Housing cost and supply</strong> · A 10% housing price increase raises out-migration by 1.4% <a href=\"https://www.nber.org/digest/202405/house-prices-and-declining-internal-migration-united-states\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; expanding housing supply is the most direct lever to slow domestic outflow <a href=\"https://dbedt.hawaii.gov/hhfdc/hhps-landing-page/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>.</li><li><strong>Income growth and industry mix</strong> · Broadening the economic base beyond tourism would address the income side of the affordability gap that drives out-migration <a href=\"https://uhero.hawaii.edu/are-people-leaving-hawai%CA%BBi-because-of-high-prices-or-low-incomes/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; DBEDT's diversification report identifies ocean-based industries, health care, and technology-enabled services as growth sectors <a href=\"https://files.hawaii.gov/dbedt/economic/data_reports/EconDiversification/Diversification2024.pdf\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>.</li><li><strong>Quality-of-life retention</strong> · States with net domestic inflow combine housing affordability with job diversity; Hawaiʻi County is the only county with consistent net domestic in-migration, reflecting lower home prices <a href=\"https://uhero.hawaii.edu/beyond-the-price-of-paradise-is-hawaii-being-left-behind/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; international and return migration partially offset domestic losses but are not captured in this metric.</li></ul>",
    "nextUpdate": "Dec",
    "rankHistoryNarrative": {
      "summary": "Hawaiʻi was near the national midpoint through 2003, shifted into growing outflow by 2007, and has ranked at or near last every year since 2016. A brief COVID-era recovery reversed sharply by 2022.",
      "mode": "learn",
      "benchmarks": [
        {
          "state": "Utah",
          "text": "Like Hawaiʻi, Utah faced rising housing costs that threatened population retention and responded with state-level supply reforms. Utah maintained positive net domestic in-migration through a period of rapid housing cost increases through state-level supply reforms from 2022 to 2024. HB 462 required cities to allow accessory dwelling units by right statewide, and SB 174 required higher-density zoning near transit corridors. Utah consistently ranked among the top states for new housing permits per capita following these reforms.",
          "source": {
            "label": "HB 0462 Housing Affordability Amendments (2022) - Utah State Legislature",
            "url": "https://le.utah.gov/~2022/bills/static/HB0462.html"
          }
        }
      ],
      "explore": [
        "Utah retained population through supply-side housing reforms; California's reforms did not overcome structural costs. Hawaiʻi has significant state-controlled land under DHHL, OHA, and DLNR that could accommodate workforce housing without rezoning private parcels. On neighbor islands, out-migration reflects not only housing cost but the absence of professional-grade employment beyond hospitality and government."
      ],
      "caution": {
        "state": "California",
        "text": "Like Hawaiʻi, California enacted zoning mandates but continued losing domestic population because structural costs outpaced the reforms. California enacted statewide zoning mandates (SB 9, SB 10, ADU reform) and declared repeated housing crises over more than a decade. Domestic population loss has continued because state-level zoning mandates were not matched with permit streamlining or environmental review reform. Projects permitted under new state law still took three to seven years to break ground.",
        "source": {
          "label": "U.S. Population Growth Has Nearly Flatlined - Brookings Institution",
          "url": "https://www.brookings.edu/articles/u-s-population-growth-has-nearly-flatlined-new-census-data-shows/"
        }
      }
    }
  },
  "estabs_entry_rate": {
    "area": "Economy & Workforce",
    "metric": "New Business Entry Rate",
    "officialName": "Share of all business establishments in the state that opened in the past year, measuring the pace of new business formation.",
    "sourceCategory": "federal",
    "unit": "%",
    "unitLabel": "of establishments are new firms",
    "goodDirection": "up",
    "source": "Census Business Dynamics Statistics",
    "sourceUrl": "https://www.census.gov/programs-surveys/bds.html",
    "whyItMatters": "New business entry shows whether the state is creating new employers and job opportunities. Hawaiʻi has about 34,000 employer establishments, so each percentage point on this rate represents roughly 340 new employer firms in a year.",
    "scale": {
      "denominator": 34000,
      "denominatorRounded": 34000,
      "unit": "employer establishments",
      "countLabel": "new employer firms in a year",
      "year": 2023,
      "source": "Census Business Dynamics Statistics 2023"
    },
    "howToRead": "Hawaiʻi has been worse than the median since the mid-1990s, with no sustained closing of the gap.",
    "potentialDrivers": "Business entry (#37) and net employer formation (#43) are both worse than average while net migration is #50. Without new employers, there are fewer paths to stay. High costs appear to be the primary barrier: <a href=\"https://dbedt.hawaii.gov/blog/24-57/\">DBEDT reported</a> Honolulu inflation at 4.2 percent in September 2024, with housing costs up 6.6 percent year over year and population still expected to decline. A <a href=\"https://dbedt.hawaii.gov/economic/files/2025/04/Group-3.-Business-Cost.pdf\">2025 DBEDT task force</a> found that Hawaiʻi's high cost of living forces firms to pay elevated wages that still carry low real purchasing power, making both recruitment and operations harder. <a href=\"https://www.eia.gov/electricity/data/state/\" target=\"_blank\" rel=\"noopener\">EIA data</a> show Hawaiʻi has the nation's highest electricity rates for both residential and commercial customers, a cost that compounds the wage and space pressures on businesses operating in the state. One caveat: this metric counts employer establishments only, and <a href=\"https://www.census.gov/quickfacts/fact/table/HI/NES010223\">Census QuickFacts</a> shows Hawaiʻi had more nonemployer than employer businesses in 2023, so the rate may understate broader entrepreneurial activity in the state.",
    "countyNarrative": "Honolulu County consistently posts the lowest business entry rate among the four counties, reflecting its higher concentration of established businesses, more competitive commercial real estate market, and a larger regulatory environment. The neighbor islands generally show higher rates in part because a smaller existing business stock amplifies each new entrant as a share of the total. Maui County posted the largest 2022 surge (14.2 percent) as tourism-sector entrepreneurs moved into the post-pandemic reopening, then moderated to 10.0 percent in 2023 as wildfire disruption in West Maui created uncertainty for new formation. Kauaʻi County saw a similar 2022 spike (14.9 percent) driven by tourism recovery, returning to near-average levels by 2023. Hawaiʻi County's rate runs modestly above Honolulu's across most years, reflecting a smaller existing base and opportunity in agriculture, small-scale tourism, and home-based services.",
    "useConsolidated": true,
    "hawaii": {
      "1978": 16.491,
      "1979": 16.049,
      "1980": 15.097,
      "1981": 14.444,
      "1982": 12.74,
      "1983": 14.362,
      "1984": 12.833,
      "1985": 12.185,
      "1986": 13.323,
      "1987": 14.216,
      "1988": 14.219,
      "1989": 13.052,
      "1990": 13.015,
      "1991": 13.34,
      "1992": 11.006,
      "1993": 10.412,
      "1994": 10.304,
      "1995": 10.474,
      "1996": 10.225,
      "1997": 10.442,
      "1998": 9.662,
      "1999": 9.474,
      "2000": 9.483,
      "2001": 9.925,
      "2002": 11.09,
      "2003": 10.325,
      "2004": 10.131,
      "2005": 10.308,
      "2006": 11.365,
      "2007": 10.063,
      "2008": 8.762,
      "2009": 8.461,
      "2010": 8.017,
      "2011": 8.087,
      "2012": 7.944,
      "2013": 8.506,
      "2014": 8.487,
      "2015": 8.422,
      "2016": 8.778,
      "2017": 8.454,
      "2018": 8.346,
      "2019": 8.449,
      "2020": 7.802,
      "2021": 8.618,
      "2022": 11.354,
      "2023": 9.199
    },
    "medianSeries": {
      "1978": 15.1355,
      "1979": 14.082,
      "1980": 12.298,
      "1981": 12.0155,
      "1982": 11.912,
      "1983": 13.165,
      "1984": 14.7885,
      "1985": 13.694,
      "1986": 13.497,
      "1987": 14.2395,
      "1988": 13.8785,
      "1989": 12.994,
      "1990": 12.0535,
      "1991": 12.0425,
      "1992": 11.2825,
      "1993": 11.337,
      "1994": 11.7205,
      "1995": 11.9,
      "1996": 11.6255,
      "1997": 11.8685,
      "1998": 11.1425,
      "1999": 10.787,
      "2000": 10.3975,
      "2001": 10.499,
      "2002": 11.4475,
      "2003": 10.9525,
      "2004": 10.83,
      "2005": 10.78,
      "2006": 11.7155,
      "2007": 11.14,
      "2008": 9.685,
      "2009": 8.781,
      "2010": 8.666,
      "2011": 9.113,
      "2012": 9.2945,
      "2013": 8.9495,
      "2014": 9.135,
      "2015": 9.184,
      "2016": 9.5165,
      "2017": 8.8115,
      "2018": 8.388,
      "2019": 8.7665,
      "2020": 8.738,
      "2021": 9.8775,
      "2022": 10.7275,
      "2023": 9.8875
    },
    "policyLevers": "<ul class='cn-focus-list'><li><strong>Regulatory and licensing burden</strong> · Nearly 30% of U.S. workers require an occupational license, associated with an estimated 2.8 million fewer jobs nationally <a href=\"https://www.brookings.edu/articles/nearly-30-percent-of-workers-in-the-u-s-need-a-license-to-perform-their-job-it-is-time-to-examine-occupational-licensing-practices/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; Hawaiʻi's General Excise Tax applies to gross receipts at every supply-chain stage, putting local firms at higher costs at every step of the supply chain. <a href=\"https://advocacy.sba.gov/2019/08/19/hawaiis-general-excise-tax-puts-local-small-business-at-a-disadvantage/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li><li><strong>Access to capital</strong> · Kauffman Foundation data show U.S. startup rates have been flat for 20 years, with capital access as a primary constraint for women, minorities, and rural entrepreneurs <a href=\"https://indicators.kauffman.org/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; Hawaiʻi's HI-CAP program channels $62 million in federal small-business lending funds to expand lending to small businesses through 2030. <a href=\"https://www.htdc.org/funding/hi-cap/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li><li><strong>Tax climate and startup costs</strong> · Hawaiʻi ranks in the bottom 10 of the Tax Foundation's State Business Tax Climate Index, reflecting complex multi-layer taxation <a href=\"https://taxfoundation.org/research/all/state/2024-state-business-tax-climate-index/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; 99.3% of Hawaiʻi firms are small businesses employing half the private workforce, so entry-rate gains depend on reducing fixed startup costs. <a href=\"https://advocacy.sba.gov/wp-content/uploads/2024/11/Hawaii.pdf\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li></ul>",
    "nextUpdate": "Dec",
    "rankHistoryNarrative": {
      "summary": "Hawaiʻi ranked in the top 10 to 20 in the early 1980s and has underperformed for nearly 30 years, oscillating between #27 and #46. The 2022 post-reopening bounce (#19) normalized back to #37 in 2023.",
      "mode": "learn",
      "benchmarks": [
        {
          "state": "Ohio",
          "text": "Like Hawaiʻi, Ohio needed to create new employer formation pathways beyond its legacy industries. Ohio launched the Ohio Third Frontier program in 2002, a 10-year $1.4 billion state investment in technology commercialization infrastructure, early-stage capital access, and STEM startup formation. Rather than subsidizing individual companies directly, Third Frontier funded commercialization accelerators at universities and early-stage venture funds that co-invested with private capital. Ohio's technology startup formation rate increased substantially over the program's first decade, building clusters in biomedical devices, advanced materials, and clean energy.",
          "source": {
            "label": "Ohio Third Frontier Program Overview - Ohio Manufacturing Association",
            "url": "https://www.ohiomfg.com/wp-content/uploads/2024/02/ohio_third_frontier_program_overview.pdf"
          }
        }
      ],
      "explore": [
        "Ohio invested in technology infrastructure; Connecticut shows that spending alone does not overcome high operating costs. In Hawaiʻi, over 20 percent of workers require a state occupational license, and the GET's cascading structure applies at each stage of a supply chain, making multi-vendor businesses uniquely expensive relative to states with simple sales taxes."
      ],
      "caution": {
        "state": "Connecticut",
        "text": "Like Hawaiʻi, Connecticut has high operating costs and regulatory complexity that suppress new business entry despite targeted state investment. Connecticut has chronic low new establishment formation rates despite significant state investment in business development programs and targeted sector incentives. State analyses found that entry-level barriers, including complex multi-agency permitting and high workers' compensation costs, deter formation regardless of incentives offered downstream. Incentive programs that benefit established businesses do not address friction that prevents formation.",
        "source": {
          "label": "Business Dynamics Statistics - U.S. Census Bureau",
          "url": "https://www.census.gov/programs-surveys/bds.html"
        }
      }
    }
  },
  "net_employer_formation": {
    "area": "Economy & Workforce",
    "metric": "Net Employer Business Formation",
    "officialName": "Net new employer businesses as a share of existing stock; new businesses opened minus closures, scaled to state size.",
    "sourceCategory": "federal",
    "unit": "%",
    "unitLabel": "net % change in employer firms",
    "goodDirection": "up",
    "source": "Census Business Dynamics Statistics",
    "sourceUrl": "https://www.census.gov/programs-surveys/bds.html",
    "whyItMatters": "Net business formation shows whether Hawaiʻi is adding more employer firms than it is losing. Hawaiʻi has about 34,000 employer establishments, so each percentage point on this rate represents roughly 340 firms' worth of net change.",
    "scale": {
      "denominator": 34000,
      "denominatorRounded": 34000,
      "unit": "employer establishments",
      "countLabel": "firms' worth of net change in a year",
      "year": 2023,
      "source": "Census Business Dynamics Statistics 2023"
    },
    "howToRead": "A positive number means more employer businesses opened than closed that year. Hawaiʻi has been worse than the median in most years and dips below zero in downturns.",
    "potentialDrivers": "Hawaiʻi’s entry rate (#37) is only modestly worse than average, but net formation (#43) lags further, meaning businesses close faster than they open. A <a href=\"https://www.fedsmallbusiness.org/-/media/project/clevelandfedtenant/fsbsite/reports/2025/2025-firms-in-focus-chartbooks/sbcs_chartbook2025_hawaii.pdf\">2025 Federal Reserve employer survey</a> found 79 percent of Hawaiʻi businesses reported increased costs, 55 percent struggled to hire or retain qualified staff, and 36 percent cited government regulation as a challenge. Tourism-related sectors reached only 90 percent of pre-pandemic levels through mid-2023, and the August 2023 wildfires caused <a href=\"https://dbedt.hawaii.gov/blog/24-14/\">Maui visitor arrivals and spending to fall 41.4 and 31.1 percent</a> in the final five months of the year. A statewide <a href=\"https://dbedt.hawaii.gov/hhfdc/hhps-landing-page/\" target=\"_blank\" rel=\"noopener\">housing shortage of more than 64,000 units</a> and rents that rose 15.5 percent from 2019 to 2023 add further pressure on businesses competing for workers and space. Because this is a net measure combining new openings minus closures, the 2023 reading may also reflect more exits rather than fewer startups, making a single cause difficult to isolate.",
    "countyNarrative": "Honolulu County has the weakest net employer formation of the four counties, with the rate hovering near zero in most recent years and turning sharply negative during the 2020 to 2021 pandemic period (-1.4 and -3.8 percent). Honolulu's large established business base creates a higher denominator but also more structural attrition, and the county's high commercial rents and costs compress survival rates for early-stage employers. The neighbor islands are more volatile in both directions: Maui and Kauaʻi both fell deeper than Honolulu during the 2021 trough (Maui -4.1, Kauaʻi -5.4 percent) but rebounded more strongly in 2022 as tourism-sector businesses reopened and expanded (Maui 5.7, Kauaʻi 7.2 percent). Maui County's 2023 reading (1.1 percent) held above Honolulu despite wildfire disruption in West Maui. Hawaiʻi County showed a steadier recovery pattern than the other neighbor islands, with positive net formation in both 2022 and 2023.",
    "useConsolidated": true,
    "hawaii": {
      "1978": 5.365,
      "1979": 6.024,
      "1980": 4.775,
      "1981": 2.923,
      "1982": 0,
      "1983": 3.402,
      "1984": 1.708,
      "1985": 0.401,
      "1986": 2.559,
      "1987": 2.769,
      "1988": 3.526,
      "1989": 2.756,
      "1990": 3.174,
      "1991": 3.017,
      "1992": 0.452,
      "1993": -0.485,
      "1994": -0.073,
      "1995": 0.684,
      "1996": -0.515,
      "1997": -0.458,
      "1998": -0.651,
      "1999": -0.51,
      "2000": 0.672,
      "2001": 1.18,
      "2002": 0.833,
      "2003": 1.448,
      "2004": 1.927,
      "2005": 2.206,
      "2006": 3.482,
      "2007": 0.608,
      "2008": -0.739,
      "2009": -1.511,
      "2010": -1.571,
      "2011": -0.899,
      "2012": -0.718,
      "2013": 0.298,
      "2014": 0.685,
      "2015": 0.461,
      "2016": 1.337,
      "2017": 0.456,
      "2018": 0.583,
      "2019": 0.744,
      "2020": -0.962,
      "2021": -3.575,
      "2022": 2.708,
      "2023": 0.414
    },
    "medianSeries": {
      "1978": 4.214,
      "1979": 3.2085,
      "1980": 0.816,
      "1981": 0.8095,
      "1982": -0.3425,
      "1983": 1.755,
      "1984": 4.099,
      "1985": 1.2435,
      "1986": 2.4075,
      "1987": 2.317,
      "1988": 2.3115,
      "1989": 2.1225,
      "1990": 1.833,
      "1991": 1.0085,
      "1992": 0.7745,
      "1993": 1.757,
      "1994": 2.127,
      "1995": 2.3375,
      "1996": 1.7115,
      "1997": 1.2025,
      "1998": 1.2545,
      "1999": 0.6275,
      "2000": 0.683,
      "2001": 0.3435,
      "2002": 0.5355,
      "2003": 1.1325,
      "2004": 1.573,
      "2005": 1.4145,
      "2006": 1.9455,
      "2007": 1.0465,
      "2008": -0.6805,
      "2009": -2.449,
      "2010": -1.085,
      "2011": -0.411,
      "2012": 0.295,
      "2013": 0.387,
      "2014": 0.692,
      "2015": 0.9475,
      "2016": 1.5375,
      "2017": 0.1385,
      "2018": 0.1935,
      "2019": 0.832,
      "2020": -0.026,
      "2021": 0.7935,
      "2022": 1.711,
      "2023": 1.0485
    },
    "policyLevers": "<ul class='cn-focus-list'><li><strong>Business survival rates</strong> · BLS data show roughly 20% of new establishments close within one year and half close within five years <a href=\"https://www.bls.gov/bdm/bdmage.htm\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; Hawaiʻi's 2024 SBA profile recorded 4,609 openings against 4,813 closures, a net loss of 204 establishments. <a href=\"https://advocacy.sba.gov/wp-content/uploads/2024/11/Hawaii.pdf\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li><li><strong>Operating cost burden</strong> · The cascading General Excise Tax adds to operating costs at every transaction layer <a href=\"https://advocacy.sba.gov/2019/08/19/hawaiis-general-excise-tax-puts-local-small-business-at-a-disadvantage/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; commercial rents on Oʻahu averaged $3.46/sf per month for office space, compounding fixed-cost pressure on small operators. <a href=\"https://www.cbre.com/insights/figures/hawaii-industrial-figures-q2-2024\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li><li><strong>Market access and ecosystem</strong> · States with denser industry networks generate more firm births through supply-chain linkages and idea-sharing between firms <a href=\"https://www.census.gov/programs-surveys/bds.html\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; UHERO identifies ocean-based industries and creative media as diversification paths where existing firms can seed related startups. <a href=\"https://uhero.hawaii.edu/potential-opportunities-to-diversify-the-economy-of-hawai%CA%BBi/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li></ul>",
    "nextUpdate": "Dec",
    "rankHistoryNarrative": {
      "summary": "The most cyclical metric on this dashboard: Hawaiʻi has swung from top 5 to #50 across tourism cycles. The formation rate tracks visitor arrivals more closely than any other economic indicator.",
      "mode": "learn",
      "benchmarks": [
        {
          "state": "Florida",
          "text": "Unlike Hawaiʻi, Florida reduced structural barriers to business registration and operation rather than relying on targeted incentives. Florida consistently ranks among the top five states for new employer business formation. Florida streamlined its business registration to a one-business-day approval cycle at $125 to $138 per entity, among the lowest combined costs in the country. Florida also operates one of the largest small business development center (SBDC) networks in the US, with 41 locations providing free consulting to early-stage businesses.",
          "source": {
            "label": "Florida SBDC Network - floridasbdc.org",
            "url": "https://floridasbdc.org/"
          }
        }
      ],
      "explore": [
        "Florida reduced structural barriers; Louisiana's sector-specific incentives did not produce lasting formation. Hawaiʻi's own experience echoes this: Act 221 (2001-2010) provided high-technology tax credits, but state audits found roughly $4 in credits for each $1 of qualifying investment retained. The 2023 Maui fires added urgency, with $5.5 billion in economic losses and a recovery plan that includes formation support for Lahaina-area entrepreneurs."
      ],
      "caution": {
        "state": "Louisiana",
        "text": "Louisiana's experience shows that sector-specific tax incentives do not produce lasting net employer growth when the underlying cost structure remains high. Louisiana invested over $250 million per year in film and entertainment tax incentives starting in 2002 to stimulate business formation beyond oil and gas. State legislative auditor reviews estimated the program cost $17 in incentives per $1 of lasting economic activity. Louisiana's overall employer formation rate remained in the bottom quarter throughout the incentive period.",
        "source": {
          "label": "Motion Picture Production Program - Louisiana Entertainment",
          "url": "https://www.louisianaentertainment.gov/film/motion-picture-production-program"
        }
      }
    }
  },
  "labor_productivity": {
    "area": "Economy & Workforce",
    "metric": "Labor Productivity",
    "officialName": "Real economic output per hour worked, measuring how efficiently the workforce produces goods and services. Values show output relative to the 2017 level (100 = same as 2017).",
    "sourceCategory": "federal",
    "unit": "% of 2017 level",
    "unitLabel": "% of 2017 level",
    "goodDirection": "up",
    "source": "Bureau of Labor Statistics",
    "sourceUrl": "https://www.bls.gov/lpc/state-productivity.htm",
    "whyItMatters": "Productivity shows how much the economy produces per hour of work. When productivity rises, wages can rise too.",
    "howToRead": "100 = the 2017 level. Above 100 means more output per hour than in 2017; below 100 means less.",
    "potentialDrivers": "Productivity lags because the economy is concentrated in tourism, government, and low-wage service sectors. Until output per worker rises, wages are unlikely to keep pace with the cost of living. <a href=\"https://uhero.hawaii.edu/beyond-the-price-of-paradise-is-hawaii-being-left-behind/\">UHERO found</a> that tourism, retail, and accommodation are labor-intensive and produce less value per hour than technology or finance, and <a href=\"https://www.bls.gov/opub/mlr/2025/article/industry-growth-patterns-a-closer-look-at-output-productivity-and-hours-worked-from-1990-to-2024.htm\">BLS confirmed</a> accommodation and food services is the one major sector where long-run growth is driven more by hours than by productivity gains. <a href=\"https://dbedt.hawaii.gov/economic/files/2025/06/Hawaii-General-Economic-Competitiveness-Report-2025-draft.pdf\">DBEDT placed Hawaiʻi</a> in a low-growth, low-productivity cluster, with R&D value added at just 0.5 percent of GDP. <a href=\"https://www.eia.gov/states/HI/analysis\">The nation's highest electricity prices</a> add further cost pressure that discourages capital investment.",
    "useConsolidated": true,
    "hawaii": {
      "2007": 90.069,
      "2008": 89.594,
      "2009": 92.126,
      "2010": 94.877,
      "2011": 94.979,
      "2012": 92.003,
      "2013": 94.96,
      "2014": 92.882,
      "2015": 96.448,
      "2016": 98.714,
      "2017": 100,
      "2018": 102.896,
      "2019": 103.744,
      "2020": 107.703,
      "2021": 107.763,
      "2022": 104.966,
      "2023": 102.353,
      "2024": 105.226
    },
    "medianSeries": {
      "2007": 87.6095,
      "2008": 89.4445,
      "2009": 92.0985,
      "2010": 95.503,
      "2011": 95.7855,
      "2012": 95.4495,
      "2013": 95.3205,
      "2014": 97.854,
      "2015": 98.4505,
      "2016": 99.2285,
      "2017": 100,
      "2018": 101.335,
      "2019": 102.596,
      "2020": 106.7245,
      "2021": 108.193,
      "2022": 107.5875,
      "2023": 109.326,
      "2024": 111.656
    },
    "policyLevers": "<ul class='cn-focus-list'><li><strong>Sector composition</strong> · Tourism-heavy economies concentrate employment in accommodation and food service, which have lower output per hour than information or professional services <a href=\"https://www.bls.gov/news.release/prin4.htm\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; UHERO identifies ocean-based industries, tech services, and creative media as diversification paths with higher value-added potential. <a href=\"https://uhero.hawaii.edu/potential-opportunities-to-diversify-the-economy-of-hawai%CA%BBi/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li><li><strong>Broadband and digital adoption</strong> · Cross-country research finds a roughly 21% average rate of return on broadband infrastructure investment through productivity gains <a href=\"https://www.itu.int/ITU-D/treg/broadband/ITU-BB-Reports_Impact-of-Broadband-on-the-Economy.pdf\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; firm-level analysis confirms improved broadband directly raises labor productivity, particularly in remote areas. <a href=\"https://www.infrastructure.gov.au/sites/default/files/documents/bcarr-research-paper-productivity-impacts-from-improved-broadband-firm-level-analysis-march2023_0.pdf\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li><li><strong>Workforce skills and training</strong> · Sector-focused training programs persistently raise participant earnings 12-34%, signaling genuine productivity gains <a href=\"https://www.mdrc.org/work/publications/sector-strategies-workforce-development\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a>; Hawaiʻi's non-tourism sectors (information +40%, professional services +27%) have already outgrown pre-pandemic GDP. <a href=\"https://dbedt.hawaii.gov/economic/qser/outlook-economy/\" target=\"_blank\" rel=\"noopener\" class=\"cn-cite\">↗</a></li></ul>",
    "nextUpdate": "Jun",
    "rankHistoryNarrative": {
      "summary": "Hawaiʻi's rank swung from #7 in 2018 to #48 in 2023 before settling at #46 in 2024. The volatility reflects tourism's outsized role in GDP: visitor spending moves output faster than hours worked can adjust.",
      "mode": "learn",
      "benchmarks": [
        {
          "state": "Massachusetts",
          "text": "Unlike Hawaiʻi, Massachusetts deliberately concentrated public investment in high-output sectors rather than supporting existing low-productivity industries. Massachusetts has ranked #1 or #2 in labor productivity for most of the past two decades through deliberate concentration in sectors with high output per hour: biotechnology, medical devices, financial technology, and defense research. Massachusetts created the Massachusetts Life Sciences Center in 2008, a 10-year $1 billion initiative funding research infrastructure, workforce training, and company formation. The program is credited with establishing Massachusetts as the dominant US biotech hub outside of San Diego.",
          "source": {
            "label": "Massachusetts Life Sciences Center - masslifesciences.com",
            "url": "https://www.masslifesciences.com/"
          }
        }
      ],
      "explore": [
        "Massachusetts concentrated investment in high-output sectors; Nevada shows headline employer wins do not shift productivity when the dominant sector stays low-output. Hawaiʻi has pockets of high-value activity including HURL, HIMB, and NOAA Pacific facilities in ocean technology, but the 2023 Maui wildfires destroyed roughly 3,000 structures and likely contributed to the sharp productivity drop from #34 in 2022 to #48 in 2023."
      ],
      "caution": {
        "state": "Nevada",
        "text": "Like Hawaiʻi, Nevada's economy is dominated by tourism and hospitality, keeping output per worker low despite headline employer wins. Nevada spent two decades attracting high-profile employers including the Tesla Gigafactory (2014) and the Raiders stadium (2020). Nevada's labor productivity has remained stuck in the bottom quartile because gaming and hospitality still employ the majority of the workforce. Individual large-employer announcements do not shift the productivity distribution unless they generate enough employment in high-value sectors to change the aggregate.",
        "source": {
          "label": "State and Metro Area Labor Productivity - Bureau of Labor Statistics",
          "url": "https://www.bls.gov/lpc/state-productivity.htm"
        }
      }
    }
  }
};
